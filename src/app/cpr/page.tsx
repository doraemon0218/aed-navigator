"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import type { RankedAED } from "@/lib/distance";
import { getTipsForAED } from "@/lib/tips";
import { getTipSummary } from "@/lib/tipSummary";
import { getAEDAccess } from "@/lib/aedAccess";

// Step indices
const CALLOUT_STEP = 1;
const SIREN_STEP = 2;
const CAROTID_STEP = 3;
const BEAT_STEP = 4;
const AED_POWER_STEP = 5;
const AED_PAD_STEP = 6;
const AED_ANALYZE_STEP = 7;
const AED_SHOCK_STEP = 8;
const AED_CPR2_STEP = 9;

const STEPS = [
  {
    emoji: "🔍",
    title: "安全確認",
    text: "危険はないか",
    spoken: "周囲の安全を確認してください。",
    duration: 4,
  },
  {
    emoji: "👋",
    title: "意識を確認",
    text: "両肩を叩く\n返事は？",
    spoken: "大丈夫ですか！　大丈夫ですか！　返事はありますか！",
    duration: 6,
    callOut: true,
  },
  {
    emoji: "🔊",
    title: "助けを呼ぶ",
    text: "119！\nAED！",
    spoken: "あなたはそこを離れないで！　百十九番に通報してください！　エーイーディーを持ってきてください！",
    duration: 10,
    siren: true,
  },
  {
    emoji: "🤲",
    title: "呼吸・脈を確認",
    text: "胸の動きを見る\n喉仏の横→脈も確認（10秒）",
    spoken: "胸が動いているか確認してください。のどぼとけの横に指を当て、呼吸と脈を十秒以内に確認してください。",
    duration: 10,
  },
  {
    emoji: "💪",
    title: "胸骨圧迫",
    text: "強く・速く\n止めない",
    spoken: "胸骨の下半分に両手を重ねてください。肘をまっすぐ伸ばし、体重をかけて五センチ以上押してください。圧迫のたびに胸を完全に戻してください。止めずにリズムに合わせて続けてください。",
    duration: 120,
  },
  // ── AED操作ステップ ──
  {
    emoji: "🟢",
    title: "AED電源ON",
    text: "フタを開ける\n音声に従って",
    spoken: "エーイーディーの電源を入れてください。フタを開けるか、電源ボタンを押してください。エーイーディーの音声案内に従ってください。",
    duration: 10,
  },
  {
    emoji: "🩹",
    title: "パッドを貼る",
    text: "①右胸の鎖骨下\n②左わき腹",
    spoken: "パッドを取り出してください。一枚目は右胸の鎖骨の下、二枚目は左わき腹に貼ってください。",
    duration: 20,
  },
  {
    emoji: "📡",
    title: "解析中",
    text: "離れて！\n音声に従う",
    spoken: "エーイーディーの音声指示に従ってください。",
    duration: 8,
  },
  {
    emoji: "⚡",
    title: "ショック",
    text: "離れて！\n音声に従う",
    spoken: "エーイーディーの音声指示に従ってください。",
    duration: 10,
  },
  {
    emoji: "💪",
    title: "CPR再開",
    text: "すぐに\n胸骨圧迫",
    spoken: "ショック後すぐに胸骨圧迫を再開してください。リズムに合わせて押し続けてください。",
    duration: 999,
  },
];

type AudioCtxType = AudioContext & { state: string };

function createSiren(audioCtx: AudioCtxType): () => void {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  gain.gain.value = 0.6;
  osc.frequency.value = 440;
  osc.start();

  let rising = true;
  const id = setInterval(() => {
    const t = audioCtx.currentTime;
    osc.frequency.cancelScheduledValues(t);
    osc.frequency.linearRampToValueAtTime(rising ? 880 : 440, t + 0.5);
    rising = !rising;
  }, 500);

  return () => {
    clearInterval(id);
    try { osc.stop(); } catch { /* already stopped */ }
  };
}

// ── Visual components for AED steps ─────────────────────────────────

function AEDPowerVisual({ active }: { active: boolean }) {
  return (
    <div className="flex flex-col items-center mb-4">
      <div className={`rounded-2xl p-8 mb-3 transition-all duration-500 ${active ? "bg-green-600 shadow-[0_0_60px_rgba(34,197,94,0.7)]" : "bg-gray-800"}`} style={{ minWidth: 180 }}>
        <div className="flex flex-col items-center gap-3">
          <div className={`w-16 h-16 rounded-full border-4 flex items-center justify-center transition-all ${active ? "border-white bg-green-500 shadow-[0_0_20px_rgba(255,255,255,0.8)]" : "border-gray-500 bg-gray-700"}`}>
            <span className="text-white font-black text-2xl">⏻</span>
          </div>
          <p className={`font-black text-lg transition-colors ${active ? "text-white" : "text-gray-400"}`}>電源ON</p>
        </div>
      </div>
      <p className="text-green-300 text-sm font-semibold animate-pulse text-center">AEDのフタを開けると自動で電源が入ります</p>
    </div>
  );
}

function AEDPadVisual({ phase }: { phase: 0 | 1 | 2 }) {
  return (
    <div className="flex flex-col items-center mb-4">
      {/* Body diagram */}
      <div className="relative bg-gray-800 rounded-2xl p-4 mb-3" style={{ width: 200, height: 220 }}>
        {/* Head */}
        <div className="absolute left-1/2 -translate-x-1/2 top-3 w-12 h-12 rounded-full bg-gray-600 border-2 border-gray-500" />
        {/* Body */}
        <div className="absolute left-1/2 -translate-x-1/2 top-16 w-24 h-28 rounded-xl bg-gray-600 border-2 border-gray-500" />
        {/* Pad 1: right upper chest */}
        <div className={`absolute transition-all duration-500 ${phase >= 1 ? "opacity-100 scale-100" : "opacity-40 scale-90"}`}
          style={{ top: 62, left: 28 }}>
          <div className={`w-12 h-10 rounded-lg flex flex-col items-center justify-center border-2 font-bold text-xs ${phase >= 1 ? "bg-red-500 border-red-300 text-white shadow-[0_0_15px_rgba(239,68,68,0.8)]" : "bg-gray-700 border-gray-500 text-gray-400"}`}>
            <span>①</span>
            <span className="text-xs leading-none">右胸</span>
          </div>
        </div>
        {/* Pad 2: left lower chest */}
        <div className={`absolute transition-all duration-500 delay-500 ${phase >= 2 ? "opacity-100 scale-100" : "opacity-40 scale-90"}`}
          style={{ top: 108, right: 20 }}>
          <div className={`w-12 h-10 rounded-lg flex flex-col items-center justify-center border-2 font-bold text-xs ${phase >= 2 ? "bg-red-500 border-red-300 text-white shadow-[0_0_15px_rgba(239,68,68,0.8)]" : "bg-gray-700 border-gray-500 text-gray-400"}`}>
            <span>②</span>
            <span className="text-xs leading-none">左脇</span>
          </div>
        </div>
      </div>
      <div className="text-center">
        <p className={`text-sm font-bold transition-colors ${phase >= 1 ? "text-red-400" : "text-gray-500"}`}>① 右胸の鎖骨の下</p>
        <p className={`text-sm font-bold transition-colors ${phase >= 2 ? "text-red-400" : "text-gray-500"}`}>② 左わき腹</p>
      </div>
    </div>
  );
}

function AEDAnalyzeVisual({ flash }: { flash: boolean }) {
  return (
    <div className="flex flex-col items-center mb-4">
      <div
        className={`rounded-2xl flex flex-col items-center justify-center mb-3 transition-all duration-300 ${flash ? "bg-yellow-500 shadow-[0_0_80px_rgba(234,179,8,0.9)]" : "bg-yellow-900"}`}
        style={{ width: 180, height: 160 }}
      >
        <span className="text-5xl mb-2">{flash ? "📡" : "📡"}</span>
        <span className={`font-black text-xl transition-colors ${flash ? "text-gray-900" : "text-yellow-500"}`}>
          {flash ? "解　析　中" : "解析待機"}
        </span>
      </div>
      <p className="text-yellow-400 text-sm font-black animate-pulse text-center">
        AEDの音声指示に従ってください
      </p>
    </div>
  );
}

function AEDShockVisual({ flash }: { flash: boolean }) {
  return (
    <div className="flex flex-col items-center mb-4">
      <div
        className={`rounded-full flex flex-col items-center justify-center mb-3 transition-all duration-150 ${flash ? "scale-110 shadow-[0_0_100px_rgba(234,179,8,1)]" : "scale-100"}`}
        style={{ width: 180, height: 180, background: flash ? "#eab308" : "#713f12" }}
      >
        <span className="text-6xl">{flash ? "⚡" : "⚡"}</span>
        <span className={`font-black text-base mt-1 ${flash ? "text-gray-900" : "text-yellow-400"}`}>
          {flash ? "ショック！" : "ボタンを押す"}
        </span>
      </div>
      <p className="text-yellow-300 text-sm font-black animate-pulse text-center">
        AEDの音声指示に従ってください
      </p>
    </div>
  );
}

function CarotidVisual() {
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  const [pulse, setPulse] = useState(false);

  // Loop: center(1s) → slide(1.2s) → pulse(2.8s) → repeat
  useEffect(() => {
    const run = () => {
      setPhase(0);
      setPulse(false);
      const t1 = setTimeout(() => setPhase(1), 1000);
      const t2 = setTimeout(() => setPhase(2), 2200);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    };
    const cleanup = run();
    const id = setInterval(run, 5200);
    return () => { cleanup?.(); clearInterval(id); };
  }, []);

  useEffect(() => {
    if (phase !== 2) { setPulse(false); return; }
    const id = setInterval(() => setPulse((p) => !p), 650);
    return () => clearInterval(id);
  }, [phase]);

  // Finger X: phase0=on 喉仏 center, phase1/2=slid right to carotid
  const fingerLeft = phase === 0 ? 88 : 128;

  return (
    <div className="flex flex-col items-center mb-4">
      {/* Face illustration — 220×270 canvas */}
      <div className="relative" style={{ width: 220, height: 270 }}>

        {/* Shoulders */}
        <div className="absolute bg-amber-100 border-2 border-amber-300 rounded-t-3xl"
          style={{ bottom: 0, left: 10, right: 10, height: 80 }} />

        {/* Neck */}
        <div className="absolute bg-amber-50 border-2 border-amber-300 border-b-0"
          style={{ top: 118, left: 82, width: 56, height: 100 }} />

        {/* 喉仏 bump */}
        <div className="absolute rounded-md bg-amber-200 border border-amber-400 flex items-center justify-center"
          style={{ top: 138, left: 95, width: 30, height: 18 }}>
          <span className="text-amber-800 font-black" style={{ fontSize: 8 }}>喉仏</span>
        </div>

        {/* Neck shadow lines */}
        <div className="absolute border-r border-amber-200"
          style={{ top: 122, left: 96, height: 80, width: 1 }} />
        <div className="absolute border-r border-amber-200"
          style={{ top: 122, left: 123, height: 80, width: 1 }} />

        {/* Left ear */}
        <div className="absolute bg-amber-100 border-2 border-amber-300 rounded-full"
          style={{ top: 42, left: 24, width: 18, height: 30 }} />
        {/* Right ear */}
        <div className="absolute bg-amber-100 border-2 border-amber-300 rounded-full"
          style={{ top: 42, left: 178, width: 18, height: 30 }} />

        {/* Head */}
        <div className="absolute bg-amber-50 border-2 border-amber-300"
          style={{ top: 0, left: 42, width: 136, height: 130, borderRadius: "50% 50% 45% 45%" }} />

        {/* Eyebrow left */}
        <div className="absolute bg-amber-700 rounded-full"
          style={{ top: 34, left: 70, width: 28, height: 4, borderRadius: 3, transform: "rotate(-4deg)" }} />
        {/* Eyebrow right */}
        <div className="absolute bg-amber-700 rounded-full"
          style={{ top: 34, left: 122, width: 28, height: 4, borderRadius: 3, transform: "rotate(4deg)" }} />

        {/* Eye left (closed — unconscious) */}
        <div className="absolute bg-amber-100 border-2 border-amber-700 overflow-hidden"
          style={{ top: 44, left: 68, width: 28, height: 14, borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%" }}>
          <div className="absolute bg-amber-700 rounded-full" style={{ top: 9, left: 3, width: 22, height: 4 }} />
        </div>
        {/* Eye right */}
        <div className="absolute bg-amber-100 border-2 border-amber-700 overflow-hidden"
          style={{ top: 44, left: 124, width: 28, height: 14, borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%" }}>
          <div className="absolute bg-amber-700 rounded-full" style={{ top: 9, left: 3, width: 22, height: 4 }} />
        </div>

        {/* Nose */}
        <div className="absolute flex gap-3" style={{ top: 68, left: 97 }}>
          <div className="bg-amber-300 rounded-full" style={{ width: 6, height: 6 }} />
          <div className="bg-amber-300 rounded-full" style={{ width: 6, height: 6 }} />
        </div>

        {/* Mouth (slightly open / relaxed) */}
        <div className="absolute bg-amber-700 rounded-full"
          style={{ top: 88, left: 88, width: 44, height: 5, borderRadius: 4, opacity: 0.5 }} />

        {/* Arrow guide (phase 0 only) */}
        {phase === 0 && (
          <div className="absolute font-black text-orange-400 animate-pulse"
            style={{ top: 145, left: 158, fontSize: 22 }}>→</div>
        )}

        {/* Pulse ripple (phase 2) */}
        {phase === 2 && (
          <div
            className="absolute rounded-full border-2 border-red-400 transition-all duration-300"
            style={{
              top: 140, left: fingerLeft + 4,
              width: pulse ? 44 : 28,
              height: pulse ? 44 : 28,
              opacity: pulse ? 0.65 : 0.2,
              marginTop: pulse ? -8 : 0,
              marginLeft: pulse ? -8 : 0,
            }}
          />
        )}

        {/* Two fingers — slide from 喉仏 to right side of neck */}
        <div
          className="absolute flex gap-1.5 transition-all"
          style={{ top: 155, left: fingerLeft, transitionDuration: "900ms", transitionTimingFunction: "ease-in-out" }}
        >
          {/* 人差し指 */}
          <div
            className="rounded-t-full rounded-b-lg border-2 border-red-600 flex items-end justify-center pb-1 transition-all"
            style={{
              width: 16, height: 48,
              background: phase === 2 && pulse ? "#fca5a5" : "#f87171",
              transitionDuration: "300ms",
            }}
          >
            <span className="text-white font-black" style={{ fontSize: 7 }}>人</span>
          </div>
          {/* 中指 (少し長め) */}
          <div
            className="rounded-t-full rounded-b-lg border-2 border-red-600 flex items-end justify-center pb-1 transition-all"
            style={{
              width: 16, height: 56,
              marginTop: -8,
              background: phase === 2 && pulse ? "#fca5a5" : "#f87171",
              transitionDuration: "300ms",
            }}
          >
            <span className="text-white font-black" style={{ fontSize: 8 }}>中</span>
          </div>
        </div>
      </div>

      {/* Caption */}
      <div className="mt-1 text-center h-6">
        {phase === 0 && <p className="text-amber-400 text-sm font-bold">喉仏に2本指を当てて</p>}
        {phase === 1 && <p className="text-amber-400 text-sm font-bold animate-pulse">外側にスライド →</p>}
        {phase === 2 && <p className={`text-sm font-bold transition-colors ${pulse ? "text-red-400" : "text-red-300"}`}>この位置で脈を確認（10秒）</p>}
      </div>
    </div>
  );
}

// ── Chest compression illustration ──────────────────────────────────

function ChestCompressionVisual({ beat }: { beat: boolean }) {
  const [panel, setPanel] = useState(0);
  const PANEL_LABELS = ["押す場所", "手の組み方", "深さ・リコイル"];

  useEffect(() => {
    const id = setInterval(() => setPanel((p) => (p + 1) % 3), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center mb-2 w-full">
      {/* Panel tabs */}
      <div className="flex gap-1.5 mb-2">
        {PANEL_LABELS.map((label, i) => (
          <button
            key={i}
            onClick={() => setPanel(i)}
            className={`px-2.5 py-1 rounded-full font-bold text-xs transition-all ${
              panel === i ? "bg-orange-500 text-white" : "bg-gray-800 text-gray-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* PANEL 0 — 押す場所: front torso view */}
      {panel === 0 && (
        <div className="relative rounded-xl" style={{ width: 270, height: 200, background: "#0f172a" }}>
          {/* Torso (front) */}
          <div className="absolute bg-amber-50 border-2 border-amber-300 rounded-3xl"
            style={{ width: 142, height: 162, top: 18, left: 64 }} />
          {/* Neck */}
          <div className="absolute bg-amber-50 border border-amber-300 rounded-t-lg"
            style={{ width: 34, height: 22, top: 0, left: 118 }} />
          {/* Sternum center line */}
          <div className="absolute rounded-full"
            style={{ width: 3, height: 110, top: 22, left: 134, background: "#92400e", opacity: 0.45 }} />
          {/* Ribs L */}
          {[0, 1, 2].map((i) => (
            <div key={i} className="absolute border-t border-amber-300/25 rounded-tl-full"
              style={{ width: 50, height: 18, top: 50 + i * 22, left: 74, borderRadius: "0 0 0 28px" }} />
          ))}
          {/* Ribs R */}
          {[0, 1, 2].map((i) => (
            <div key={i} className="absolute border-t border-amber-300/25 rounded-tr-full"
              style={{ width: 50, height: 18, top: 50 + i * 22, right: 64, borderRadius: "0 0 28px 0" }} />
          ))}
          {/* Nipple L */}
          <div className="absolute rounded-full border-2 border-amber-500 bg-amber-200 flex items-center justify-center"
            style={{ width: 16, height: 16, top: 80, left: 76 }}>
            <span className="text-amber-800 font-black" style={{ fontSize: 8 }}>L</span>
          </div>
          {/* Nipple R */}
          <div className="absolute rounded-full border-2 border-amber-500 bg-amber-200 flex items-center justify-center"
            style={{ width: 16, height: 16, top: 80, right: 66 }}>
            <span className="text-amber-800 font-black" style={{ fontSize: 8 }}>R</span>
          </div>
          {/* Nipple horizontal guide */}
          <div className="absolute" style={{ width: 82, height: 1, top: 88, left: 94, background: "#f59e0b", opacity: 0.2 }} />
          {/* Target zone */}
          <div className="absolute rounded-xl border-2 border-red-500 flex items-center justify-center"
            style={{ width: 54, height: 44, top: 72, left: 108, background: "rgba(239,68,68,0.18)" }}>
            <p className="text-red-300 font-black text-center leading-tight" style={{ fontSize: 7 }}>
              乳頭の間<br />胸骨下部
            </p>
          </div>
          {/* Bottom hand (touches chest) */}
          <div className={`absolute rounded-lg border-2 border-blue-300 transition-all ${beat ? "bg-blue-400" : "bg-blue-800"}`}
            style={{ width: 48, height: 20, top: beat ? 108 : 100, left: 111, transitionDuration: beat ? "60ms" : "220ms" }} />
          {/* Top hand (over bottom) */}
          <div className={`absolute rounded-lg border-2 border-blue-500 transition-all ${beat ? "bg-blue-600" : "bg-blue-900"}`}
            style={{ width: 48, height: 20, top: beat ? 90 : 82, left: 111, transitionDuration: beat ? "60ms" : "220ms" }} />
          {/* Rescuer arm from top */}
          <div className="absolute rounded-full" style={{ width: 14, height: 56, top: 22, left: 128, background: "#1e3a5f", opacity: 0.6 }} />
          {/* Labels */}
          <p className="absolute text-red-400 font-black" style={{ top: 5, left: 5, fontSize: 9 }}>🎯 乳頭の間を押す</p>
          <p className="absolute text-blue-300 font-black" style={{ top: 18, left: 5, fontSize: 9 }}>↓ まっすぐ体重をかける</p>
          <p className="absolute font-black" style={{ bottom: 5, right: 5, fontSize: 9, color: beat ? "#f87171" : "#6ee7b7" }}>
            {beat ? "圧迫中" : "離す（recoil）"}
          </p>
        </div>
      )}

      {/* PANEL 1 — 手の組み方: hand clasping */}
      {panel === 1 && (
        <div className="relative rounded-xl flex items-center justify-center" style={{ width: 270, height: 200, background: "#0f172a" }}>
          <div className="flex flex-col items-center">
            <p className="text-amber-300 font-bold mb-1.5" style={{ fontSize: 10 }}>↑ 上の手（指を組む）</p>

            {/* Top hand fingers up */}
            <div className="flex justify-center gap-1.5" style={{ marginBottom: -2 }}>
              {[15, 20, 22, 20, 14].map((h, i) => (
                <div key={i} className="bg-amber-300 border border-amber-500 rounded-t-full"
                  style={{ width: 14, height: h }} />
              ))}
            </div>

            {/* Top hand palm */}
            <div className="bg-amber-300 border-2 border-amber-500 rounded-xl flex items-center justify-center"
              style={{ width: 112, height: 34 }}>
              <p className="text-amber-900 font-black" style={{ fontSize: 11 }}>指を組む</p>
            </div>

            {/* Interlocked fingers zone */}
            <div className="flex justify-center gap-0.5" style={{ marginBottom: -1 }}>
              {[10, 13, 13, 10].map((h, i) => (
                <div key={i} className="bg-amber-200 border border-amber-400 rounded-b-full"
                  style={{ width: 16, height: h, opacity: 0.65 }} />
              ))}
            </div>
            <div className="flex justify-center gap-0.5" style={{ marginTop: -1 }}>
              {[10, 13, 13, 10].map((h, i) => (
                <div key={i} className="bg-amber-100 border border-amber-300 rounded-t-full"
                  style={{ width: 16, height: h, opacity: 0.7 }} />
              ))}
            </div>

            {/* Bottom hand palm */}
            <div className="bg-amber-100 border-2 border-amber-400 rounded-xl flex items-center justify-center"
              style={{ width: 112, height: 34, marginTop: -1 }}>
              <p className="text-amber-800 font-black" style={{ fontSize: 11 }}>手根部で押す</p>
            </div>

            {/* Bottom hand fingers down (spread, lifted off chest) */}
            <div className="flex justify-center gap-1.5" style={{ marginTop: -2, opacity: 0.45 }}>
              {[14, 18, 20, 18, 13].map((h, i) => (
                <div key={i} className="bg-amber-100 border border-amber-300 rounded-b-full"
                  style={{ width: 14, height: h }} />
              ))}
            </div>

            <p className="text-amber-200 font-bold mt-1.5" style={{ fontSize: 10 }}>↓ 下の手（胸に当たる側）</p>

            {/* Key notes */}
            <div className="flex gap-2 mt-3">
              <div className="rounded-lg px-2.5 py-1" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)" }}>
                <p className="text-green-400 font-black" style={{ fontSize: 10 }}>✅ 指は浮かせる</p>
              </div>
              <div className="rounded-lg px-2.5 py-1" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)" }}>
                <p className="text-blue-400 font-black" style={{ fontSize: 10 }}>肘はまっすぐ</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PANEL 2 — 深さ・リコイル: side view */}
      {panel === 2 && (
        <div className="relative rounded-xl" style={{ width: 270, height: 200, background: "#0f172a" }}>
          {/* Ground */}
          <div className="absolute bottom-8 left-10 right-10 h-1 rounded-full bg-gray-600" />
          <p className="absolute bottom-2 right-8 text-gray-500 font-semibold" style={{ fontSize: 8 }}>床</p>

          {/* Patient head (side) */}
          <div className="absolute bg-amber-50 border-2 border-amber-300 rounded-full"
            style={{ width: 34, height: 40, top: 108, left: 12 }} />
          {/* Neck */}
          <div className="absolute bg-amber-50 border border-amber-300 rounded"
            style={{ width: 13, height: 16, top: 120, left: 44 }} />
          {/* Torso (side oval) */}
          <div className="absolute bg-blue-700 border-2 border-blue-500"
            style={{ width: 158, height: 50, top: 112, left: 52, borderRadius: "28px" }} />
          {/* Chest surface */}
          <div className="absolute bg-amber-100 border border-amber-300 rounded-full transition-all"
            style={{
              width: 38, height: 10,
              top: beat ? 120 : 111,
              left: 114,
              transitionDuration: beat ? "60ms" : "220ms",
            }} />
          {/* Compression indent */}
          {beat && (
            <div className="absolute rounded-b-lg bg-blue-900"
              style={{ width: 38, height: 10, top: 112, left: 114, opacity: 0.65 }} />
          )}

          {/* Rescuer forearm (side) */}
          <div className="absolute bg-amber-200 border border-amber-400 rounded-full transition-all"
            style={{
              width: 14,
              height: beat ? 86 : 70,
              top: beat ? 26 : 42,
              left: 124,
              transitionDuration: beat ? "60ms" : "220ms",
            }} />
          {/* Upper arm at angle */}
          <div className="absolute bg-amber-300 border border-amber-400 rounded-full"
            style={{ width: 58, height: 12, top: beat ? 24 : 40, left: 86,
              transform: "rotate(-32deg)", transformOrigin: "96% 50%",
              transition: beat ? "top 60ms" : "top 220ms" }} />

          {/* Hands */}
          <div className={`absolute rounded-lg border-2 transition-all ${beat ? "border-blue-300 bg-blue-500" : "border-blue-600 bg-blue-900"}`}
            style={{
              width: 42, height: 14,
              top: beat ? 118 : 104,
              left: 112,
              transitionDuration: beat ? "60ms" : "220ms",
            }} />

          {/* Depth arrow */}
          <div className="absolute flex flex-col items-center" style={{ top: 88, right: 12 }}>
            <div className="w-0.5 bg-yellow-400 transition-all"
              style={{ height: beat ? 32 : 14, transitionDuration: beat ? "60ms" : "220ms" }} />
            <p className="text-yellow-400 font-black" style={{ fontSize: 9 }}>↕5〜6cm</p>
          </div>

          {/* Legs hint */}
          <div className="absolute bg-amber-100 border border-amber-300 rounded-full"
            style={{ width: 80, height: 14, top: 148, left: 182, opacity: 0.45 }} />

          {/* Labels */}
          <p className="absolute text-blue-300 font-black" style={{ top: 4, left: 4, fontSize: 9 }}>肘を伸ばして体重で押す</p>
          <p className="absolute font-black" style={{ top: 16, left: 4, fontSize: 9, color: beat ? "#f87171" : "#86efac" }}>
            {beat ? "↓ 5cm以上 圧迫！" : "↑ 完全に戻す（recoil）"}
          </p>
        </div>
      )}

      {/* Beat circle + waveform */}
      <div className="flex items-center gap-4 mt-3">
        <div
          className={`w-20 h-20 rounded-full flex flex-col items-center justify-center font-black transition-all ${
            beat ? "bg-red-600 scale-110 shadow-[0_0_40px_rgba(239,68,68,0.8)]" : "bg-red-900 scale-100"
          }`}
          style={{ transitionDuration: beat ? "60ms" : "220ms" }}
        >
          <span className="text-white text-2xl leading-none">{beat ? "押す" : "離す"}</span>
          <span className="text-red-300 text-xs">110回/分</span>
        </div>
        <div className="flex gap-1 items-end h-8">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="w-2 rounded-full bg-red-500 transition-all duration-75"
              style={{ height: beat && i % 2 === 0 ? 32 : 10, opacity: beat && i % 2 === 0 ? 1 : 0.3 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Recovery position illustration ──────────────────────────────────

function RecoveryPositionVisual() {
  return (
    <div className="flex flex-col items-center mb-2">
      <div className="relative mx-auto rounded-2xl overflow-hidden" style={{ width: 310, height: 190, background: "#0f172a" }}>

        {/* Ground */}
        <div className="absolute bottom-7 left-6 right-6 h-1.5 rounded-full bg-gray-600" />
        <p className="absolute bottom-1 right-8 text-gray-500 font-semibold" style={{ fontSize: 9 }}>床・地面</p>

        {/* HEAD — tilted back, chin lifted, mouth downward for drainage */}
        <div className="absolute bg-amber-50 border-2 border-amber-300"
          style={{ width: 46, height: 54, top: 56, left: 12,
            borderRadius: "46% 54% 56% 44% / 52% 52% 48% 48%",
            transform: "rotate(-10deg)" }} />
        {/* Hair */}
        <div className="absolute bg-amber-700 rounded-t-full"
          style={{ width: 44, height: 26, top: 54, left: 13, opacity: 0.85 }} />
        {/* Chin (forward = airway open) */}
        <div className="absolute bg-amber-100 border border-amber-300"
          style={{ width: 24, height: 18, top: 96, left: 42,
            borderRadius: "50% 50% 60% 40%", transform: "rotate(-8deg)" }} />
        {/* Eye (closed) */}
        <div className="absolute bg-amber-800 rounded-full" style={{ width: 5, height: 3, top: 76, left: 28, opacity: 0.6 }} />
        {/* Mouth angled down (drainage position) */}
        <div className="absolute bg-amber-700 rounded-full"
          style={{ width: 10, height: 4, top: 92, left: 20, opacity: 0.55, transform: "rotate(14deg)" }} />

        {/* Airway label */}
        <div className="absolute" style={{ top: 34, left: 2 }}>
          <p className="text-green-400 font-black leading-tight" style={{ fontSize: 9 }}>↑ あごを上げる</p>
          <p className="text-green-400 font-black leading-tight" style={{ fontSize: 9 }}>（気道確保）</p>
        </div>
        {/* Drainage label */}
        <div className="absolute" style={{ top: 104, left: 2 }}>
          <p className="text-blue-300 font-black leading-tight" style={{ fontSize: 8 }}>口を下向き</p>
          <p className="text-blue-300 font-black leading-tight" style={{ fontSize: 8 }}>(嘔吐物排出)</p>
        </div>

        {/* NECK */}
        <div className="absolute bg-amber-50 border border-amber-300 rounded-lg"
          style={{ width: 16, height: 20, top: 90, left: 55 }} />

        {/* TORSO */}
        <div className="absolute bg-blue-600 border-2 border-blue-400 rounded-2xl"
          style={{ width: 136, height: 48, top: 86, left: 66 }} />
        {/* Shoulder (ground side) */}
        <div className="absolute bg-blue-700 border border-blue-500 rounded-full"
          style={{ width: 22, height: 22, top: 96, left: 60 }} />
        {/* HIP */}
        <div className="absolute bg-blue-700 border border-blue-500 rounded-xl"
          style={{ width: 44, height: 44, top: 88, left: 194 }} />

        {/* BOTTOM ARM — extended forward along floor */}
        <div className="absolute bg-amber-100 border border-amber-300 rounded-full"
          style={{ width: 80, height: 14, top: 114, left: 58, transform: "rotate(3deg)" }} />
        <div className="absolute bg-amber-100 border border-amber-300 rounded-lg"
          style={{ width: 20, height: 12, top: 116, left: 132 }} />

        {/* TOP ARM — bent at elbow, supporting */}
        <div className="absolute bg-amber-200 border border-amber-400 rounded-full"
          style={{ width: 60, height: 16, top: 70, left: 70,
            transform: "rotate(-22deg)", transformOrigin: "96% 50%" }} />
        <div className="absolute bg-amber-200 border border-amber-400 rounded-full"
          style={{ width: 44, height: 13, top: 52, left: 38, transform: "rotate(10deg)" }} />
        <div className="absolute bg-amber-200 border border-amber-400 rounded-lg"
          style={{ width: 18, height: 12, top: 53, left: 30 }} />

        {/* BOTTOM LEG — fairly straight */}
        <div className="absolute bg-amber-100 border border-amber-300 rounded-full"
          style={{ width: 86, height: 18, top: 126, left: 194, transform: "rotate(5deg)" }} />
        <div className="absolute bg-amber-100 border border-amber-300 rounded-full"
          style={{ width: 74, height: 15, top: 136, left: 260, transform: "rotate(3deg)" }} />

        {/* TOP THIGH — bent forward ~35° from hip */}
        <div className="absolute bg-amber-200 border border-amber-400 rounded-full"
          style={{ width: 64, height: 20, top: 98, left: 222,
            transform: "rotate(-36deg)", transformOrigin: "4% 50%" }} />
        {/* KNEE marker */}
        <div className="absolute bg-amber-300 border-2 border-yellow-400 rounded-full"
          style={{ width: 20, height: 20, top: 72, left: 238 }} />
        {/* TOP LOWER LEG — drops down from knee ≈90° */}
        <div className="absolute bg-amber-200 border border-amber-400 rounded-full"
          style={{ width: 60, height: 17, top: 76, left: 236,
            transform: "rotate(52deg)", transformOrigin: "4% 50%" }} />
        {/* Foot */}
        <div className="absolute bg-amber-200 border border-amber-400 rounded-lg"
          style={{ width: 18, height: 13, top: 110, left: 269, transform: "rotate(5deg)" }} />

        {/* Knee label */}
        <div className="absolute" style={{ top: 44, left: 230 }}>
          <p className="text-yellow-400 font-black leading-tight" style={{ fontSize: 9 }}>膝を</p>
          <p className="text-yellow-400 font-black leading-tight" style={{ fontSize: 9 }}>90°曲げる</p>
          <p className="text-yellow-400 font-black leading-tight" style={{ fontSize: 9 }}>↓</p>
        </div>
      </div>

      {/* Steps legend */}
      <div className="mt-2 flex gap-2 flex-wrap justify-center px-4">
        {["① 横向き", "② 膝90°", "③ あご上げ", "④ 口下向き", "⑤ 様子確認"].map((s, i) => (
          <span key={i} className="text-green-400 font-bold" style={{ fontSize: 9 }}>{s}</span>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────

export default function CPRPage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [top3AEDs, setTop3AEDs] = useState<RankedAED[]>([]);
  const [patientPos, setPatientPos] = useState<{ lat: number; lng: number } | null>(null);
  const [showRespondQR, setShowRespondQR] = useState(false);
  const [pulseDetected, setPulseDetected] = useState(false);
  const [carotidCount, setCarotidCount] = useState(10);
  const [beat, setBeat] = useState(false);
  const [sirenActive, setSirenActive] = useState(false);
  const [flash, setFlash] = useState(false);
  const [padPhase, setPadPhase] = useState<0 | 1 | 2>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sirenStopRef = useRef<(() => void) | null>(null);
  const audioCtxRef = useRef<AudioCtxType | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("emergency_top3");
      if (saved) setTop3AEDs(JSON.parse(saved));
      const pos = localStorage.getItem("emergency_patient_pos");
      if (pos) setPatientPos(JSON.parse(pos));
    } catch {}
  }, []);

  const getAudioCtx = useCallback((): AudioCtxType | null => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx() as AudioCtxType;
    }
    return audioCtxRef.current;
  }, []);

  const handleStart = useCallback(() => {
    const ctx = getAudioCtx();
    if (ctx?.state === "suspended") ctx.resume();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const unlock = new SpeechSynthesisUtterance(" ");
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
    }
    setStarted(true);
  }, [getAudioCtx]);

  const stopSiren = useCallback(() => {
    if (sirenStopRef.current) { sirenStopRef.current(); sirenStopRef.current = null; }
    setSirenActive(false);
    setFlash(false);
  }, []);

  const speak = useCallback((text: string, loud = false) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = loud ? 0.75 : 0.85;
    u.pitch = loud ? 1.3 : 1.05;
    u.volume = 1;
    const doSpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      const jaVoice = voices.find((v) => v.lang.startsWith("ja"));
      if (jaVoice) u.voice = jaVoice;
      window.speechSynthesis.speak(u);
    };
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener("voiceschanged", doSpeak, { once: true });
    } else {
      doSpeak();
    }
  }, []);

  // Step logic
  useEffect(() => {
    if (!started) return;
    const s = STEPS[step];
    if (!s) return;

    if (step !== SIREN_STEP) stopSiren();

    speak(s.spoken, !!("callOut" in s && s.callOut));

    if ("siren" in s && s.siren) {
      const ctx = getAudioCtx();
      if (ctx) {
        if (ctx.state === "suspended") ctx.resume();
        sirenStopRef.current = createSiren(ctx);
        setSirenActive(true);
      }
    }

    // Animate pad placement in phases
    if (step === AED_PAD_STEP) {
      setPadPhase(0);
      const t1 = setTimeout(() => setPadPhase(1), 1000);
      const t2 = setTimeout(() => setPadPhase(2), 5000);
      return () => { clearTimeout(t1); clearTimeout(t2); if (timerRef.current) clearTimeout(timerRef.current); };
    }

    // Carotid countdown: reset to 10 when entering the step
    if (step === CAROTID_STEP) setCarotidCount(10);

    if (step < STEPS.length - 1 && s.duration !== 999) {
      timerRef.current = setTimeout(() => setStep((p) => p + 1), s.duration * 1000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [step, started, speak, stopSiren, getAudioCtx]);

  // Carotid countdown tick — advances to BEAT_STEP when count hits 1
  useEffect(() => {
    if (!started || step !== CAROTID_STEP) return;
    const id = setInterval(() => {
      setCarotidCount((c) => {
        if (c <= 1) {
          clearInterval(id);
          if (timerRef.current) clearTimeout(timerRef.current);
          setStep(BEAT_STEP);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step, started]);

  // Screen flash: siren + analyze + shock
  useEffect(() => {
    const shouldFlash = sirenActive || step === AED_ANALYZE_STEP || step === AED_SHOCK_STEP;
    if (!shouldFlash || !started) { setFlash(false); return; }
    const speed = step === AED_SHOCK_STEP ? 300 : 500;
    const id = setInterval(() => setFlash((f) => !f), speed);
    return () => clearInterval(id);
  }, [sirenActive, step, started]);

  // Recovery position voice guide
  useEffect(() => {
    if (!pulseDetected) return;
    const lines = [
      "脈があります。回復体位に移行してください。",
      "患者の肩をゆっくり持ち、横向きに倒してください。",
      "上側の膝を九十度に曲げ、前に出して体を安定させてください。",
      "あごを少し上げて気道を確保してください。",
      "口から液体や嘔吐物が出た場合はふき取ってください。",
      "脈と呼吸を確認しながら、救急車を待ってください。",
    ];
    let i = 0;
    const speakNext = () => {
      if (i >= lines.length) return;
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(lines[i]!);
      u.lang = "ja-JP"; u.rate = 0.82; u.pitch = 1.05; u.volume = 1;
      const doSpeak = () => {
        const v = window.speechSynthesis.getVoices().find((x) => x.lang.startsWith("ja"));
        if (v) u.voice = v;
        u.onend = () => { i++; setTimeout(speakNext, 800); };
        window.speechSynthesis.speak(u);
      };
      if (window.speechSynthesis.getVoices().length === 0)
        window.speechSynthesis.addEventListener("voiceschanged", doSpeak, { once: true });
      else doSpeak();
    };
    speakNext();
    return () => { window.speechSynthesis?.cancel(); };
  }, [pulseDetected]);

  // Beat animation for callout
  useEffect(() => {
    if (!started || step !== CALLOUT_STEP) return;
    const id = setInterval(() => setBeat((b) => !b), 900);
    return () => clearInterval(id);
  }, [step, started]);

  // CPR metronome — runs from BEAT_STEP onward (AED steps: another person continues CPR)
  useEffect(() => {
    const isBeat = step >= BEAT_STEP;
    if (!started || !isBeat) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const ctx = getAudioCtx();
    if (ctx?.state === "suspended") ctx.resume();

    const playClick = () => {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.value = 880;
      g.gain.setValueAtTime(0.4, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    };

    // 110回/分 = 545ms per cycle → on/off each 273ms
    let on = false;
    intervalRef.current = setInterval(() => {
      on = !on;
      setBeat(on);
      if (on) playClick();
    }, 273);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [step, started, getAudioCtx]);

  const advance = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    stopSiren();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, [stopSiren]);

  // ── Tap-to-start screen ──────────────────────────────────────────
  if (!started) {
    return (
      <div
        className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-6 px-6"
        onClick={handleStart}
      >
        <div className="text-7xl animate-pulse">🔊</div>
        <p className="font-black text-2xl text-center leading-tight">
          タップして<br />音声ガイドを開始
        </p>
        <p className="text-gray-400 text-sm text-center">
          音声・サイレン・メトロノームが<br />自動で流れます
        </p>
        <button
          className="mt-2 bg-orange-600 py-4 px-12 rounded-2xl font-bold text-lg shadow-[0_0_30px_rgba(234,88,12,0.5)] active:scale-95 transition-transform"
          onClick={handleStart}
        >
          開始する
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); router.back(); }}
          className="text-gray-600 text-sm mt-4 flex items-center gap-1"
        >
          ‹ 前の画面に戻る
        </button>
      </div>
    );
  }

  // ── Step flags ───────────────────────────────────────────────────
  const isCalloutStep = step === CALLOUT_STEP;
  const isSirenStep = step === SIREN_STEP;
  const isCarotidStep = step === CAROTID_STEP;
  const isBeatStep = step === BEAT_STEP;
  const isAEDPowerStep = step === AED_POWER_STEP;
  const isAEDPadStep = step === AED_PAD_STEP;
  const isAEDAnalyzeStep = step === AED_ANALYZE_STEP;
  const isAEDShockStep = step === AED_SHOCK_STEP;
  const isAEDCPR2Step = step === AED_CPR2_STEP;
  const isAEDPhase = step >= AED_POWER_STEP;

  const current = STEPS[step]!;

  // Header color
  const headerBg = isSirenStep ? "bg-red-700"
    : isCalloutStep ? "bg-blue-700"
    : isAEDPhase ? "bg-yellow-600"
    : "bg-orange-600";

  // Background color
  const bgColor = flash
    ? (isAEDAnalyzeStep ? "#713f12" : "#7f1d1d")
    : "#030712";

  return (
    <div
      className="min-h-screen text-white flex flex-col transition-colors duration-300"
      style={{ background: bgColor }}
    >
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between transition-colors ${headerBg}`}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="text-white/70 text-2xl font-semibold leading-none pr-1 active:opacity-60"
          >
            ‹
          </button>
          <span className="text-xl">
            {isSirenStep ? "🚨" : isCalloutStep ? "🔊" : isAEDPhase ? "⚡" : "🤲"}
          </span>
          <div>
            <p className="font-bold text-base">
              {isAEDPhase ? "AED操作ガイド" : "患者を助ける"}
            </p>
            <p className="text-xs opacity-80">
              {isSirenStep ? "サイレン鳴動中"
                : isCalloutStep ? "アプリが声掛けしています"
                : isAEDAnalyzeStep ? "解析中"
                : isAEDShockStep ? "ショック準備"
                : isAEDPhase ? "AED音声案内に従って"
                : "音声ガイドが自動再生されます"}
            </p>
          </div>
        </div>
        {isSirenStep && (
          <button onClick={() => { stopSiren(); advance(); }} className="text-xs bg-white/20 px-3 py-1.5 rounded-full font-semibold">
            停止 →
          </button>
        )}
      </div>

      {/* Progress */}
      <div className="flex gap-1 px-4 pt-4">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-colors ${
              i <= step
                ? isAEDPhase ? "bg-yellow-400"
                : isSirenStep ? "bg-red-400"
                : "bg-orange-500"
                : "bg-white/15"
            }`}
            style={{ flex: 1 }}
          />
        ))}
      </div>

      {/* Main visual */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-4">

        {isCalloutStep ? (
          <div className="flex flex-col items-center mb-4">
            <div
              className={`rounded-2xl flex flex-col items-center justify-center mb-4 px-8 transition-all duration-200 ${
                beat ? "scale-105 bg-blue-600 shadow-[0_0_50px_rgba(59,130,246,0.7)]" : "scale-100 bg-blue-700"
              }`}
              style={{ minWidth: 240, paddingTop: 32, paddingBottom: 32 }}
            >
              <span className="text-5xl mb-3">🔊</span>
              <span className="text-white font-black text-3xl text-center leading-tight">大丈夫ですか？</span>
            </div>
            <p className="text-blue-300 text-sm font-semibold animate-pulse text-center">
              アプリが代わりに呼びかけています
            </p>
          </div>

        ) : isSirenStep ? (
          <div className="flex flex-col items-center mb-4">
            <div
              className={`rounded-full flex flex-col items-center justify-center mb-4 transition-all duration-300 ${
                flash ? "scale-110 shadow-[0_0_80px_rgba(239,68,68,0.9)]" : "scale-100"
              }`}
              style={{ width: 180, height: 180, background: flash ? "#ef4444" : "#b91c1c" }}
            >
              <span className="text-5xl">{flash ? "🚨" : "📢"}</span>
              <span className="text-white font-black text-base mt-1">{flash ? "呼びかけ中" : "サイレン"}</span>
            </div>
            <p className="text-red-300 text-sm font-semibold animate-pulse">
              ── 周囲に助けを求めましょう ──
            </p>
          </div>

        ) : (isBeatStep || isAEDCPR2Step) ? (
          <ChestCompressionVisual beat={beat} />

        ) : isCarotidStep ? (
          <div className="flex flex-col items-center">
            <p className="text-blue-300 text-sm font-black mb-1.5 animate-pulse">👁️ まず胸の動きを見る（呼吸の確認）</p>
            <CarotidVisual />
            <div className={`mt-2 w-20 h-20 rounded-full flex items-center justify-center font-black text-5xl shadow-lg transition-all ${
              carotidCount <= 3 ? "bg-red-600 text-white animate-pulse" : "bg-gray-800 text-white"
            }`}>
              {carotidCount}
            </div>
            <p className="text-gray-400 text-sm mt-1">秒後に胸骨圧迫へ</p>
          </div>

        ) : isAEDPowerStep ? (
          <AEDPowerVisual active={flash || step === AED_POWER_STEP} />

        ) : isAEDPadStep ? (
          <AEDPadVisual phase={padPhase} />

        ) : isAEDAnalyzeStep ? (
          <AEDAnalyzeVisual flash={flash} />

        ) : isAEDShockStep ? (
          <AEDShockVisual flash={flash} />

        ) : (
          <div className="w-36 h-36 rounded-full bg-orange-500 flex items-center justify-center text-6xl mb-6 shadow-lg">
            {current.emoji}
          </div>
        )}

        {/* Step text */}
        <p className={`text-xs font-semibold mb-1 tracking-widest uppercase ${isAEDPhase ? "text-yellow-400" : "text-orange-400"}`}>
          STEP {step + 1} / {STEPS.length}
        </p>
        <p className="text-white text-center font-black leading-tight mb-2" style={{ fontSize: 36 }}>
          {current.title}
        </p>
        <p className="text-gray-200 text-center font-bold leading-snug whitespace-pre-line" style={{ fontSize: 22 }}>
          {current.text}
        </p>
      </div>

      {/* Mini metronome bar — shown during AED steps (another person continues CPR) */}
      {isAEDPhase && !isAEDCPR2Step && (
        <div className={`mx-4 mb-3 rounded-xl px-4 py-3 flex items-center gap-3 border transition-all duration-75 ${
          beat ? "bg-red-900/60 border-red-500/60" : "bg-gray-900 border-gray-700"
        }`}>
          <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 transition-all ${
            beat ? "bg-red-500 scale-110 shadow-[0_0_18px_rgba(239,68,68,0.8)]" : "bg-red-900 scale-100"
          }`}>
            <span className="text-white text-xs leading-tight text-center">{beat ? "押す" : "離す"}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-red-300 text-xs font-bold">🫀 CPR継続中（別の人が担当）</p>
            <p className="text-gray-500 text-xs">110回/分リズム継続中</p>
          </div>
          <div className="flex gap-0.5 items-end h-6 flex-shrink-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="w-1.5 rounded-full bg-red-500 transition-all duration-75"
                style={{ height: beat && i % 2 === 0 ? 24 : 8, opacity: beat && i % 2 === 0 ? 1 : 0.3 }}
              />
            ))}
          </div>
        </div>
      )}

      {/* AED TOP3 panel — always visible from siren step onward */}
      {step >= SIREN_STEP && top3AEDs.length > 0 && (
        <div className="mx-4 mb-3 rounded-xl overflow-hidden border border-yellow-500/40 bg-gray-900">
          <div className="px-3 py-2 bg-yellow-600/20 border-b border-yellow-500/30 flex items-center justify-between">
            <p className="text-xs font-black text-yellow-400">⚡ 近隣AED TOP{top3AEDs.length}（取りに行かせる）</p>
            {isSirenStep && (
              <p className="text-xs text-yellow-300 font-semibold">↑ 人に指示して</p>
            )}
          </div>
          {top3AEDs.map((aed) => {
            const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${aed.lat},${aed.lng}&travelmode=walking`;
            const tips = getTipsForAED(aed.id);
            const summary = getTipSummary(aed.id);
            const landmark = summary ?? tips[0]?.text ?? null;
            const access = getAEDAccess(aed.id);
            const accessLabel = access?.level === "easy" ? { text: "✅ 屋外・24h", cls: "text-green-400" }
              : access?.level === "caution" ? { text: "🏛️ 施設内", cls: "text-amber-400" }
              : access?.level === "locked" ? { text: "🔒 入館困難", cls: "text-red-400" }
              : aed.accessible ? { text: "✅ 使用可", cls: "text-green-400" }
              : { text: "🔒 施錠中", cls: "text-red-400" };
            return (
              <div
                key={aed.id}
                className="flex items-stretch border-b border-gray-800 last:border-0"
              >
                <span className="text-xl font-black text-red-400 w-7 flex-shrink-0 flex items-center justify-center">{aed.rank}</span>
                <div className="flex-1 min-w-0 px-2 py-2.5 space-y-1.5">
                  <p className="text-sm font-black text-white leading-tight truncate">
                    🏢 {aed.name}{aed.installLocation ? <span className="text-amber-300">　📌 {aed.installLocation}</span> : null}
                  </p>
                  <p className="text-lg font-black text-yellow-400 leading-tight truncate">
                    約 {aed.distanceM}m
                    <span className={`text-xs font-bold ml-1.5 ${accessLabel.cls}`}>{accessLabel.text}</span>
                    {landmark && <span className="text-white text-sm font-black ml-1.5">💬 {landmark}</span>}
                  </p>
                </div>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 flex items-center justify-center p-2 bg-white/5"
                  aria-label={`${aed.name}への経路`}
                >
                  <div className="bg-white rounded-lg p-1">
                    <QRCode value={mapsUrl} size={68} />
                  </div>
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* Controls */}
      <div className="px-4 pb-8 space-y-2">
        {/* AEDが届いた — during CPR metronome */}
        {isBeatStep && (
          <button
            onClick={advance}
            className="w-full py-4 rounded-2xl bg-yellow-500 font-bold text-base flex items-center justify-center gap-2 text-gray-900 shadow-[0_0_20px_rgba(234,179,8,0.5)]"
          >
            <span className="text-2xl">⚡</span>
            AEDが届いた → 使い方ガイドへ
          </button>
        )}

        {/* 119 button — siren step and CPR steps */}
        {(isSirenStep || isBeatStep || isAEDCPR2Step) && (
          <a
            href="tel:119"
            className="w-full py-4 rounded-2xl bg-red-600 font-black text-lg flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.5)]"
          >
            <span className="text-2xl">📞</span>
            119番通報
          </a>
        )}

        {/* QR share button — siren step */}
        {isSirenStep && patientPos && (
          <button
            onClick={() => setShowRespondQR(true)}
            className="w-full py-3 rounded-2xl bg-blue-700 font-bold text-base flex items-center justify-center gap-2"
          >
            <span className="text-xl">📲</span>
            QRを提示 → AED取りに行かせる
          </button>
        )}

        {/* Carotid: pulse detected only — no press = auto-advance to CPR */}
        {isCarotidStep && (
          <button
            onClick={() => { if (timerRef.current) clearTimeout(timerRef.current); setPulseDetected(true); }}
            className="w-full py-5 rounded-2xl bg-green-700 font-black text-xl flex items-center justify-center gap-2"
          >
            <span className="text-2xl">✅</span>
            脈・呼吸あり！
          </button>
        )}

        {/* Next step — for AED steps (not siren, not metronome, not final, not carotid) */}
        {!isSirenStep && !isCarotidStep && step < STEPS.length - 1 && !isBeatStep && !isAEDCPR2Step && (
          <button onClick={advance} className="w-full py-3 rounded-xl bg-white/10 text-white text-sm font-semibold">
            次のステップへ →
          </button>
        )}

        <button
          onClick={() => {
            stopSiren();
            window.speechSynthesis?.cancel();
            router.back();
          }}
          className="w-full py-3 rounded-xl bg-white/5 text-gray-500 text-sm"
        >
          緊急画面に戻る
        </button>
      </div>

      {/* QR share modal */}
      {showRespondQR && patientPos && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end" onClick={() => setShowRespondQR(false)}>
          <div className="w-full bg-gray-900 rounded-t-3xl px-5 pt-5 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-black text-white text-lg">近くの人に見せる</p>
                <p className="text-gray-400 text-xs">QRを読ませると最寄りAEDへ案内します</p>
              </div>
              <button onClick={() => setShowRespondQR(false)} className="text-gray-400 text-2xl leading-none">✕</button>
            </div>
            <div className="bg-white rounded-2xl p-5 flex flex-col items-center gap-2">
              <QRCode
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/respond?lat=${patientPos.lat}&lng=${patientPos.lng}`}
                size={200}
              />
            </div>
            <div className="mt-4 bg-blue-900/40 border border-blue-500/30 rounded-xl px-4 py-3">
              <p className="text-white text-base font-black">「QRを読んでAEDを持ってきて！」</p>
            </div>
            <button
              onClick={() => setShowRespondQR(false)}
              className="w-full mt-3 py-3 rounded-xl bg-white/10 text-white font-semibold text-sm"
            >
              閉じてCPRを続ける
            </button>
          </div>
        </div>
      )}

      {/* Pulse detected — recovery position screen */}
      {pulseDetected && (
        <div className="fixed inset-0 bg-green-950 z-50 flex flex-col overflow-y-auto">
          {/* Header */}
          <div className="bg-green-800 px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <span className="text-2xl">🫀</span>
            <div>
              <p className="font-black text-white text-lg leading-tight">脈あり — 回復体位</p>
              <p className="text-green-300 text-xs">音声ガイドが自動再生されます</p>
            </div>
          </div>

          {/* Illustration */}
          <div className="flex-shrink-0 pt-4 pb-2">
            <RecoveryPositionVisual />
          </div>

          {/* Steps */}
          <div className="px-5 pb-3 flex-shrink-0 space-y-2">
            {[
              { icon: "🔄", text: "肩をゆっくり持ち、横向きに倒す" },
              { icon: "🦵", text: "上側の膝を90°曲げて前に出す（安定）" },
              { icon: "😮‍💨", text: "あごを上げて気道確保（横向きで口が下向きに）" },
              { icon: "🫧", text: "口から液体が出たらふき取る" },
              { icon: "👁️", text: "脈・呼吸を定期確認しながら救急車を待つ" },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-3 bg-green-900/50 rounded-xl px-3 py-2.5">
                <span className="text-2xl flex-shrink-0">{s.icon}</span>
                <p className="text-white font-black text-base leading-tight">{s.text}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="px-5 pb-10 pt-1 space-y-2 flex-shrink-0">
            <a
              href="tel:119"
              className="w-full py-4 rounded-2xl bg-red-600 font-black text-xl flex items-center justify-center gap-2 shadow-lg"
            >
              <span className="text-2xl">📞</span>
              119番通報
            </a>
            <button
              onClick={() => setPulseDetected(false)}
              className="w-full py-3 rounded-xl bg-green-900 text-green-400 font-semibold text-sm"
            >
              ← 戻る（脈が消えた場合はCPRへ）
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
