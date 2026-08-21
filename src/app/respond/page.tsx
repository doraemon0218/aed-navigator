"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { AEDLocation } from "@/app/api/aed/route";
import { findTopAEDsWithSecurityConstraint, haversineDistance, type RankedAED, type AccessLevelMap } from "@/lib/distance";
import { getTipSummary } from "@/lib/tipSummary";
import { getAEDAccess } from "@/lib/aedAccess";

const AEDMap = dynamic(() => import("@/components/AEDMap"), { ssr: false });

const RANK_COLORS = ["#ef4444", "#f97316", "#3b82f6"] as const;
const ACCESS_PENALTY: Record<string, number> = { easy: 0, caution: 30, locked: 80 };

type ScoredAED = RankedAED & { toPatientM: number; totalM: number };

function RespondContent() {
  const params = useSearchParams();
  const patLat = parseFloat(params.get("lat") ?? "NaN");
  const patLng = parseFloat(params.get("lng") ?? "NaN");
  const valid = !isNaN(patLat) && !isNaN(patLng);

  const [aeds, setAeds] = useState<AEDLocation[]>([]);
  const [topAEDs, setTopAEDs] = useState<RankedAED[]>([]);
  const [scoredAEDs, setScoredAEDs] = useState<ScoredAED[]>([]);
  const [responderPos, setResponderPos] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);

  useEffect(() => {
    if (!valid) return;
    fetch("/api/aed")
      .then((r) => r.json())
      .then((data) => {
        const list: AEDLocation[] = data.aeds ?? [];
        setAeds(list);
        const accessMap: AccessLevelMap = new Map();
        const securityIds = new Set<string>();
        list.forEach((aed) => {
          const a = getAEDAccess(aed.id);
          if (a) accessMap.set(aed.id, a.level);
          if (a?.level === "locked" || (!a && !aed.accessible)) securityIds.add(aed.id);
        });
        setTopAEDs(findTopAEDsWithSecurityConstraint(patLat, patLng, list, accessMap, securityIds));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [valid, patLat, patLng]);

  const computeScored = (rLat: number, rLng: number, list: AEDLocation[]) => {
    if (list.length === 0) return;
    const score = (aed: AEDLocation) => {
      const a = getAEDAccess(aed.id);
      const penalty = a ? (ACCESS_PENALTY[a.level] ?? 0) : 0;
      const distM = Math.round(haversineDistance(rLat, rLng, aed.lat, aed.lng));
      const toPatM = Math.round(haversineDistance(aed.lat, aed.lng, patLat, patLng));
      return { ...aed, distanceM: distM, toPatientM: toPatM, totalM: distM + toPatM + penalty };
    };
    const isSecurity = (aed: AEDLocation) => {
      const a = getAEDAccess(aed.id);
      return a?.level === "locked" || (!a && !aed.accessible);
    };
    // Rank 1 & 2: non-security only
    const nonSec = list.filter((a) => !isSecurity(a)).map(score).sort((a, b) => a.totalM - b.totalM).slice(0, 2);
    const usedIds = new Set(nonSec.map((a) => a.id));
    // Rank 3: nearest remaining (may be security)
    const remaining = list.filter((a) => !usedIds.has(a.id)).map(score).sort((a, b) => a.totalM - b.totalM);
    const top3 = [...nonSec, ...(remaining[0] ? [remaining[0]] : [])].map((aed, i) => ({ ...aed, rank: i + 1 }));
    setScoredAEDs(top3);
  };

  useEffect(() => {
    if (!valid || aeds.length === 0) return;
    setGpsLoading(true);
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setResponderPos(pos);
        computeScored(pos.lat, pos.lng, aeds);
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { timeout: 8000, enableHighAccuracy: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aeds, valid]);

  if (!valid) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-6 gap-4 text-center">
        <div className="text-5xl">❌</div>
        <p className="font-black text-xl">無効なリンクです</p>
        <p className="text-gray-400 text-sm">緊急モードで発行されたQRコードを読み取ってください。</p>
      </div>
    );
  }

  // Google Maps: responder → AED → patient (3-stop route)
  const routeUrl = (aed: { lat: number; lng: number }) =>
    responderPos
      ? `https://www.google.com/maps/dir/${responderPos.lat},${responderPos.lng}/${aed.lat},${aed.lng}/${patLat},${patLng}`
      : `https://www.google.com/maps/dir/${aed.lat},${aed.lng}/${patLat},${patLng}`;

  const mapTopAEDs = scoredAEDs.length > 0 ? (scoredAEDs as RankedAED[]) : topAEDs;
  const displayList: (RankedAED | ScoredAED)[] = scoredAEDs.length > 0 ? scoredAEDs : topAEDs;
  const isScored = scoredAEDs.length > 0;
  const now = new Date();
  const isBusinessHours = now.getHours() >= 9 && now.getHours() < 17;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="bg-red-700 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-2xl animate-pulse">🚨</span>
          <div className="flex-1 min-w-0">
            <p className="font-black text-lg leading-tight">AED搬送のお願い</p>
            <p className="text-red-200 text-xs">
              {gpsLoading
                ? "📍 現在地を取得中…"
                : isScored
                ? "📍 あなた → AED → 患者 の最短ルートを表示中"
                : "患者の最寄りAEDを表示中"}
            </p>
          </div>
          {gpsLoading && (
            <div className="w-5 h-5 border-2 border-red-200 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
        </div>
        {/* Route legend */}
        <div className="mt-2 flex items-center gap-3 text-xs font-semibold flex-wrap">
          <span className="flex items-center gap-1 text-blue-300">
            <span className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white inline-block" />
            あなたの現在地
          </span>
          <span className="text-white/40">→</span>
          <span className="flex items-center gap-1 text-red-300">
            <span className="w-3 h-3 rounded-full bg-red-500 border-2 border-white inline-block" />
            AED（番号順）
          </span>
          <span className="text-white/40">→</span>
          <span className="flex items-center gap-1 text-orange-300">
            <span>🏃</span>
            患者発生場所
          </span>
        </div>
      </div>

      {/* Map */}
      <div className="flex-shrink-0" style={{ height: "42vh", minHeight: 260 }}>
        {loading ? (
          <div className="h-full bg-gray-900 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-gray-400 text-xs">AEDデータ取得中…</p>
            </div>
          </div>
        ) : (
          <AEDMap
            aeds={aeds}
            userLat={responderPos?.lat ?? patLat}
            userLng={responderPos?.lng ?? patLng}
            topAEDs={mapTopAEDs}
            patientLat={patLat}
            patientLng={patLng}
          />
        )}
      </div>

      {/* AED list */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-8 space-y-3">
        {loading
          ? [1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-gray-800 rounded-2xl animate-pulse" />
            ))
          : displayList.map((aed) => {
              const fullAed = aeds.find((a) => a.id === aed.id);
              const access = getAEDAccess(aed.id);
              const isSecurity = access?.level === "locked" || (!access && !aed.accessible);
              const canSelect = !isSecurity || isBusinessHours;
              const color = canSelect ? (RANK_COLORS[(aed.rank - 1) % 3] ?? "#6b7280") : "#6b7280";
              const accessInfo = access?.level === "easy"
                ? { icon: "✅", text: "屋外・24時間使用可", cls: "text-green-400", bg: "bg-green-500/10 border-green-500/30" }
                : access?.level === "caution"
                ? { icon: "🏛️", text: "施設内（開館時間内に使用可）", cls: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" }
                : isSecurity && canSelect
                ? { icon: "🏛️", text: "開館時間内（9-17時）のため使用可", cls: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/30" }
                : isSecurity
                ? { icon: "🔒", text: "現在施錠中（9:00〜17:00のみ利用可）", cls: "text-red-400", bg: "bg-red-500/10 border-red-500/30" }
                : aed.accessible
                ? { icon: "✅", text: "使用可", cls: "text-green-400", bg: "bg-green-500/10 border-green-500/30" }
                : { icon: "🔒", text: "現在施錠中", cls: "text-red-400", bg: "bg-red-500/10 border-red-500/30" };
              const lm = getTipSummary(aed.id);
              const scored = aed as ScoredAED;

              // installLocation may contain multiple locations separated by ";"
              const locations = fullAed?.installLocation
                ? fullAed.installLocation.split(";").map((s) => s.trim()).filter(Boolean)
                : aed.installLocation
                ? aed.installLocation.split(";").map((s) => s.trim()).filter(Boolean)
                : [];

              const hasHours = fullAed?.availableDays && fullAed.startTime && fullAed.endTime;

              const inner = (
                <>
                  {/* Top bar: rank + distance */}
                  <div className="flex items-center" style={{ background: color }}>
                    <div className="w-12 h-12 flex items-center justify-center font-black text-2xl text-white flex-shrink-0">
                      {isSecurity && !canSelect ? "🔒" : aed.rank}
                    </div>
                    <div className="flex-1 px-3 py-2">
                      <p className="font-black text-white text-base leading-tight">
                        {isScored && responderPos
                          ? `あなた ${scored.distanceM}m → AED → 患者 ${scored.toPatientM}m`
                          : `患者から ${aed.distanceM}m`}
                      </p>
                      {isScored && (
                        <p className="text-white/70 text-xs">合計 {scored.totalM}m の最短ルート</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-center justify-center px-4 gap-0.5 self-stretch bg-black/20">
                      <span className="text-lg">{canSelect ? "🗺️" : "🚫"}</span>
                      <span className="text-white/70 text-xs">{canSelect ? "経路" : "施錠中"}</span>
                    </div>
                  </div>

                  {/* Building name */}
                  <div className="px-4 pt-3 pb-1">
                    <p className="font-black text-white text-base leading-tight">🏢 {aed.name}</p>
                    {fullAed?.address && (
                      <p className="text-gray-400 text-xs mt-0.5">📍 {fullAed.address}</p>
                    )}
                  </div>

                  {/* Install location */}
                  {locations.length > 0 && (
                    <div className="px-4 pb-2 space-y-1">
                      {locations.map((loc, i) => (
                        <div key={i} className="flex items-start gap-2 bg-amber-400/15 border border-amber-400/30 rounded-xl px-3 py-2">
                          <span className="text-amber-400 font-black text-sm flex-shrink-0 mt-0.5">📌</span>
                          <span className="text-amber-200 font-bold text-sm leading-snug">{loc}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AI tip / landmark */}
                  {lm && (
                    <div className="mx-4 mb-2 flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
                      <span className="text-blue-400 text-sm flex-shrink-0 mt-0.5">💬</span>
                      <span className="text-blue-200 text-sm leading-snug">{lm}</span>
                    </div>
                  )}

                  {/* Access level + hours */}
                  <div className="mx-4 mb-2 flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full border ${accessInfo.bg} ${accessInfo.cls}`}>
                      {accessInfo.icon} {accessInfo.text}
                    </span>
                    {hasHours && (
                      <span className="text-xs text-gray-400 font-semibold">
                        🕐 {fullAed!.availableDays} {fullAed!.startTime}〜{fullAed!.endTime}
                      </span>
                    )}
                  </div>

                  {/* Security note */}
                  {isSecurity && !canSelect && (
                    <div className="mx-4 mb-3 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                      <p className="text-red-300 text-xs font-bold">
                        ⚠️ セキュリティ施設のため現在使用不可
                      </p>
                      <p className="text-red-400/80 text-xs mt-0.5">
                        9:00〜17:00の開館時間内であれば利用できます。他のAEDを優先してください。
                      </p>
                    </div>
                  )}
                  {isSecurity && canSelect && (
                    <div className="mx-4 mb-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                      <p className="text-amber-300 text-xs font-bold">
                        🏛️ 開館時間内（9:00〜17:00）のため使用可
                      </p>
                      <p className="text-amber-400/80 text-xs mt-0.5">
                        施設内のため入口から案内スタッフに声をかけてください。
                      </p>
                    </div>
                  )}
                </>
              );

              return canSelect ? (
                <a
                  key={aed.id}
                  href={routeUrl(aed)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-2xl overflow-hidden border border-white/10 active:opacity-60"
                  style={{ background: color + "12" }}
                >
                  {inner}
                </a>
              ) : (
                <div
                  key={aed.id}
                  className="block rounded-2xl overflow-hidden border border-gray-600/40 opacity-60"
                  style={{ background: "#6b728012" }}
                >
                  {inner}
                </div>
              );
            })}

        {/* Arrival instruction */}
        {!loading && (
          <div className="bg-green-950/50 border border-green-600/30 rounded-xl px-4 py-3">
            <p className="text-green-300 font-black text-sm">📋 患者の元に到着したら</p>
            <p className="text-white font-bold text-sm mt-0.5">
              CPR中の人にAEDを渡し、音声案内に従ってください
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RespondPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
      <RespondContent />
    </Suspense>
  );
}
