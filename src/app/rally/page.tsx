"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import type { AEDLocation } from "@/app/api/aed/route";
import { haversineDistance, type RankedAED } from "@/lib/distance";
import { getUser, updateHomeBase, DEFAULT_HOME, type HomeBase } from "@/lib/user";
import { getStampedIds, getStampToken, STAGES, POINTS_PER_STAMP } from "@/lib/stamps";
import { getPersonality } from "@/lib/aedPersonalities";
import { getTipsForAED } from "@/lib/tips";

type RankedWithPersonality = AEDLocation & {
  distanceM: number;
  rank: number;
  stamped: boolean;
  personality: ReturnType<typeof getPersonality>;
  tips: ReturnType<typeof getTipsForAED>;
};

export default function RallyPage() {
  const router = useRouter();
  const user = getUser();
  const [aeds, setAeds] = useState<RankedWithPersonality[]>([]);
  const [loading, setLoading] = useState(true);
  const [stampedIds, setStampedIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<RankedWithPersonality | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [activeStage, setActiveStage] = useState(1);

  useEffect(() => {
    if (!user) { router.replace("/onboarding"); return; }
    setBaseUrl(window.location.origin);

    const ids = getStampedIds();
    setStampedIds(ids);

    const home = user.homeBase;
    fetch("/api/aed")
      .then((r) => r.json())
      .then((data) => {
        const list: AEDLocation[] = data.aeds ?? [];
        const ranked = list
          .map((a, i) => ({
            ...a,
            distanceM: Math.round(haversineDistance(home.lat, home.lng, a.lat, a.lng)),
            rank: 0,
            stamped: ids.has(a.id),
            personality: getPersonality(a.id),
            tips: getTipsForAED(a.id),
          }))
          .sort((a, b) => a.distanceM - b.distanceM)
          .map((a, i) => ({ ...a, rank: i + 1 }));
        setAeds(ranked);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router, user]);

  const refreshHomeBase = useCallback(() => {
    if (!navigator.geolocation || !user) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const home: HomeBase = { lat: p.coords.latitude, lng: p.coords.longitude, label: "現在地（GPS）" };
        updateHomeBase(home);
        window.location.reload();
      },
      () => {},
      { timeout: 8000 }
    );
  }, [user]);

  if (!user) return null;

  const totalStamps = stampedIds.size;

  // Stage-based AED slices
  const stageSlices = {
    1: aeds.slice(0, 10),
    2: aeds.slice(0, 30),
    3: aeds.slice(0, 50),
  };

  const stageProgress = {
    1: stageSlices[1].filter((a) => a.stamped).length,
    2: stageSlices[2].filter((a) => a.stamped).length,
    3: stageSlices[3].filter((a) => a.stamped).length,
  };

  const currentStageAeds = stageSlices[activeStage as 1 | 2 | 3] ?? stageSlices[1];
  const currentProgress = stageProgress[activeStage as 1 | 2 | 3] ?? 0;
  const currentTarget = STAGES[activeStage - 1]?.target ?? 10;
  const isStageComplete = currentProgress >= currentTarget;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.replace("/")}
              className="flex items-center gap-1 text-gray-500 font-semibold text-sm bg-gray-100 px-3 py-1.5 rounded-xl active:bg-gray-200 flex-shrink-0"
            >
              ‹ ホーム
            </button>
            <div>
              <p className="text-xs text-gray-400 font-semibold tracking-widest uppercase">AED Navigator</p>
              <h1 className="text-base font-black text-gray-800">スタンプラリー</h1>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">{user.name}</p>
            <p className="text-lg font-black text-yellow-500">🏅 {user.points}pt</p>
          </div>
        </div>

        {/* Home base */}
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <span>🏛️ 拠点: {user.homeBase.label}</span>
          <button onClick={refreshHomeBase} className="text-blue-500 font-semibold">GPS更新</button>
        </div>
      </header>

      {/* Overall progress */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-4 text-white">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-bold opacity-90">累計スタンプ</p>
            <p className="text-3xl font-black">{totalStamps}<span className="text-lg font-semibold opacity-80"> / {Math.min(aeds.length, 50)}台</span></p>
          </div>
          <div className="text-right text-sm opacity-90">
            {STAGES.map((s) => {
              const prog = stageProgress[s.id as 1|2|3] ?? 0;
              const done = prog >= s.target;
              return (
                <div key={s.id} className={done ? "text-yellow-300 font-bold" : "opacity-60"}>
                  {done ? "✓" : "○"} {s.label} {prog}/{s.target}
                </div>
              );
            })}
          </div>
        </div>
        <div className="w-full bg-white/30 rounded-full h-2">
          <div
            className="bg-white h-2 rounded-full transition-all duration-500"
            style={{ width: `${Math.min((totalStamps / Math.max(Math.min(aeds.length, 50), 1)) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Social value note */}
      <div className="mx-4 mt-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        <p className="text-xs text-blue-700 font-semibold leading-relaxed">
          🗺️ <span className="font-black">街を歩きながら、AEDの場所を体で覚えよう。</span><br />
          AEDに会いに行くことで「有事に動ける記憶」が生まれます。
        </p>
      </div>

      {/* Stage tabs */}
      <div className="flex gap-2 px-4 mt-3">
        {STAGES.map((s) => {
          const prog = stageProgress[s.id as 1|2|3] ?? 0;
          const done = prog >= s.target;
          const unlocked = s.id === 1 || (stageProgress[(s.id - 1) as 1|2|3] ?? 0) >= STAGES[s.id - 2]!.target;
          return (
            <button
              key={s.id}
              onClick={() => unlocked && setActiveStage(s.id)}
              disabled={!unlocked}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                activeStage === s.id
                  ? "bg-green-600 border-transparent text-white"
                  : unlocked
                  ? "bg-white border-gray-200 text-gray-600"
                  : "bg-gray-100 border-gray-200 text-gray-400"
              }`}
            >
              {done ? "✓" : unlocked ? "" : "🔒"} {s.label}<br />
              <span className="font-normal opacity-80">{prog}/{s.target}</span>
            </button>
          );
        })}
      </div>

      {/* Stage header */}
      <div className="px-4 mt-3">
        <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-sm font-bold text-gray-700">
              {STAGES[activeStage - 1]?.label}: 拠点から近い {currentTarget}箇所
            </p>
            {isStageComplete && (
              <span className="text-xs bg-yellow-100 text-yellow-700 font-bold px-2 py-0.5 rounded-full">
                🎉 +{STAGES[activeStage - 1]?.bonus}pt クリア！
              </span>
            )}
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
            <div
              className="bg-green-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min((currentProgress / currentTarget) * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">
            {currentProgress}/{currentTarget}台スタンプ済み
            {!isStageComplete && ` · 達成で+${STAGES[activeStage - 1]?.bonus}pt`}
            {` · 1台ごと+${POINTS_PER_STAMP}pt`}
          </p>
        </div>
      </div>

      {/* Stamp grid */}
      <div className="px-4 mt-3 pb-8">
        {loading ? (
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-square bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : aeds.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">📡</p>
            <p className="font-bold text-sm">AEDデータを取得できませんでした</p>
            <p className="text-xs mt-1">ネットワーク接続を確認して再度お試しください</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold"
            >
              再読み込み
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {currentStageAeds.map((aed) => (
              <button
                key={aed.id}
                onClick={() => setSelected(aed)}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 border transition-all active:scale-95 ${
                  aed.stamped
                    ? "bg-green-50 border-green-200 shadow-sm"
                    : "bg-white border-gray-200"
                }`}
              >
                <span className={`text-2xl leading-none ${aed.stamped ? "" : "grayscale opacity-40"}`}>
                  {aed.personality.emoji}
                </span>
                <span className={`text-xs font-bold leading-tight ${aed.stamped ? "text-green-700" : "text-gray-300"}`}>
                  {aed.personality.name}
                </span>
                {aed.stamped && <span className="text-green-500" style={{ fontSize: 10 }}>✓</span>}
                {!aed.stamped && (
                  <span className="text-gray-300" style={{ fontSize: 9 }}>{aed.distanceM}m</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end" onClick={() => setSelected(null)}>
          <div className="w-full bg-white rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Animal header */}
            <div className="flex items-center gap-4 mb-4">
              <span className="text-5xl">{selected.personality.emoji}</span>
              <div>
                <p className="font-black text-xl text-gray-800">{selected.personality.name}</p>
                <p className="text-xs text-gray-400">「{selected.personality.catchphrase}」</p>
                {selected.stamped && <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">✓ スタンプ済み</span>}
              </div>
            </div>

            {/* AED info */}
            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="font-semibold text-sm text-gray-800">{selected.name}</p>
              {selected.installLocation && (
                <p className="text-xs text-amber-600 mt-0.5">📌 {selected.installLocation}</p>
              )}
              <p className="text-xs text-gray-500 mt-0.5">{selected.address}</p>
              <p className="text-xs text-gray-500 mt-0.5">拠点から約 {selected.distanceM}m（第{selected.rank}位）</p>
            </div>

            {/* Tips */}
            {selected.tips.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-bold text-gray-500 mb-2">📝 みんなの目印メモ</p>
                <div className="space-y-1.5">
                  {selected.tips.map((t, i) => (
                    <div key={i} className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2 text-xs text-gray-700">
                      <span className="text-gray-400">{t.userName}: </span>{t.text}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* QR code (for physical placement) */}
            {baseUrl && (
              <div className="mb-4">
                <p className="text-xs font-bold text-gray-500 mb-2">📲 設置用QRコード（デモ確認用）</p>
                <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center gap-2">
                  <QRCode
                    value={`${baseUrl}/stamp?id=${selected.id}&s=${getStampToken(selected.id)}`}
                    size={140}
                  />
                  <p className="text-xs text-gray-400 text-center break-all">
                    /stamp?id={selected.id}&s={getStampToken(selected.id)}
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}&travelmode=walking`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm text-center"
              >
                🗺️ 行き方
              </a>
              <button
                onClick={() => setSelected(null)}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
