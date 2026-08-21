"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import type { AEDLocation } from "@/app/api/aed/route";
import { findTopAEDsWithSecurityConstraint, type RankedAED, type AccessLevelMap } from "@/lib/distance";
import { getVerifiedAEDs } from "@/lib/offlineAEDs";
import { getTipsForAED } from "@/lib/tips";
import { getTipSummary } from "@/lib/tipSummary";
import { getAEDAccess } from "@/lib/aedAccess";
import type { ResponderMarker } from "@/components/AEDMap";

const AEDMap = dynamic(() => import("@/components/AEDMap"), { ssr: false });

const DEFAULT_POS = { lat: 35.670599, lng: 139.77201 };
const RANK_COLORS = ["#ef4444", "#f97316", "#3b82f6"] as const;

function isInChuo(lat: number, lng: number) {
  return lat >= 35.64 && lat <= 35.71 && lng >= 139.74 && lng <= 139.81;
}

function randomNearby(base: { lat: number; lng: number }): { lat: number; lng: number } {
  const angle = Math.random() * 2 * Math.PI;
  const radius = 80 + Math.random() * 40;
  const dLat = (radius * Math.cos(angle)) / 111111;
  const dLng = (radius * Math.sin(angle)) / (111111 * Math.cos(base.lat * Math.PI / 180));
  return { lat: base.lat + dLat, lng: base.lng + dLng };
}

type DispatchPhase = "idle" | "sending" | "waiting" | "assigned" | "no_response";

export default function EmergencyPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"locating" | "ready">("locating");
  const [aeds, setAeds] = useState<AEDLocation[]>([]);
  const [userPos, setUserPos] = useState(() => randomNearby(DEFAULT_POS));
  const [topAEDs, setTopAEDs] = useState<RankedAED[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [posMode, setPosMode] = useState<"locating" | "real" | "demo">("locating");
  const [fetchError, setFetchError] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [responders, setResponders] = useState<ResponderMarker[]>([]);

  // Doctor email dispatch state
  const [dispatchPhase, setDispatchPhase] = useState<DispatchPhase>("idle");
  const [dispatchId, setDispatchId] = useState<string | null>(null);
  const [dispatchCountdown, setDispatchCountdown] = useState(60);
  const [dispatchResponseCount, setDispatchResponseCount] = useState(0);
  const [winner, setWinner] = useState<{ name: string; etaMinutes: number } | null>(null);

  const startTime = useRef(Date.now());
  const notifiedRef = useRef(false);
  const gpsPosRef = useRef(DEFAULT_POS);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Register service worker and subscribe to push
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const keyBytes = Uint8Array.from(atob(vapidKey.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes });
      }
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
    }).catch(() => {});
  }, []);

  // Load demo doctors as responders for map display
  useEffect(() => {
    fetch("/api/doctor-location")
      .then((r) => r.json())
      .then((data) => {
        const doctors = (data.doctors ?? []) as { clientId: string; name: string; lat: number; lng: number }[];
        setResponders(doctors.map((d, i) => ({
          id: d.clientId,
          name: d.name,
          role: i === 0 ? "doctor" : "nurse",
          badge: i === 0 ? "👨‍⚕️ 救急医" : "👩‍⚕️ 麻酔科医",
          lat: d.lat,
          lng: d.lng,
          status: "待機中",
          task: "緊急出動待機中",
        })));
      })
      .catch(() => {});
  }, []);

  // Load AED data
  useEffect(() => {
    fetch("/api/aed")
      .then((r) => {
        if (!r.ok) throw new Error("API error");
        return r.json();
      })
      .then((data) => {
        const list: AEDLocation[] = data.aeds ?? [];
        if (list.length > 0) {
          setAeds(list);
        } else {
          const offline = getVerifiedAEDs();
          setAeds(offline);
          if (offline.length > 0) setFetchError(true);
        }
        setPhase("ready");
      })
      .catch(() => {
        const offline = getVerifiedAEDs();
        setAeds(offline);
        setFetchError(true);
        setPhase("ready");
      });
  }, []);

  useEffect(() => {
    if (aeds.length === 0) return;
    const accessMap: AccessLevelMap = new Map();
    const securityIds = new Set<string>();
    aeds.forEach((aed) => {
      const a = getAEDAccess(aed.id);
      if (a) accessMap.set(aed.id, a.level);
      if (a?.level === "locked" || (!a && !aed.accessible)) securityIds.add(aed.id);
    });
    const top3 = findTopAEDsWithSecurityConstraint(userPos.lat, userPos.lng, aeds, accessMap, securityIds);
    setTopAEDs(top3);
    try { localStorage.setItem("emergency_top3", JSON.stringify(top3)); } catch {}
    if (!notifiedRef.current) {
      notifiedRef.current = true;
      fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: userPos.lat, lng: userPos.lng, notifyDoctors: false }),
      }).catch(() => {});
    }
  }, [userPos, aeds]);

  useEffect(() => {
    if (!navigator.geolocation) { setPosMode("demo"); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (isInChuo(pos.lat, pos.lng)) {
          gpsPosRef.current = pos;
          setUserPos(randomNearby(pos));
          setPosMode("real");
        } else setPosMode("demo");
        setGpsLoading(false);
      },
      () => { setPosMode("demo"); setGpsLoading(false); },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, []);

  // Poll dispatch status
  const startPolling = useCallback((id: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/doctor-dispatch?id=${id}`);
        const data = await res.json() as {
          status: string;
          secondsLeft: number;
          responseCount: number;
          winner: { name: string; etaMinutes: number } | null;
        };
        setDispatchCountdown(data.secondsLeft);
        setDispatchResponseCount(data.responseCount);
        if (data.status === "assigned" && data.winner) {
          setWinner(data.winner);
          setDispatchPhase("assigned");
          clearInterval(pollIntervalRef.current!);
          // Update responders on map to show winner as active
          setResponders((prev) => prev.map((r) =>
            r.name === data.winner!.name
              ? { ...r, status: `${data.winner!.etaMinutes}分で到着`, task: "現場へ急行中" }
              : r
          ));
        } else if (data.status === "no_response") {
          setDispatchPhase("no_response");
          clearInterval(pollIntervalRef.current!);
        } else {
          setDispatchPhase("waiting");
        }
      } catch {
        // keep polling
      }
    }, 5000);
  }, []);

  useEffect(() => {
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, []);

  const randomizePatientPos = useCallback(() => {
    setUserPos(randomNearby(gpsPosRef.current));
    setPosMode("demo");
  }, []);

  const getGPS = useCallback(() => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (isInChuo(pos.lat, pos.lng)) {
          gpsPosRef.current = pos;
          setUserPos(randomNearby(pos));
          setPosMode("real");
        } else setPosMode("demo");
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, []);

  const handleRescueButton = useCallback(async () => {
    try { localStorage.setItem("emergency_patient_pos", JSON.stringify(userPos)); } catch {}
    setDispatchPhase("sending");
    try {
      const aedTargets = topAEDs.slice(0, 3).map((a) => ({
        aedId: a.id,
        aedName: a.name,
        aedLat: a.lat,
        aedLng: a.lng,
      }));
      const res = await fetch("/api/doctor-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: userPos.lat, lng: userPos.lng, topAEDs: aedTargets }),
      });
      const data = await res.json() as { dispatchId: string | null; responderCount: number };
      if (data.dispatchId) {
        setDispatchId(data.dispatchId);
        setDispatchPhase("waiting");
        startPolling(data.dispatchId);
        try { localStorage.setItem("dispatch_id", data.dispatchId); } catch {}
      } else {
        setDispatchPhase("no_response");
      }
    } catch {
      setDispatchPhase("no_response");
    }
    router.push("/cpr");
  }, [userPos, router, startPolling]);

  const fmt = (s: number) => s < 60 ? `${s}秒` : `${Math.floor(s / 60)}分${s % 60}秒`;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="bg-red-600 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.replace("/")}
              className="text-white/70 text-2xl font-semibold leading-none px-1 active:opacity-60"
            >
              ‹
            </button>
            <span className="text-xl animate-pulse">🚨</span>
            <div>
              <p className="font-bold text-base leading-tight">緊急モード</p>
              <p className="text-red-200 text-xs">
                {fetchError
                  ? `オフラインデータ（${aeds.length}台）`
                  : phase === "locating" ? "AEDデータを取得中…"
                  : "最寄りAED TOP3を表示"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-red-200 text-xs">経過時間</p>
            <p className="font-bold text-xl tabular-nums">{fmt(elapsed)}</p>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className={`px-2 py-1 rounded-lg flex items-center gap-1.5 text-xs font-semibold ${
            posMode === "real" ? "bg-green-500/20 text-green-300"
            : posMode === "demo" ? "bg-amber-500/20 text-amber-300"
            : "bg-white/10 text-red-200"
          }`}>
            {posMode === "locating"
              ? <span className="w-2.5 h-2.5 border-2 border-red-300 border-t-transparent rounded-full animate-spin" />
              : <span>{posMode === "real" ? "📍" : "🏛️"}</span>}
            {posMode === "locating" && "位置情報を取得中…"}
            {posMode === "real" && "現在地を使用中"}
            {posMode === "demo" && `デモ: ${userPos.lat.toFixed(4)}, ${userPos.lng.toFixed(4)}`}
          </div>
          {phase === "ready" && (
            <button
              onClick={randomizePatientPos}
              className="bg-white/20 text-white text-xs font-bold px-2 py-1 rounded-lg active:opacity-60 flex items-center gap-1"
            >
              🎲 患者位置をランダム化
            </button>
          )}
        </div>
      </div>

      {/* Dispatch status banner */}
      {dispatchPhase !== "idle" && (
        <div className={`px-4 py-2 flex items-center justify-between text-xs flex-shrink-0 ${
          dispatchPhase === "assigned" ? "bg-green-900 border-b border-green-700"
          : dispatchPhase === "no_response" ? "bg-gray-800 border-b border-gray-700"
          : "bg-purple-950 border-b border-purple-800"
        }`}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className={`text-sm flex-shrink-0 ${dispatchPhase === "waiting" ? "animate-ping" : ""}`}>
              {dispatchPhase === "assigned" ? "✅" : dispatchPhase === "no_response" ? "⚠️" : "📡"}
            </span>
            <div className="min-w-0 flex-1">
              {dispatchPhase === "sending" && (
                <p className="text-purple-200 font-bold truncate">医師へメール送信中…</p>
              )}
              {dispatchPhase === "waiting" && (
                <>
                  <p className="text-purple-200 font-bold truncate">
                    医師 {dispatchResponseCount}名が回答 — 締め切りまで {dispatchCountdown}秒
                  </p>
                  <p className="text-purple-300 text-[11px] truncate">Aさん（救急医）・Bさん（麻酔科医）にメール送信済み</p>
                </>
              )}
              {dispatchPhase === "assigned" && winner && (
                <>
                  <p className="text-green-300 font-bold truncate">
                    🩺 {winner.name}が {winner.etaMinutes}分で到着します
                  </p>
                  <p className="text-green-400 text-[11px] truncate">他の医師には感謝メールを送信しました</p>
                </>
              )}
              {dispatchPhase === "no_response" && (
                <p className="text-gray-300 font-bold truncate">付近に応答できる医師がいませんでした</p>
              )}
            </div>
          </div>
          {dispatchPhase === "waiting" && (
            <span className="text-[10px] bg-purple-800 text-purple-200 px-2 py-0.5 rounded-full font-bold flex-shrink-0 ml-2">
              募集中
            </span>
          )}
        </div>
      )}

      {fetchError && (
        <div className="bg-amber-600 px-4 py-2 flex items-center gap-2 flex-shrink-0">
          <p className="text-xs font-semibold text-amber-100">
            ⚠️ オフライン保存済みAED（{aeds.length}台）を表示中
          </p>
        </div>
      )}

      {/* Map */}
      <div className="relative flex-shrink-0" style={{ height: 240 }}>
        {phase === "locating" && !fetchError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-gray-400">AEDデータを取得中…</p>
            </div>
          </div>
        ) : aeds.length > 0 ? (
          <>
            <AEDMap
              aeds={aeds}
              userLat={userPos.lat}
              userLng={userPos.lng}
              topAEDs={topAEDs}
              responders={responders}
            />
            <button
              onClick={getGPS}
              disabled={gpsLoading}
              className="absolute bottom-3 right-3 z-[1000] bg-white shadow-lg rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs font-semibold text-gray-800 border border-gray-200 disabled:opacity-60"
            >
              {gpsLoading
                ? <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                : <span>📍</span>}
              現在地を再取得
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <p className="text-gray-400 text-sm">オフラインデータなし</p>
          </div>
        )}
      </div>

      {/* Primary action */}
      <div className="px-4 pt-4 pb-2 flex-shrink-0 space-y-2">
        <button
          onClick={handleRescueButton}
          disabled={dispatchPhase !== "idle"}
          className="w-full py-5 rounded-2xl font-bold text-xl bg-orange-600 active:bg-orange-700 flex items-center justify-center gap-3 shadow-lg disabled:opacity-60"
        >
          {dispatchPhase === "sending"
            ? <><span className="w-7 h-7 border-4 border-white border-t-transparent rounded-full animate-spin" /> 医師へ連絡中…</>
            : <><span className="text-3xl">🤲</span>患者を助ける（医師召集＋CPR）</>}
        </button>
        <button
          onClick={() => setShowShare(true)}
          className="w-full py-3 rounded-2xl font-bold text-base bg-blue-700 active:bg-blue-800 flex items-center justify-center gap-2 shadow-md"
        >
          <span className="text-xl">📲</span>
          近くの人にAED取得を依頼する（QR）
        </button>
      </div>

      {/* Share sheet — QR for /respond URL */}
      {showShare && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-end"
          onClick={() => setShowShare(false)}
        >
          <div
            className="w-full bg-gray-900 rounded-t-3xl px-5 pt-5 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-black text-white text-lg">近くの人に見せる</p>
                <p className="text-gray-400 text-xs">QRを読み取ると患者の場所＋AEDを案内します</p>
              </div>
              <button onClick={() => setShowShare(false)} className="text-gray-500 text-2xl leading-none">✕</button>
            </div>
            <div className="bg-white rounded-2xl p-5 flex flex-col items-center gap-3">
              <QRCode
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/respond?lat=${userPos.lat}&lng=${userPos.lng}`}
                size={200}
              />
              <p className="text-gray-500 text-xs text-center break-all">
                /respond?lat={userPos.lat.toFixed(5)}&lng={userPos.lng.toFixed(5)}
              </p>
            </div>
            <div className="mt-4 bg-blue-900/40 border border-blue-500/30 rounded-xl px-4 py-3">
              <p className="text-blue-300 text-sm font-bold">📢 声かけ例</p>
              <p className="text-white text-sm mt-1">
                「このQRを読んで、一番近いAEDを取ってきてここに戻ってください！」
              </p>
            </div>
          </div>
        </div>
      )}

      {/* AED list — TOP 3 */}
      <div className="px-4 pt-2 pb-2 flex-shrink-0">
        {phase === "locating" && !fetchError
          ? <div className="rounded-2xl bg-gray-800 animate-pulse h-52" />
          : (() => {
              const now = new Date();
              const isBusinessHours = now.getHours() >= 9 && now.getHours() < 17;
              return (
                <div className="rounded-2xl overflow-hidden border border-white/10">
                  {topAEDs.map((aed) => {
                    const color = RANK_COLORS[aed.rank - 1] ?? "#6b7280";
                    const tips = getTipsForAED(aed.id);
                    const summary = getTipSummary(aed.id);
                    const access = getAEDAccess(aed.id);
                    const landmark = summary ?? tips[0]?.text ?? null;
                    const isSecurity = access?.level === "locked" || (!access && !aed.accessible);
                    const canSelect = !isSecurity || isBusinessHours;
                    const accessLabel = access?.level === "easy"
                      ? { icon: "✅", text: "屋外・24h", cls: "text-green-400" }
                      : access?.level === "caution"
                      ? { icon: "🏛️", text: "施設内", cls: "text-amber-400" }
                      : isSecurity
                      ? { icon: "🔒", text: isBusinessHours ? "施設内（開館時間内）" : "施設内（現在施錠中）", cls: isBusinessHours ? "text-amber-300" : "text-red-400" }
                      : { icon: "✅", text: "使用可", cls: "text-green-400" };
                    const rowBg = isSecurity && !canSelect
                      ? "rgba(100,100,100,0.15)"
                      : access?.level === "caution"
                      ? "rgba(245,158,11,0.10)"
                      : color + "18";
                    const rankColor = isSecurity && !canSelect ? "#6b7280" : color;

                    return (
                      <div
                        key={aed.id}
                        className={`flex items-stretch border-b border-white/10 last:border-0 ${isSecurity && !canSelect ? "opacity-60" : ""}`}
                        style={{ background: rowBg }}
                      >
                        <div
                          className="flex-shrink-0 w-10 self-stretch flex items-center justify-center font-black text-2xl text-white"
                          style={{ background: rankColor }}
                        >
                          {isSecurity && !canSelect ? "🔒" : aed.rank}
                        </div>
                        <div className="flex-1 min-w-0 px-3 py-2.5">
                          <p className="font-black text-xl leading-tight truncate" style={{ color: rankColor }}>
                            {aed.distanceM}m{" "}
                            <span className={`text-sm font-bold ${accessLabel.cls}`}>
                              {accessLabel.icon} {accessLabel.text}
                            </span>
                          </p>
                          <p className="text-white font-black text-base leading-tight truncate">
                            🏢 {aed.name}
                            {aed.installLocation
                              ? <span className="text-amber-300">　📌 {aed.installLocation}</span>
                              : null}
                          </p>
                          {landmark && (
                            <p className="text-white font-bold text-sm leading-tight truncate">💬 {landmark}</p>
                          )}
                          {isSecurity && !canSelect && (
                            <p className="text-red-300 text-xs font-bold mt-1 leading-snug">
                              ⚠️ 現在施錠中の可能性。9:00〜17:00のみ選択可。
                            </p>
                          )}
                          {isSecurity && canSelect && (
                            <p className="text-amber-300 text-xs font-bold mt-1 leading-snug">
                              🏛️ 開館時間内のため使用可（セキュリティ施設）
                            </p>
                          )}
                        </div>
                        {canSelect
                          ? (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${aed.lat},${aed.lng}&travelmode=walking`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-shrink-0 flex flex-col items-center justify-center px-3 gap-0.5 self-stretch bg-white/5 border-l border-white/10 text-gray-300"
                            >
                              <span className="text-2xl">🗺️</span>
                              <span className="text-xs">経路</span>
                            </a>
                          ) : (
                            <div className="flex-shrink-0 flex flex-col items-center justify-center px-3 gap-0.5 self-stretch bg-white/5 border-l border-white/10 text-gray-600">
                              <span className="text-2xl">🚫</span>
                              <span className="text-xs">施錠中</span>
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
      </div>

      <button onClick={() => router.replace("/")} className="pb-6 pt-4 text-center text-gray-600 text-xs mt-auto">
        平時モードに戻る
      </button>
    </div>
  );
}
