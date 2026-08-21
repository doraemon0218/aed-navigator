"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getUser } from "@/lib/user";
import { addStamp, hasStamp, validateStampToken } from "@/lib/stamps";
import { getPersonality } from "@/lib/aedPersonalities";
import { addTip, getTipsForAED } from "@/lib/tips";
import { saveTipSummary } from "@/lib/tipSummary";
import { setAEDAccess, type AccessLevel } from "@/lib/aedAccess";
import { haversineDistance } from "@/lib/distance";
import type { AEDLocation } from "@/app/api/aed/route";

const GPS_BASE_THRESHOLD_M = 20; // strict: must be within 20m (prevents remote abuse)

type GpsStatus = "idle" | "checking" | "ok" | "far" | "error";
type Phase = "loading" | "steps" | "done" | "already" | "invalid";

function StampContent() {
  const params = useSearchParams();
  const router = useRouter();

  const aedId    = params.get("id")  ?? "";
  const token    = params.get("s")   ?? "";
  const aedLat   = parseFloat(params.get("lat") ?? "NaN");
  const aedLng   = parseFloat(params.get("lng") ?? "NaN");
  const hasCoords = !isNaN(aedLat) && !isNaN(aedLng);

  const [phase, setPhase] = useState<Phase>("loading");
  const [pointsEarned, setPointsEarned] = useState(0);
  const [aed, setAed] = useState<AEDLocation | null>(null);
  const [tip, setTip] = useState("");
  const [tipSaved, setTipSaved] = useState(false);
  const [existingTips, setExistingTips] = useState<ReturnType<typeof getTipsForAED>>([]);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [gpsDistM, setGpsDistM] = useState<number | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [accessLevel, setAccessLevel] = useState<AccessLevel | null>(null);

  const personality = getPersonality(aedId);

  useEffect(() => {
    if (!aedId || !token) { setPhase("invalid"); return; }
    if (!validateStampToken(aedId, token)) { setPhase("invalid"); return; }

    const user = getUser();
    if (!user) {
      localStorage.setItem("pending_stamp", JSON.stringify({ aedId, token }));
      router.replace("/onboarding");
      return;
    }

    fetch("/api/aed")
      .then((r) => r.json())
      .then((data) => {
        const found = (data.aeds as AEDLocation[])?.find((a) => a.id === aedId);
        if (found) setAed(found);
      })
      .catch(() => {});

    setExistingTips(getTipsForAED(aedId));

    if (hasStamp(aedId)) {
      setPhase("already");
    } else {
      setPhase("steps");
    }
  }, [aedId, token, router]);

  const checkGPS = useCallback(() => {
    if (!navigator.geolocation) { setGpsStatus("error"); return; }
    setGpsStatus("checking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!hasCoords) {
          setGpsStatus("ok");
          setGpsDistM(0);
          return;
        }
        const dist = Math.round(haversineDistance(pos.coords.latitude, pos.coords.longitude, aedLat, aedLng));
        const accuracy = Math.round(pos.coords.accuracy);
        // Dynamic threshold: at least GPS_BASE_THRESHOLD_M, or the device's reported accuracy if larger
        const threshold = Math.max(GPS_BASE_THRESHOLD_M, accuracy);
        setGpsDistM(dist);
        setGpsAccuracy(accuracy);
        setGpsStatus(dist <= threshold ? "ok" : "far");
      },
      () => setGpsStatus("error"),
      { timeout: 10000, enableHighAccuracy: true }
    );
  }, [aedLat, aedLng, hasCoords]);

  const saveTip = useCallback(async () => {
    if (tip.trim().length < 3) return;
    const user = getUser();
    if (!user) return;
    addTip(aedId, tip.trim(), user.name);
    if (accessLevel) setAEDAccess(aedId, accessLevel);
    setTipSaved(true);
    const updated = getTipsForAED(aedId);
    setExistingTips(updated);
    // Summarize all tips via Gemini and cache locally
    try {
      const res = await fetch("/api/summarize-tip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tips: updated.map((t) => t.text) }),
      });
      const data = await res.json() as { summary: string | null };
      if (data.summary) saveTipSummary(aedId, data.summary);
    } catch {}
  }, [aedId, tip]);

  const gpsOk  = gpsStatus === "ok";
  const tipOk  = tipSaved;
  const allOk  = gpsOk && tipOk;

  const claimStamp = useCallback(() => {
    if (!allOk) return;
    const pts = addStamp(aedId, "qr");
    setPointsEarned(pts);
    setPhase("done");
  }, [allOk, aedId]);

  const aedName = aed?.name ?? aedId;
  const user = getUser();

  // ─── Invalid ────────────────────────────────────────────────────────────────
  if (phase === "invalid") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-6 gap-6 text-center">
        <div className="text-6xl">❌</div>
        <h1 className="text-xl font-black">無効なQRコード</h1>
        <p className="text-gray-400 text-sm">このQRコードは認識できませんでした。</p>
        <button onClick={() => router.replace("/")} className="py-3 px-8 rounded-xl bg-gray-700 text-white font-semibold">
          ホームに戻る
        </button>
      </div>
    );
  }

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Already stamped ────────────────────────────────────────────────────────
  if (phase === "already") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        <NavBar onBack={() => router.back()} onHome={() => router.replace("/")} />
        <header className="px-4 pt-6 pb-6 flex flex-col items-center text-center bg-gradient-to-b from-blue-900/50">
          <span className="text-8xl mb-3">{personality.emoji}</span>
          <h2 className="text-2xl font-black">{personality.name}</h2>
          <p className="text-gray-400 text-sm mb-4">「{personality.catchphrase}」</p>
          <div className="bg-blue-500/20 border border-blue-500/50 rounded-2xl px-6 py-4">
            <p className="text-blue-300 font-black text-lg">✓ 取得済み</p>
            {aed && <p className="text-gray-300 text-sm mt-1">{aed.name}</p>}
          </div>
        </header>
        <div className="px-4 pb-10 space-y-2 mt-auto">
          <button onClick={() => router.push("/rally")} className="w-full py-4 rounded-2xl bg-green-600 font-bold text-white text-base">
            🏅 スタンプラリーを見る
          </button>
          <button onClick={() => router.replace("/")} className="w-full py-3 rounded-xl text-gray-500 text-sm">
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  // ─── Done (stamp just awarded) ───────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        <NavBar onBack={() => router.back()} onHome={() => router.replace("/")} />
        <div className="px-4 pt-6 pb-8 flex flex-col items-center text-center bg-gradient-to-b from-green-900/50">
          <div className="text-8xl mb-4 animate-bounce">{personality.emoji}</div>
          <h2 className="text-2xl font-black mb-1">{personality.name}</h2>
          <p className="text-gray-400 text-sm mb-4">「{personality.catchphrase}」</p>
          <div className="bg-green-500/20 border border-green-500/50 rounded-2xl px-6 py-4 mb-2">
            <p className="text-green-400 font-black text-lg">🏅 スタンプ獲得！</p>
            {aed && <p className="text-gray-300 text-sm mt-1">{aed.name}</p>}
            {aed?.installLocation && (
              <p className="text-amber-400 text-xs mt-0.5">📌 {aed.installLocation}</p>
            )}
          </div>
          <p className="text-yellow-400 font-bold text-lg">+{pointsEarned}pt 獲得</p>
        </div>
        <div className="px-4 pb-10 space-y-2 mt-auto">
          <button onClick={() => router.push("/rally")} className="w-full py-4 rounded-2xl bg-green-600 font-bold text-white text-base">
            🏅 スタンプラリーを見る
          </button>
          <button onClick={() => router.replace("/")} className="w-full py-3 rounded-xl text-gray-500 text-sm">
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  // ─── Steps (main verification flow) ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <NavBar onBack={() => router.back()} onHome={() => router.replace("/")} />
      {/* AED header */}
      <div className="px-4 pt-4 pb-6 flex flex-col items-center text-center bg-gradient-to-b from-gray-900">
        <span className="text-7xl mb-3">{personality.emoji}</span>
        <h2 className="text-xl font-black">{personality.name}</h2>
        <p className="text-gray-400 text-xs mb-3">「{personality.catchphrase}」</p>
        <div className="bg-gray-800 rounded-xl px-4 py-3 w-full text-left">
          <p className="font-semibold text-sm">{aedName}</p>
          {aed?.installLocation && (
            <p className="text-amber-400 text-xs mt-0.5">📌 {aed.installLocation}</p>
          )}
          {aed?.address && <p className="text-gray-500 text-xs mt-0.5">{aed.address}</p>}
        </div>
      </div>

      <div className="px-4 space-y-4 pb-8">
        <p className="text-sm font-bold text-gray-300 text-center">
          以下をすべて完了するとスタンプが押されます
        </p>

        {/* Step 1: QR code ✅ (auto-completed) */}
        <StepCard
          num={1}
          title="QRコード認証"
          done={true}
          locked={false}
        >
          <p className="text-green-400 text-sm font-bold mt-1">✅ QRコードを読み取りました</p>
        </StepCard>

        {/* Step 2: GPS proximity */}
        <StepCard
          num={2}
          title="現在地の確認"
          done={gpsOk}
          locked={false}
        >
          {gpsStatus === "idle" && (
            <>
              <p className="text-gray-400 text-xs mt-1 mb-3">
                AEDの直近（GPS精度の範囲内）にいる必要があります
              </p>
              <button
                onClick={checkGPS}
                className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm"
              >
                📍 現在地を取得する
              </button>
              <button
                onClick={() => { setGpsStatus("ok"); setGpsDistM(0); }}
                className="w-full py-2 rounded-xl border border-gray-700 text-gray-500 text-xs mt-2"
              >
                スキップ（デモ用）
              </button>
              <p className="text-gray-600 text-xs mt-2 text-center">
                ※ GPSは水平距離のみ計測。フロアが正しいか目視で確認してください
              </p>
            </>
          )}
          {gpsStatus === "checking" && (
            <div className="flex items-center gap-2 mt-2">
              <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-blue-300 text-sm">高精度GPS取得中…</p>
            </div>
          )}
          {gpsStatus === "ok" && (
            <div className="mt-1 space-y-1">
              <p className="text-green-400 text-sm font-bold">
                ✅ 現地付近を確認 {gpsDistM !== null && gpsDistM > 0 ? `（約 ${gpsDistM}m）` : ""}
              </p>
              {gpsAccuracy !== null && (
                <p className="text-gray-500 text-xs">GPS精度: ±{gpsAccuracy}m</p>
              )}
            </div>
          )}
          {gpsStatus === "far" && (
            <div className="mt-2 space-y-2">
              <div className="bg-red-900/30 border border-red-500/40 rounded-xl px-3 py-3">
                <p className="text-red-400 text-sm font-bold">
                  📍 AEDまで約 {gpsDistM}m
                </p>
                {gpsAccuracy !== null && (
                  <p className="text-gray-400 text-xs mt-0.5">GPS精度: ±{gpsAccuracy}m</p>
                )}
                <p className="text-gray-400 text-xs mt-1">
                  AEDのすぐ近くに移動してから再取得してください
                </p>
              </div>
              <button onClick={checkGPS} className="w-full py-2 rounded-xl bg-blue-700 text-white text-sm font-bold">
                📍 もう一度取得する
              </button>
              <p className="text-gray-600 text-xs text-center">
                ※ GPSは水平距離のみ計測。フロアが正しいか目視で確認してください
              </p>
            </div>
          )}
          {gpsStatus === "error" && (
            <div className="mt-2 space-y-2">
              <p className="text-amber-400 text-sm font-semibold">⚠️ GPS取得に失敗しました</p>
              <p className="text-gray-500 text-xs">設定でGPS・位置情報サービスを有効にしてください</p>
              <button onClick={checkGPS} className="w-full py-2 rounded-xl bg-gray-700 text-gray-200 text-sm font-semibold">
                もう一度試す
              </button>
            </div>
          )}
        </StepCard>

        {/* Step 3: Landmark memo */}
        <StepCard
          num={3}
          title="このAEDの目印を記録"
          done={tipOk}
          locked={false}
        >
          {existingTips.length > 0 && !tipSaved && (
            <div className="mt-2 mb-2 space-y-1">
              <p className="text-xs text-gray-500">みんなの目印メモ：</p>
              {existingTips.slice(0, 2).map((t, i) => (
                <div key={i} className="bg-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-300">
                  <span className="text-gray-500">{t.userName}: </span>{t.text}
                </div>
              ))}
            </div>
          )}
          {!tipSaved ? (
            <>
              <p className="text-gray-400 text-xs mt-1 mb-2">
                場所の特徴や目印を3文字以上で記録してください<br />
                <span className="text-gray-500">例: 受付カウンター左の壁、エレベーター前</span>
              </p>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={tip}
                  onChange={(e) => setTip(e.target.value)}
                  placeholder="目印を入力…"
                  maxLength={60}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500"
                />
                <button
                  onClick={saveTip}
                  disabled={tip.trim().length < 3}
                  className="px-4 py-2.5 rounded-xl bg-green-600 text-white font-bold text-sm disabled:opacity-40"
                >
                  記録
                </button>
              </div>
              {/* Accessibility level */}
              <p className="text-gray-400 text-xs mb-1.5 font-semibold">このAEDは取りに行けますか？</p>
              <div className="flex gap-2 flex-wrap">
                {([
                  { level: "easy" as AccessLevel, label: "✅ 屋外・24h", desc: "誰でもすぐ入れる", color: "border-green-500 bg-green-500/10 text-green-400" },
                  { level: "caution" as AccessLevel, label: "🏛️ 公共施設内", desc: "時間外は入れない可能性", color: "border-amber-500 bg-amber-500/10 text-amber-400" },
                  { level: "locked" as AccessLevel, label: "🔒 セキュリティあり", desc: "入館困難（一般人不可）", color: "border-red-500 bg-red-500/10 text-red-400" },
                ] as const).map(({ level, label, desc, color }) => (
                  <button
                    key={level}
                    onClick={() => setAccessLevel(level)}
                    className={`flex-1 py-2 px-1 rounded-xl border text-xs font-bold transition-all ${
                      accessLevel === level ? color : "border-gray-700 bg-gray-800 text-gray-500"
                    }`}
                  >
                    <div>{label}</div>
                    <div className="font-normal opacity-70">{desc}</div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-green-400 text-sm font-bold mt-1">✅ 目印を記録しました</p>
          )}
        </StepCard>

        {/* Claim button */}
        <button
          onClick={claimStamp}
          disabled={!allOk}
          className={`w-full py-5 rounded-2xl font-black text-lg transition-all ${
            allOk
              ? "bg-green-500 text-white shadow-[0_4px_20px_rgba(34,197,94,0.5)] active:scale-[0.98]"
              : "bg-gray-800 text-gray-600 cursor-not-allowed"
          }`}
        >
          {allOk ? "🏅 スタンプを獲得する！" : `あと ${[!gpsOk, !tipOk].filter(Boolean).length} ステップ残っています`}
        </button>

        <button onClick={() => router.replace("/")} className="w-full py-2 text-gray-600 text-xs text-center">
          ホームに戻る
        </button>

        <p className="text-xs text-gray-700 text-center">
          {user?.name} として記録 · スタンプはこのデバイスに保存
        </p>
      </div>
    </div>
  );
}

function NavBar({ onBack, onHome }: { onBack: () => void; onHome: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 pt-10 pb-2">
      <button onClick={onBack} className="flex items-center gap-1 text-gray-400 text-sm font-semibold active:opacity-60">
        ‹ 戻る
      </button>
      <button onClick={onHome} className="text-gray-500 text-xs font-semibold active:opacity-60">
        🏠 ホーム
      </button>
    </div>
  );
}

function StepCard({
  num,
  title,
  done,
  locked,
  children,
}: {
  num: number;
  title: string;
  done: boolean;
  locked: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl p-4 border transition-all ${
      done ? "border-green-500/40 bg-green-900/20"
      : locked ? "border-gray-800 bg-gray-900 opacity-50"
      : "border-gray-700 bg-gray-900"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${
          done ? "bg-green-500 text-white"
          : locked ? "bg-gray-700 text-gray-500"
          : "bg-blue-600 text-white"
        }`}>
          {done ? "✓" : num}
        </div>
        <p className={`font-bold text-sm ${done ? "text-green-400" : locked ? "text-gray-600" : "text-white"}`}>
          {title}
        </p>
      </div>
      {!locked && <div className="mt-2 ml-11">{children}</div>}
    </div>
  );
}

export default function StampPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-400 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <StampContent />
    </Suspense>
  );
}
