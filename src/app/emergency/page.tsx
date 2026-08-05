"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { AEDLocation } from "@/app/api/aed/route";
import { findTopAEDs, type RankedAED } from "@/lib/distance";

const AEDMap = dynamic(() => import("@/components/AEDMap"), { ssr: false });

// Demo default: 中央区庁舎
const DEFAULT_POS = { lat: 35.670599, lng: 139.77201 };
const RANK_COLORS = ["#ef4444", "#f97316", "#3b82f6"];

export default function EmergencyPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"locating" | "ready">("locating");
  const [aeds, setAeds] = useState<AEDLocation[]>([]);
  const [userPos, setUserPos] = useState(DEFAULT_POS);
  const [topAEDs, setTopAEDs] = useState<RankedAED[]>([]);
  const [activeRank, setActiveRank] = useState(1);
  const [called119, setCalled119] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [gpsLoading, setGpsLoading] = useState(false);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Load AED data, start with default position
  useEffect(() => {
    fetch("/api/aed")
      .then((r) => r.json())
      .then((data) => {
        const list: AEDLocation[] = data.aeds ?? [];
        setAeds(list);
        setTopAEDs(findTopAEDs(DEFAULT_POS.lat, DEFAULT_POS.lng, list, 3));
        setPhase("ready");
      });
  }, []);

  const getGPS = useCallback(() => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setUserPos(pos);
        setTopAEDs(findTopAEDs(pos.lat, pos.lng, aeds, 3));
        setActiveRank(1);
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { timeout: 8000 }
    );
  }, [aeds]);

  const handle119 = useCallback(() => {
    setCalled119(true);
    window.location.href = "tel:119";
  }, []);

  const target = topAEDs.find((a) => a.rank === activeRank) ?? topAEDs[0];
  const fmt = (s: number) => s < 60 ? `${s}秒` : `${Math.floor(s / 60)}分${s % 60}秒`;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="bg-red-600 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xl animate-pulse">🚨</span>
          <div>
            <p className="font-bold text-base leading-tight">緊急モード</p>
            <p className="text-red-200 text-xs">
              {phase === "locating" ? "AEDデータを取得中…" : "中央区 · AED TOP3特定済み"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-red-200 text-xs">経過時間</p>
          <p className="font-bold text-xl tabular-nums">{fmt(elapsed)}</p>
        </div>
      </div>

      {/* Map — large */}
      <div className="relative flex-shrink-0" style={{ height: 320 }}>
        {phase === "locating" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-gray-400">AEDデータを取得中…</p>
            </div>
          </div>
        ) : (
          <>
            <AEDMap
              aeds={aeds}
              userLat={userPos.lat}
              userLng={userPos.lng}
              topAEDs={topAEDs}
            />
            {/* GPS button — floating on map */}
            <button
              onClick={getGPS}
              disabled={gpsLoading}
              className="absolute bottom-3 right-3 z-[1000] bg-white shadow-lg rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs font-semibold text-gray-800 border border-gray-200 disabled:opacity-60"
            >
              {gpsLoading ? (
                <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>📍</span>
              )}
              現在地を取得
            </button>
          </>
        )}
      </div>

      {/* Rank tabs */}
      {topAEDs.length > 0 && (
        <div className="flex gap-2 px-4 pt-3 pb-1 flex-shrink-0">
          {topAEDs.map((aed) => (
            <button
              key={aed.id}
              onClick={() => setActiveRank(aed.rank)}
              className="flex-1 py-2 rounded-xl text-xs font-bold border transition-all"
              style={activeRank === aed.rank
                ? { background: RANK_COLORS[aed.rank - 1], borderColor: "transparent", color: "white" }
                : { background: "#1f2937", borderColor: "#374151", color: "#9ca3af" }
              }
            >
              {aed.rank}位 · {aed.distanceM}m
            </button>
          ))}
        </div>
      )}

      {/* Selected AED detail */}
      <div className="px-4 pt-2 flex-shrink-0">
        {target ? (
          <div className={`rounded-xl p-4 border ${
            target.accessible ? "border-green-500/30 bg-green-900/20" : "border-red-500/30 bg-red-900/20"
          }`}>
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0"
                style={{ background: RANK_COLORS[(target.rank ?? 1) - 1] }}
              >
                {target.rank}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-sm">{target.name}</p>
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    target.accessible ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                  }`}>
                    {target.accessible ? "✅ 使用可" : "🔒 施錠中"}
                  </span>
                </div>
                {target.installLocation && (
                  <p className="text-amber-400 text-xs font-semibold mt-1">📌 {target.installLocation}</p>
                )}
                <p className="text-gray-400 text-xs mt-0.5 truncate">{target.address}</p>
                <p className="text-white font-bold text-sm mt-1">約 {target.distanceM}m</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl h-20 bg-gray-800 animate-pulse" />
        )}
      </div>

      {/* Action buttons */}
      <div className="px-4 pt-3 pb-6 space-y-2 flex-shrink-0">
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => router.push("/cpr")}
            className="py-4 rounded-xl font-bold text-xs bg-orange-600 active:bg-orange-700 flex flex-col items-center gap-1"
          >
            <span className="text-2xl">🤲</span>
            救助する
          </button>
          <button
            onClick={handle119}
            className={`py-4 rounded-xl font-bold text-xs flex flex-col items-center gap-1 ${
              called119 ? "bg-green-700" : "bg-red-600 active:bg-red-700"
            }`}
          >
            <span className="text-2xl">📞</span>
            {called119 ? "通報済み" : "119通報"}
          </button>
          <a
            href={target
              ? `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=walking`
              : "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="py-4 rounded-xl font-bold text-xs bg-blue-600 flex flex-col items-center gap-1 text-center"
          >
            <span className="text-2xl">🗺️</span>
            経路案内
          </a>
        </div>
        <button onClick={() => router.push("/")} className="w-full py-2 text-gray-600 text-xs">
          平時モードに戻る
        </button>
      </div>
    </div>
  );
}
