"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { AEDLocation } from "@/app/api/aed/route";
import { findTopAEDs, type RankedAED } from "@/lib/distance";
import type { ResponderMarker } from "@/components/AEDMap";
import DoctorAuthModal from "@/components/DoctorAuthModal";

const AEDMap = dynamic(() => import("@/components/AEDMap"), { ssr: false });

// Demo default: 中央区庁舎
const DEFAULT_POS = { lat: 35.670599, lng: 139.77201 };

// Simulated medical responders in vicinity for Demo mode
const DEMO_RESPONDERS: ResponderMarker[] = [
  {
    id: "dr-1",
    name: "Dr.相山 (救急科)",
    role: "doctor",
    badge: "👨‍⚕️ 医師認証済",
    lat: 35.6712,
    lng: 139.7711,
    status: "現場直行中 (残り40m)",
    task: "胸骨圧迫・現地救命指揮",
  },
  {
    id: "nurse-1",
    name: "ナース鈴木",
    role: "nurse",
    badge: "👩‍⚕️ 看護師認証済",
    lat: 35.6698,
    lng: 139.7729,
    status: "第1位AEDへ移動中",
    task: "最寄りAED確保・現場搬送",
  },
  {
    id: "paramedic-1",
    name: "消防指令・救急隊",
    role: "responder",
    badge: "🚑 指令中枢連動",
    lat: 35.6725,
    lng: 139.7738,
    status: "119自動連携・現場アプローチ中",
    task: "通報・誘導支援",
  },
];

export default function DailyPage() {
  const router = useRouter();
  const [aeds, setAeds] = useState<AEDLocation[]>([]);
  const [userPos, setUserPos] = useState(DEFAULT_POS);
  const [topAEDs, setTopAEDs] = useState<RankedAED[]>([]);
  const [loading, setLoading] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [selected, setSelected] = useState<RankedAED | null>(null);
  const [demoActive, setDemoActive] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [dispatchToast, setDispatchToast] = useState(false);

  // Load AED data once, compute top3 from current pos
  useEffect(() => {
    fetch("/api/aed")
      .then((r) => r.json())
      .then((data) => {
        const list: AEDLocation[] = data.aeds ?? [];
        setAeds(list);
        setTopAEDs(findTopAEDs(DEFAULT_POS.lat, DEFAULT_POS.lng, list, 3));
        setLoading(false);
      });
  }, []);

  const recalculate = useCallback((pos: { lat: number; lng: number }, list: AEDLocation[]) => {
    setUserPos(pos);
    setTopAEDs(findTopAEDs(pos.lat, pos.lng, list, 3));
    setSelected(null);
  }, []);

  const getGPS = useCallback(() => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        recalculate({ lat: p.coords.latitude, lng: p.coords.longitude }, aeds);
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { timeout: 8000 }
    );
  }, [aeds, recalculate]);

  const toggleDemo = () => {
    const nextState = !demoActive;
    setDemoActive(nextState);
    if (nextState) {
      setDispatchToast(true);
      setTimeout(() => setDispatchToast(false), 5000);
    }
  };

  const nearest = topAEDs[0];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between shadow-xs sticky top-0 z-50">
        <div>
          <p className="text-[10px] text-gray-400 tracking-widest uppercase font-semibold">AED Navigator</p>
          <h1 className="text-base font-bold text-gray-800 flex items-center gap-1.5">
            中央区 AEDマップ
            {demoActive && (
              <span className="text-[10px] bg-red-600 text-white font-black px-2 py-0.5 rounded-full animate-pulse">
                🚨 デモ出動中
              </span>
            )}
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowAuthModal(true)}
            className="text-xs bg-purple-50 border border-purple-200 text-purple-700 font-semibold px-2.5 py-1.5 rounded-xl hover:bg-purple-100 transition-colors flex items-center gap-1"
          >
            <span>👨‍⚕️</span> 資格照会
          </button>

          <button
            onClick={toggleDemo}
            className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-xs flex items-center gap-1 ${
              demoActive
                ? "bg-red-600 text-white animate-pulse"
                : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
            }`}
          >
            <span>⚡</span>
            {demoActive ? "デモ解除" : "デモ起動"}
          </button>
        </div>
      </header>

      {/* Demo Toast Notification */}
      {dispatchToast && (
        <div className="mx-4 mt-3 p-3 bg-red-600 text-white rounded-2xl shadow-lg border border-red-500 animate-bounce flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-2">
            <span className="text-xl">📢</span>
            <div>
              <p className="font-bold">【バックエンド自動通知発動】</p>
              <p className="text-red-100 text-[11px]">近隣の医師・看護師に緊急タスク配信完了！マップ更新済み</p>
            </div>
          </div>
          <button onClick={() => setDispatchToast(false)} className="text-white/80 font-bold text-base px-2">✕</button>
        </div>
      )}

      {/* Active Demo Responder Dispatch Status Drawer */}
      {demoActive && (
        <div className="mx-4 mt-3 bg-purple-950 text-white rounded-2xl p-4 shadow-md border border-purple-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-purple-300 flex items-center gap-1">
              <span className="animate-pulse">📡</span> バックエンドリアルタイムタスク指示
            </p>
            <span className="text-[10px] bg-purple-800 text-purple-200 px-2 py-0.5 rounded-full font-bold">
              3名自動出動中
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {DEMO_RESPONDERS.map((r) => (
              <div key={r.id} className="bg-purple-900/60 rounded-xl p-2.5 border border-purple-700/50 flex items-center justify-between">
                <div>
                  <p className="font-bold text-white flex items-center gap-1">
                    <span>{r.badge}</span>
                    <span>{r.name}</span>
                  </p>
                  <p className="text-[11px] text-purple-300 mt-0.5">タスク: {r.task}</p>
                </div>
                <span className="text-[11px] text-green-400 font-bold bg-green-950/60 px-2 py-1 rounded-lg border border-green-800/40">
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Map — large */}
      <div className="mx-4 mt-3 rounded-2xl overflow-hidden shadow-sm border border-gray-100 relative" style={{ height: 340 }}>
        {loading ? (
          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <AEDMap
              aeds={aeds}
              userLat={userPos.lat}
              userLng={userPos.lng}
              topAEDs={topAEDs}
              responders={demoActive ? DEMO_RESPONDERS : []}
            />
            {/* GPS button — floating on map */}
            <button
              onClick={getGPS}
              disabled={gpsLoading}
              className="absolute bottom-3 right-3 z-[1000] bg-white shadow-lg rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs font-semibold text-gray-700 border border-gray-200 disabled:opacity-60"
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

      {/* Quick Action: Request AED Transport Dispatch */}
      <div className="mx-4 mt-3">
        <button
          onClick={toggleDemo}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all ${
            demoActive
              ? "bg-purple-700 text-white hover:bg-purple-800"
              : "bg-gradient-to-r from-red-600 to-orange-600 text-white hover:opacity-95"
          }`}
        >
          <span className="text-xl">🚑</span>
          <span>{demoActive ? "AED搬送要請タスク出動中 (デモ動作中)" : "AED搬送依頼・近隣医療従事者呼び出し (デモ)"}</span>
        </button>
      </div>

      {/* Stats */}
      <div className="mx-4 mt-3 grid grid-cols-3 gap-2">
        {[
          { value: `${aeds.length}台`, label: "中央区のAED" },
          { value: `${aeds.filter((a) => a.accessible).length}台`, label: "今すぐ使用可" },
          { value: nearest ? `${nearest.distanceM}m` : "—", label: "最寄りAED" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100">
            <p className="text-lg font-bold text-gray-800">{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Top 3 list */}
      <div className="mx-4 mt-3">
        <p className="text-xs text-gray-400 font-semibold mb-2 px-1">近隣AED TOP 3（現在地から近い順）</p>
        <div className="space-y-2">
          {loading
            ? [1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl h-16 animate-pulse border border-gray-100" />
              ))
            : topAEDs.map((aed) => (
                <button
                  key={aed.id}
                  onClick={() => setSelected(selected?.id === aed.id ? null : aed)}
                  className={`w-full bg-white rounded-xl p-3 border text-left transition-all ${
                    selected?.id === aed.id ? "border-blue-400 shadow-md" : "border-gray-100 shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                      style={{ background: ["#ef4444", "#f97316", "#3b82f6"][aed.rank - 1] }}
                    >
                      {aed.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm text-gray-800 truncate">{aed.name}</p>
                        <span className="text-sm font-bold text-gray-600 flex-shrink-0">{aed.distanceM}m</span>
                      </div>
                      {aed.installLocation && (
                        <p className="text-xs text-amber-600 mt-0.5">📌 {aed.installLocation}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                          aed.accessible ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                        }`}>
                          {aed.accessible ? "✅ 使用可" : "🔒 施錠中"}
                        </span>
                      </div>
                    </div>
                  </div>
                  {selected?.id === aed.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-2">{aed.address}</p>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${aed.lat},${aed.lng}&travelmode=walking`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-block text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold"
                      >
                        🗺️ 経路を確認する
                      </a>
                    </div>
                  )}
                </button>
              ))}
        </div>
      </div>

      {/* Practice timer */}
      <div className="mx-4 mt-3 bg-blue-50 rounded-2xl p-4 border border-blue-100">
        <p className="text-sm font-bold text-blue-700 mb-1">⏱️ タイムトライアル</p>
        <p className="text-xs text-blue-500 mb-3">
          第1位のAEDまで実際に歩いて往復時間を計測。<br />
          平時に把握しておくことで、有事に迷わず動けます。
        </p>
        <PracticeTimer nearest={nearest ?? null} />
      </div>

      <div className="h-28" />

      {/* Emergency button — sticky */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pt-6 pb-6 px-4 z-40">
        <button
          onClick={() => router.push("/emergency")}
          className="w-full py-5 rounded-2xl bg-red-600 shadow-[0_4px_20px_rgba(239,68,68,0.45)] flex items-center justify-center gap-3 active:scale-98 transition-transform"
        >
          <span className="text-3xl">🚨</span>
          <div className="text-left">
            <p className="font-bold text-white text-lg leading-tight">緊急モード起動</p>
            <p className="text-red-200 text-xs">最寄りAED TOP3特定 & 救助指示を発動</p>
          </div>
        </button>
      </div>

      {/* Doctor Authentication Modal */}
      <DoctorAuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}

function PracticeTimer({ nearest }: { nearest: RankedAED | null }) {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const startRef = useState<number>(0);

  const start = useCallback(() => {
    startRef[1](Date.now());
    setState("running");
    setElapsed(0);
  }, [startRef]);

  useEffect(() => {
    if (state !== "running") return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef[0]) / 1000)), 500);
    return () => clearInterval(id);
  }, [state, startRef]);

  if (state === "idle") {
    return (
      <button onClick={start} disabled={!nearest} className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm disabled:opacity-40">
        スタート（往復してゴール）
      </button>
    );
  }
  if (state === "running") {
    return (
      <div className="text-center">
        <p className="text-3xl font-bold text-blue-700 tabular-nums">{elapsed}秒</p>
        <p className="text-xs text-blue-500 mb-3">{nearest?.name} まで往復して戻ったらストップ</p>
        <button onClick={() => setState("done")} className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm">⏹ ゴール</button>
      </div>
    );
  }
  return (
    <div className="text-center">
      <p className="text-2xl font-bold text-blue-700">🎉 {elapsed}秒</p>
      <p className="text-xs text-blue-500 mt-1 mb-3">有事はこの時間でAEDを届けられます</p>
      <button onClick={() => setState("idle")} className="w-full py-2.5 rounded-xl bg-white border border-blue-200 text-blue-600 font-semibold text-sm">もう一度</button>
    </div>
  );
}
