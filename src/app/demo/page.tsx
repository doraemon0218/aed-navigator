"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, saveUser, updateProfile, DEFAULT_HOME } from "@/lib/user";

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const DEMO_USER_NAME = "デモ医師（田中）";

function urlBase64ToArrayBuffer(b64: string): ArrayBuffer {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

type Step = "idle" | "resetting" | "doctor-ready" | "emergency-ready";

interface Status {
  emergency: boolean;
  doctorCount: number;
  pushSub: boolean;
  role: "none" | "doctor" | "rescuer";
}

export default function DemoPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [status, setStatus] = useState<Status>({ emergency: false, doctorCount: 0, pushSub: false, role: "none" });
  const [log, setLog] = useState<string[]>([]);
  const pushSubRef = useRef<PushSubscription | null>(null);

  const addLog = (msg: string) => setLog((prev) => [...prev.slice(-6), msg]);

  const refreshStatus = async () => {
    const [emRes, docRes] = await Promise.all([
      fetch("/api/emergency").then((r) => r.json()).catch(() => ({ emergency: null })),
      fetch("/api/doctor-location").then((r) => r.json()).catch(() => ({ doctors: [] })),
    ]);
    setStatus((prev) => ({
      ...prev,
      emergency: !!emRes.emergency,
      doctorCount: (docRes.doctors ?? []).length,
    }));
  };

  useEffect(() => { refreshStatus(); }, []);

  // ── STEP 1: Reset everything ──────────────────────────────────────────
  const handleReset = async () => {
    setStep("resetting");
    addLog("🔄 サーバー状態をリセット中…");
    await fetch("/api/demo-reset", { method: "POST" });
    await fetch("/api/emergency", { method: "DELETE" });
    addLog("✅ 緊急状態・医師登録をクリア");

    // Reset localStorage
    const existing = getUser();
    if (!existing) {
      saveUser(DEMO_USER_NAME, DEFAULT_HOME);
      addLog("👤 デモユーザーを作成");
    }
    updateProfile({ isDoctor: false });
    setStatus((prev) => ({ ...prev, role: "none", emergency: false, doctorCount: 0 }));
    addLog("✅ リセット完了");
    setStep("idle");
    pushSubRef.current = null;
  };

  // ── STEP 2a: Set up as Doctor ──────────────────────────────────────────
  const handleDoctorSetup = async () => {
    setStep("doctor-ready");
    addLog("🩺 医師ロールをセットアップ中…");

    // Ensure user exists and is marked as doctor
    if (!getUser()) saveUser(DEMO_USER_NAME, DEFAULT_HOME);
    updateProfile({ isDoctor: true, licenseNumber: "第123456号", employer: "東京大学医学部附属病院" });
    addLog("✅ 医師認証済みステータスをセット");

    // Register service worker + push subscription
    let sub: PushSubscription | null = null;
    if ("serviceWorker" in navigator && "PushManager" in window && VAPID_KEY) {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToArrayBuffer(VAPID_KEY),
          });
        }
        pushSubRef.current = sub;
        await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub),
        });
        setStatus((prev) => ({ ...prev, pushSub: true }));
        addLog("🔔 プッシュ購読を登録");
      } catch {
        addLog("⚠️ Push通知: ブラウザ未対応またはブロック中");
      }
    }

    // Send doctor location to server
    navigator.geolocation?.getCurrentPosition(
      async (pos) => {
        const user = getUser();
        await fetch("/api/doctor-location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: user?.id ?? "demo-doctor",
            name: user?.name ?? DEMO_USER_NAME,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            pushSub: sub,
          }),
        });
        addLog(`📡 位置情報を登録 (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`);
        await refreshStatus();
      },
      async () => {
        // Fallback: use default position (Chuo ward)
        const user = getUser();
        await fetch("/api/doctor-location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: user?.id ?? "demo-doctor",
            name: user?.name ?? DEMO_USER_NAME,
            lat: DEFAULT_HOME.lat,
            lng: DEFAULT_HOME.lng,
            pushSub: sub,
          }),
        });
        addLog("📡 位置情報を登録（デモ位置: 中央区庁舎）");
        await refreshStatus();
      },
      { timeout: 5000 }
    );

    setStatus((prev) => ({ ...prev, role: "doctor" }));
    addLog("✅ 医師ロール準備完了 — 通知待機中");
  };

  // ── STEP 2b: Switch to Rescuer ────────────────────────────────────────
  const handleRescuerMode = async () => {
    if (!getUser()) saveUser("デモ救助者", DEFAULT_HOME);
    updateProfile({ isDoctor: false });
    setStatus((prev) => ({ ...prev, role: "rescuer" }));
    addLog("🚨 救助者ロードに切り替え → 緊急モードへ");
    router.push("/emergency");
  };

  const statusColor = (ok: boolean) => ok ? "text-green-400" : "text-gray-500";
  const statusIcon = (ok: boolean) => ok ? "●" : "○";

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 px-4 py-3 flex items-center gap-3 border-b border-white/10">
        <button onClick={() => router.replace("/")} className="text-white/60 text-2xl leading-none px-1">‹</button>
        <div>
          <p className="font-bold text-base">🎬 デモコントロール</p>
          <p className="text-gray-400 text-xs">ハッカソン発表用 — シナリオ準備パネル</p>
        </div>
      </div>

      <div className="flex-1 px-4 py-5 space-y-4 max-w-lg mx-auto w-full">

        {/* Status board */}
        <div className="bg-gray-800 rounded-2xl p-4 space-y-2">
          <p className="font-black text-sm text-gray-300 mb-2">📊 現在の状態</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-700/50 rounded-xl px-3 py-2">
              <p className="text-gray-400 text-xs">緊急状態</p>
              <p className={`font-black text-base ${statusColor(status.emergency)}`}>
                {statusIcon(status.emergency)} {status.emergency ? "発生中" : "なし"}
              </p>
            </div>
            <div className="bg-gray-700/50 rounded-xl px-3 py-2">
              <p className="text-gray-400 text-xs">待機中の医師</p>
              <p className={`font-black text-base ${statusColor(status.doctorCount > 0)}`}>
                {statusIcon(status.doctorCount > 0)} {status.doctorCount}人
              </p>
            </div>
            <div className="bg-gray-700/50 rounded-xl px-3 py-2">
              <p className="text-gray-400 text-xs">Push通知</p>
              <p className={`font-black text-base ${statusColor(status.pushSub)}`}>
                {statusIcon(status.pushSub)} {status.pushSub ? "購読済み" : "未購読"}
              </p>
            </div>
            <div className="bg-gray-700/50 rounded-xl px-3 py-2">
              <p className="text-gray-400 text-xs">現在のロール</p>
              <p className="font-black text-base text-white">
                {status.role === "doctor" ? "🩺 医師" : status.role === "rescuer" ? "🚨 救助者" : "— 未選択"}
              </p>
            </div>
          </div>
        </div>

        {/* Scenario guide */}
        <div className="bg-blue-900/30 border border-blue-500/30 rounded-2xl px-4 py-3">
          <p className="font-black text-blue-300 text-sm mb-2">📋 デモシナリオの手順</p>
          <div className="space-y-1.5 text-xs text-blue-200">
            <p><span className="font-black text-white">① </span>「デモリセット」でサーバーを初期化</p>
            <p><span className="font-black text-white">② </span>「医師ロール準備」でPush購読 + 位置登録</p>
            <p><span className="font-black text-white">③ </span>（審査員に端末を渡す or 画面をスクリーンへ）</p>
            <p><span className="font-black text-white">④ </span>「救助者として操作」→ 緊急モードへ移動</p>
            <p><span className="font-black text-white">⑤ </span>「患者を助ける」ボタンを押す</p>
            <p><span className="font-black text-white">⑥ </span>→ Push通知「🩺 医師への救護支援依頼」が届く</p>
            <p><span className="font-black text-white">⑦ </span>通知をタップ → respondページでルート確認</p>
          </div>
        </div>

        {/* RESET */}
        <button
          onClick={handleReset}
          disabled={step === "resetting"}
          className="w-full py-4 rounded-2xl font-black text-lg bg-gray-700 border-2 border-gray-500 active:opacity-70 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {step === "resetting"
            ? <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />リセット中…</>
            : <>🔄 デモリセット（全クリア）</>}
        </button>

        {/* DOCTOR SETUP */}
        <button
          onClick={handleDoctorSetup}
          disabled={step === "resetting" || status.role === "doctor"}
          className="w-full py-5 rounded-2xl font-black text-xl border-2 active:opacity-70 disabled:opacity-50 flex items-center justify-center gap-3"
          style={{ background: "linear-gradient(135deg,#065f46,#047857)", borderColor: "#10b981" }}
        >
          <span className="text-3xl">🩺</span>
          <div className="text-left">
            <p className="leading-tight">医師ロール準備</p>
            <p className="text-green-300 text-sm font-normal">Push購読 + 位置登録 → 通知待機</p>
          </div>
          {status.role === "doctor" && <span className="ml-auto text-green-300 text-sm font-bold">準備済み ✓</span>}
        </button>

        {/* RESCUER MODE */}
        <button
          onClick={handleRescuerMode}
          disabled={step === "resetting"}
          className="w-full py-5 rounded-2xl font-black text-xl border-2 active:opacity-70 disabled:opacity-50 flex items-center justify-center gap-3"
          style={{ background: "linear-gradient(135deg,#7f1d1d,#991b1b)", borderColor: "#ef4444" }}
        >
          <span className="text-3xl animate-pulse">🚨</span>
          <div className="text-left">
            <p className="leading-tight">救助者として操作</p>
            <p className="text-red-300 text-sm font-normal">緊急モードへ → 医師に通知を発火</p>
          </div>
        </button>

        {/* Activity log */}
        {log.length > 0 && (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3">
            <p className="text-gray-500 text-xs font-bold mb-2">📝 ログ</p>
            <div className="space-y-0.5">
              {log.map((l, i) => (
                <p key={i} className="text-gray-400 text-xs font-mono">{l}</p>
              ))}
            </div>
          </div>
        )}

        {/* Refresh */}
        <button
          onClick={refreshStatus}
          className="w-full py-2 text-gray-600 text-xs"
        >
          ↻ 状態を更新
        </button>
      </div>
    </div>
  );
}
