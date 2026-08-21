"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { AEDLocation } from "@/app/api/aed/route";
import { findTopAEDs, haversineDistance, type RankedAED } from "@/lib/distance";
import { getUser } from "@/lib/user";
import { getStampedIds, getStampToken, STAGES, POINTS_PER_STAMP } from "@/lib/stamps";
import { getPersonality } from "@/lib/aedPersonalities";
import { getTipsForAED } from "@/lib/tips";

const AEDMap = dynamic(() => import("@/components/AEDMap"), { ssr: false });

const DEFAULT_POS = { lat: 35.670599, lng: 139.77201 };

function isInChuo(lat: number, lng: number) {
  return lat >= 35.64 && lat <= 35.71 && lng >= 139.74 && lng <= 139.81;
}

export default function DailyPage() {
  const router = useRouter();
  const [aeds, setAeds] = useState<AEDLocation[]>([]);
  const [userPos, setUserPos] = useState(DEFAULT_POS);
  const [loading, setLoading] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [selected, setSelected] = useState<RankedAED | null>(null);
  const [posMode, setPosMode] = useState<"locating" | "real" | "demo">("locating");
  const [stampedIds, setStampedIds] = useState<Set<string>>(new Set());
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null);
  const [displayCount, setDisplayCount] = useState(10);

  useEffect(() => {
    setUser(getUser());
    setStampedIds(getStampedIds());
  }, []);

  useEffect(() => {
    fetch("/api/aed")
      .then((r) => r.json())
      .then((data) => { setAeds(data.aeds ?? []); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) { setPosMode("demo"); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (isInChuo(pos.lat, pos.lng)) { setUserPos(pos); setPosMode("real"); }
        else setPosMode("demo");
        setGpsLoading(false);
      },
      () => { setPosMode("demo"); setGpsLoading(false); },
      { timeout: 8000 }
    );
  }, []);

  const getGPS = useCallback(() => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (isInChuo(pos.lat, pos.lng)) { setUserPos(pos); setPosMode("real"); }
        else setPosMode("demo");
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { timeout: 8000 }
    );
  }, []);

  // Derived synchronously so map key changes correctly when displayCount changes
  const topAEDs = useMemo(
    () => (aeds.length === 0 ? [] : findTopAEDs(userPos.lat, userPos.lng, aeds, displayCount)),
    [aeds, userPos, displayCount]
  );

  const circleRanges = useMemo(() => {
    if (aeds.length === 0) return [];
    const dists = aeds
      .map((a) => Math.round(haversineDistance(userPos.lat, userPos.lng, a.lat, a.lng)))
      .sort((a, b) => a - b);
    return (
      ([
        [9, "#3b82f6", "TOP 10"],
        [19, "#22c55e", "TOP 20"],
        [29, "#f97316", "TOP 30"],
      ] as [number, string, string][])
        .filter(([idx]) => dists[idx] !== undefined)
        .map(([idx, color, label]) => ({ radius: dists[idx]!, label, color }))
    );
  }, [aeds, userPos]);

  // Reset selected if it's no longer in the current topAEDs
  const selectedAed = topAEDs.find((a) => a.id === selected?.id) ?? null;

  // Stamp progress
  const totalStamped = stampedIds.size;
  const currentStage = STAGES.find((s) => totalStamped < s.target) ?? STAGES[STAGES.length - 1]!;
  const prevTarget = STAGES[currentStage.id - 2]?.target ?? 0;
  const stageStamped = totalStamped - prevTarget;
  const stageTarget = currentStage.target - prevTarget;
  const remaining = Math.max(currentStage.target - totalStamped, 0);
  const pct = Math.min((stageStamped / stageTarget) * 100, 100);
  const allDone = totalStamped >= (STAGES[STAGES.length - 1]?.target ?? 50);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 pt-3 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.replace("/")} className="text-gray-400 text-xl font-semibold leading-none">‹</button>
            <div>
              <p className="text-xs text-gray-400 tracking-widest uppercase font-semibold">AED Navigator</p>
              <h1 className="text-base font-bold text-gray-800">中央区 AEDマップ</h1>
            </div>
          </div>
          <span className="text-xs bg-blue-100 text-blue-600 font-semibold px-2 py-1 rounded-full">平時モード</span>
        </div>
      </header>

      {/* Stamp Rally Progress Card */}
      <div className="mx-4 mt-3 rounded-2xl overflow-hidden shadow-sm border border-yellow-200"
        style={{ background: "linear-gradient(135deg, #1c1917 0%, #292524 100%)" }}>
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-yellow-400 font-bold tracking-widest uppercase mb-1">スタンプラリー</p>
              <div className="flex items-end gap-2">
                <p className="text-5xl font-black text-white leading-none">{totalStamped}</p>
                <p className="text-gray-400 text-base font-semibold mb-1">/ {currentStage.target} 台</p>
              </div>
              <p className="text-xs text-gray-400 mt-1">1台訪問 = <span className="text-yellow-400 font-bold">+{POINTS_PER_STAMP}pt</span></p>
            </div>
            <div className="text-right">
              {allDone ? (
                <div className="bg-yellow-400 rounded-xl px-3 py-2 text-center">
                  <p className="text-yellow-900 font-black text-sm">🎉 全クリア！</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-400">次の報酬まで</p>
                  <p className="text-4xl font-black text-yellow-400 leading-tight">{remaining}</p>
                  <p className="text-xs text-gray-400">台</p>
                  <p className="text-xs text-yellow-300 font-bold mt-1">達成で +{currentStage.bonus}pt</p>
                </>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-700 rounded-full h-3 mb-2">
            <div
              className="h-3 rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, #facc15, #f97316)",
              }}
            />
          </div>

          {/* Stage indicators */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {STAGES.map((s) => {
                const done = totalStamped >= s.target;
                const active = s.id === currentStage.id;
                return (
                  <span
                    key={s.id}
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      done ? "bg-yellow-400 text-yellow-900"
                      : active ? "bg-yellow-400/20 text-yellow-400 border border-yellow-400/50"
                      : "bg-gray-700 text-gray-500"
                    }`}
                  >
                    {done ? "✓" : ""} {s.label}
                  </span>
                );
              })}
            </div>
            <button
              onClick={() => router.push("/rally")}
              className="text-xs text-yellow-400 font-bold"
            >
              ラリーを見る →
            </button>
          </div>
        </div>

        {/* Points balance */}
        {user && (
          <div className="bg-yellow-400/10 border-t border-yellow-400/20 px-5 py-2 flex items-center justify-between">
            <p className="text-xs text-gray-400">累計ポイント</p>
            <p className="text-base font-black text-yellow-400">🏅 {user.points} pt</p>
          </div>
        )}
      </div>

      {/* Position mode indicator */}
      <div className={`mx-4 mt-3 px-3 py-2 rounded-xl flex items-center gap-2 text-xs font-semibold border ${
        posMode === "real" ? "bg-green-50 text-green-700 border-green-200"
        : posMode === "demo" ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-gray-50 text-gray-500 border-gray-200"
      }`}>
        {posMode === "locating"
          ? <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          : <span className="flex-shrink-0">{posMode === "real" ? "📍" : "🏛️"}</span>}
        {posMode === "locating" && "位置情報を取得中…"}
        {posMode === "real" && "現在地を使用中"}
        {posMode === "demo" && "デモ表示: 中央区庁舎を起点（中央区のAEDのみ対応）"}
      </div>

      {/* Display count control */}
      <div className="mx-4 mt-3 bg-white rounded-2xl px-5 py-4 border border-gray-200 shadow-sm">
        <p className="text-xs text-gray-400 font-semibold text-center mb-3 uppercase tracking-widest">表示するAED台数</p>
        <div className="flex items-center justify-center gap-5">
          <button
            onClick={() => { setDisplayCount((c) => Math.max(10, c - 10)); setSelected(null); }}
            disabled={displayCount <= 10}
            className="w-16 h-16 rounded-2xl bg-gray-100 font-black text-gray-700 text-4xl disabled:opacity-25 active:scale-95 transition-transform shadow-sm"
          >
            −
          </button>
          <div className="text-center min-w-[90px]">
            <p className="text-6xl font-black text-blue-600 leading-none tabular-nums">{displayCount}</p>
            <p className="text-sm text-gray-400 font-semibold mt-1">台</p>
          </div>
          <button
            onClick={() => { setDisplayCount((c) => Math.min(aeds.length || 100, c + 10)); setSelected(null); }}
            disabled={displayCount >= (aeds.length || 100)}
            className="w-16 h-16 rounded-2xl bg-blue-100 font-black text-blue-700 text-4xl disabled:opacity-25 active:scale-95 transition-transform shadow-sm"
          >
            +
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">
          {aeds.length > 0 ? `中央区全体 ${aeds.length}台のうち近隣 ${displayCount}台を表示` : "データ読み込み中…"}
        </p>
      </div>

      {/* Map — key includes displayCount so it remounts with new topAEDs on count change */}
      <div className="mx-4 mt-3 rounded-2xl overflow-hidden shadow-sm border border-gray-100 relative" style={{ height: 480 }}>
        {loading ? (
          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <AEDMap
              key={`map-${displayCount}-${userPos.lat.toFixed(4)}-${userPos.lng.toFixed(4)}`}
              aeds={aeds}
              userLat={userPos.lat}
              userLng={userPos.lng}
              topAEDs={topAEDs}
              circleRanges={circleRanges}
              selectedId={selectedAed?.id}
              onAEDSelect={(aedId) => {
                const aed = topAEDs.find((a) => a.id === aedId);
                if (aed) {
                  setSelected((prev) => (prev?.id === aedId ? null : aed));
                  setTimeout(() => {
                    document.getElementById(`aed-item-${aedId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }, 50);
                }
              }}
            />
            <button
              onClick={getGPS}
              disabled={gpsLoading}
              className="absolute bottom-3 right-3 z-[1000] bg-white shadow-lg rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs font-semibold text-gray-700 border border-gray-200 disabled:opacity-60"
            >
              {gpsLoading
                ? <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                : <span>📍</span>}
              現在地を再取得
            </button>
            {circleRanges.length > 0 && (
              <div className="absolute top-3 left-3 z-[1000] bg-white/90 rounded-xl px-3 py-2 shadow-sm border border-gray-100 space-y-1">
                {circleRanges.map((r) => (
                  <div key={r.label} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: r.color }}>
                    <span className="inline-block w-4 h-0 border-t-2 border-dashed" style={{ borderColor: r.color }} />
                    {r.label} ({r.radius}m)
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* AED list */}
      <div className="mx-4 mt-3 pb-36">
        <p className="text-xs text-gray-400 font-semibold mb-2 px-1">
          近隣AED TOP {displayCount}（現在地から近い順）
        </p>
        <div className="space-y-2">
          {loading
            ? [1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl h-20 animate-pulse border border-gray-100" />
              ))
            : topAEDs.map((aed, i) => {
                const isStamped = stampedIds.has(aed.id);
                const personality = getPersonality(aed.id);
                const rankColor = (["#ef4444", "#f97316", "#3b82f6"] as const)[aed.rank - 1] ?? "#9ca3af";
                const tips = getTipsForAED(aed.id);
                const isSelected = selectedAed?.id === aed.id;
                return (
                  <button
                    key={aed.id}
                    id={`aed-item-${aed.id}`}
                    onClick={() => setSelected(isSelected ? null : aed)}
                    className={`w-full bg-white rounded-xl p-3 border text-left transition-all ${
                      isSelected ? "border-blue-400 shadow-md" : "border-gray-100 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 flex flex-col items-center w-14">
                        <span className="text-4xl leading-none">{personality.emoji}</span>
                        <span className="font-black text-center leading-tight mt-0.5 truncate w-full text-center"
                          style={{ fontSize: 9, color: "#7c3aed" }}>
                          {personality.name}
                        </span>
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-white font-black mt-0.5"
                          style={{ fontSize: 10, background: rankColor }}
                        >
                          {aed.rank}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm text-gray-800 truncate">{aed.name}</p>
                          <span className="text-sm font-bold text-gray-600 flex-shrink-0">{aed.distanceM}m</span>
                        </div>
                        {aed.installLocation && (
                          <p className="text-xs text-amber-600 mt-0.5">📌 {aed.installLocation}</p>
                        )}
                        {tips.length > 0 && (
                          <p className="text-xs text-blue-600 mt-0.5 truncate">💬 {tips[0].text}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                            aed.accessible ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                          }`}>
                            {aed.accessible ? "✅ 使用可" : "🔒 施錠中"}
                          </span>
                          {isStamped && (
                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                              🏅 スタンプ済み
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs text-gray-500 mb-2">{aed.address}</p>
                        {tips.length > 0 && (
                          <div className="mb-3 space-y-1.5">
                            <p className="text-xs font-bold text-gray-400">📝 みんなの目印メモ</p>
                            {tips.map((t, idx) => (
                              <div key={idx} className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-gray-700">
                                <span className="text-gray-400">{t.userName}: </span>{t.text}
                              </div>
                            ))}
                          </div>
                        )}
                        {isStamped ? (
                          <div className="bg-yellow-50 border border-yellow-100 rounded-xl px-4 py-3 text-center">
                            <p className="text-yellow-700 font-black text-base">🏅 スタンプ済み</p>
                            <p className="text-xs text-yellow-600 mt-0.5">{personality.name}を訪問しました</p>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(
                                `/stamp?id=${aed.id}&s=${getStampToken(aed.id)}&lat=${aed.lat}&lng=${aed.lng}`
                              );
                            }}
                            className="w-full py-3 rounded-xl bg-green-600 text-white font-bold text-sm active:scale-[0.98] transition-transform"
                          >
                            📍 現地で場所を確認する
                          </button>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
        </div>
      </div>

      {/* Emergency button — sticky */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pt-6 pb-6 px-4">
        <button
          onClick={() => router.push("/emergency")}
          className="w-full py-5 rounded-2xl bg-red-600 shadow-[0_4px_20px_rgba(239,68,68,0.45)] flex items-center justify-center gap-3 active:scale-98 transition-transform"
        >
          <span className="text-3xl">🚨</span>
          <div className="text-left">
            <p className="font-bold text-white text-lg leading-tight">緊急モード起動</p>
            <p className="text-red-200 text-xs">最寄りAEDを即座に表示</p>
          </div>
        </button>
      </div>
    </div>
  );
}
