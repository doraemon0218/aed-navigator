"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const CALLOUT_STEP = 1;
const SIREN_STEP = 2;
const BEAT_STEP = 4;

const STEPS = [
  {
    emoji: "🔍",
    title: "安全確認",
    text: "周囲に危険はないか確認",
    spoken: "周囲の安全を確認してください。",
    duration: 4,
    siren: false,
  },
  {
    emoji: "👋",
    title: "肩を叩く",
    text: "アプリが呼びかけます\n両肩を軽く叩いてください",
    spoken: "大丈夫ですか！　大丈夫ですか！　返事はありますか！",
    duration: 6,
    siren: false,
    callOut: true,
  },
  {
    emoji: "🔊",
    title: "AED・119番を要請",
    text: "アプリが呼びかけています\nあなたはその場を離れないで",
    spoken: "あなたはそこを離れないで！　百十九番に通報してください！　エーイーディーを持ってきてください！",
    duration: 8,
    siren: true,
  },
  {
    emoji: "🤲",
    title: "頸動脈を触る",
    text: "のどぼとけ横で脈を確認（10秒）",
    spoken: "のどぼとけの横に指を当て、脈を十秒以内に確認してください。",
    duration: 6,
    siren: false,
  },
  {
    emoji: "💪",
    title: "胸骨圧迫",
    text: "胸の中央を強く・速く・絶え間なく",
    spoken: "胸の中央を、強く速く、リズムに合わせて押し続けてください。",
    duration: 999,
    siren: false,
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

export default function CPRPage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [beat, setBeat] = useState(false);
  const [sirenActive, setSirenActive] = useState(false);
  const [flash, setFlash] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sirenStopRef = useRef<(() => void) | null>(null);
  const audioCtxRef = useRef<AudioCtxType | null>(null);

  const getAudioCtx = useCallback((): AudioCtxType | null => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx() as AudioCtxType;
    }
    return audioCtxRef.current;
  }, []);

  // Tap-to-start: unlock AudioContext + SpeechSynthesis within user gesture
  const handleStart = useCallback(() => {
    const ctx = getAudioCtx();
    if (ctx?.state === "suspended") ctx.resume();

    // iOS Safari requires speak() to be called inside a user gesture to unlock
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

    // getVoices() is async on first load — wait for voiceschanged if empty
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener("voiceschanged", doSpeak, { once: true });
    } else {
      doSpeak();
    }
  }, []);

  // Step logic — only runs after started
  useEffect(() => {
    if (!started) return;
    const s = STEPS[step];
    if (!s) return;

    if (step !== SIREN_STEP) stopSiren();

    speak(s.spoken, !!("callOut" in s && s.callOut));

    if (s.siren) {
      const ctx = getAudioCtx();
      if (ctx) {
        if (ctx.state === "suspended") ctx.resume();
        sirenStopRef.current = createSiren(ctx);
        setSirenActive(true);
      }
    }

    if (step < STEPS.length - 1) {
      timerRef.current = setTimeout(() => setStep((p) => p + 1), s.duration * 1000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [step, started, speak, stopSiren, getAudioCtx]);

  // Screen flash when siren is active
  useEffect(() => {
    if (!sirenActive) { setFlash(false); return; }
    const id = setInterval(() => setFlash((f) => !f), 500);
    return () => clearInterval(id);
  }, [sirenActive]);

  // Pulse animation for callout step
  useEffect(() => {
    if (!started || step !== CALLOUT_STEP) return;
    const id = setInterval(() => setBeat((b) => !b), 900);
    return () => clearInterval(id);
  }, [step, started]);

  // CPR metronome (last step)
  useEffect(() => {
    if (!started || step !== BEAT_STEP) {
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

    // 110回/分 = 1サイクル545ms → on/off各273ms
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
          className="text-gray-600 text-sm mt-4"
        >
          戻る
        </button>
      </div>
    );
  }

  // ── Main CPR guide ───────────────────────────────────────────────
  const isCalloutStep = step === CALLOUT_STEP;
  const isSirenStep = step === SIREN_STEP;
  const isBeatStep = step === BEAT_STEP;
  const current = STEPS[step]!;

  return (
    <div
      className="min-h-screen text-white flex flex-col transition-colors duration-300"
      style={{ background: flash ? "#7f1d1d" : "#030712" }}
    >
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between transition-colors ${
        isSirenStep ? "bg-red-700" : isCalloutStep ? "bg-blue-700" : "bg-orange-600"
      }`}>
        <div className="flex items-center gap-2">
          <span className="text-xl">{isSirenStep ? "🚨" : isCalloutStep ? "🔊" : "🤲"}</span>
          <div>
            <p className="font-bold text-base">CPRガイド</p>
            <p className="text-xs opacity-80">
              {isSirenStep ? "サイレン鳴動中" : isCalloutStep ? "アプリが声掛けしています" : "音声ガイドが自動再生されます"}
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
            className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? (isSirenStep ? "bg-red-400" : "bg-orange-500") : "bg-white/15"}`}
          />
        ))}
      </div>

      {/* Main */}
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
              <span className="text-white font-black text-3xl text-center leading-tight">
                大丈夫ですか？
              </span>
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
              <span className="text-white font-black text-base mt-1">
                {flash ? "呼びかけ中" : "サイレン"}
              </span>
            </div>
            <p className="text-red-300 text-sm font-semibold animate-pulse">
              ── 周囲の人が集まるのを待ってください ──
            </p>
          </div>

        ) : isBeatStep ? (
          <div className="flex flex-col items-center mb-4">
            <div
              className={`rounded-full flex flex-col items-center justify-center mb-4 transition-all ${
                beat ? "scale-105 bg-red-600 shadow-[0_0_60px_rgba(239,68,68,0.8)]" : "scale-100 bg-red-700"
              }`}
              style={{ width: 180, height: 180, transitionDuration: beat ? "60ms" : "200ms" }}
            >
              <span className="text-white font-black text-3xl">{beat ? "押す" : "離す"}</span>
              <span className="text-red-200 text-sm mt-1 font-semibold">110回/分</span>
            </div>
            <div className="flex gap-1.5 items-end h-8">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="w-2 rounded-full bg-red-500 transition-all duration-75"
                  style={{ height: beat && i % 2 === 0 ? 32 : 12, opacity: beat && i % 2 === 0 ? 1 : 0.4 }}
                />
              ))}
            </div>
          </div>

        ) : (
          <div className="w-36 h-36 rounded-full bg-orange-500 flex items-center justify-center text-6xl mb-6 shadow-lg">
            {current.emoji}
          </div>
        )}

        {/* Text */}
        <p className="text-orange-400 text-xs font-semibold mb-2 tracking-widest uppercase">
          STEP {step + 1} / {STEPS.length}
        </p>
        <p className="text-white text-center font-black leading-tight mb-3" style={{ fontSize: 28 }}>
          {current.title}
        </p>
        <p className="text-gray-300 text-center text-lg leading-snug whitespace-pre-line">
          {current.text}
        </p>
      </div>

      {/* Controls */}
      <div className="px-4 pb-8 space-y-2">
        {isBeatStep && (
          <a
            href="tel:119"
            className="w-full py-4 rounded-2xl bg-red-600 font-bold text-base flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(239,68,68,0.4)]"
          >
            <span className="text-2xl">📞</span>
            119番通報
          </a>
        )}

        {step < STEPS.length - 1 && !isSirenStep && (
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
    </div>
  );
}
