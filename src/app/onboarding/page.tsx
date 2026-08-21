"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveUser, getUser, DEFAULT_HOME, type HomeBase } from "@/lib/user";

const CHUO_BOUNDS = { latMin: 35.64, latMax: 35.71, lngMin: 139.74, lngMax: 139.81 };

function isInChuo(lat: number, lng: number) {
  return lat >= CHUO_BOUNDS.latMin && lat <= CHUO_BOUNDS.latMax
    && lng >= CHUO_BOUNDS.lngMin && lng <= CHUO_BOUNDS.lngMax;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [homeBase, setHomeBase] = useState<HomeBase>(DEFAULT_HOME);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [step, setStep] = useState<"name" | "home" | "done">("name");

  // Already registered → skip to home
  useEffect(() => {
    if (getUser()) router.replace("/");
  }, [router]);

  const getGPS = useCallback(() => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude: lat, longitude: lng } = p.coords;
        if (isInChuo(lat, lng)) {
          setHomeBase({ lat, lng, label: "現在地（GPS取得）" });
        }
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { timeout: 8000 }
    );
  }, []);

  const finish = useCallback(() => {
    if (!name.trim()) return;
    saveUser(name.trim(), homeBase);

    // If a pending stamp was saved (QR scanned before login), process it
    const pending = localStorage.getItem("pending_stamp");
    if (pending) {
      localStorage.removeItem("pending_stamp");
      try {
        const { aedId, token } = JSON.parse(pending);
        router.replace(`/stamp?id=${aedId}&s=${token}`);
        return;
      } catch { /* ignore */ }
    }

    router.replace("/");
  }, [name, homeBase, router]);

  if (step === "name") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-6 gap-8">
        <div className="text-center">
          <div className="text-6xl mb-4">🏅</div>
          <h1 className="text-2xl font-black mb-2">AED Navigator</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            中央区のAEDを巡って<br />
            <span className="text-green-400 font-semibold">いざという時に動ける人</span>になろう
          </p>
        </div>

        <div className="w-full max-w-sm">
          <p className="text-sm text-gray-400 mb-2 font-semibold">あなたのニックネーム</p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && setStep("home")}
            placeholder="例: 山田 太郎"
            maxLength={20}
            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-base focus:outline-none focus:border-blue-500"
            autoFocus
          />
        </div>

        <button
          onClick={() => setStep("home")}
          disabled={!name.trim()}
          className="w-full max-w-sm py-4 rounded-2xl bg-green-500 font-black text-gray-900 text-lg disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-transform"
        >
          次へ →
        </button>

        <p className="text-gray-600 text-xs text-center">
          データはこのデバイスのみに保存されます。<br />アカウント・パスワード不要。
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-6 gap-8">
      <div className="text-center">
        <div className="text-5xl mb-3">🏛️</div>
        <h2 className="text-xl font-black mb-2">生活拠点を設定</h2>
        <p className="text-gray-400 text-sm leading-relaxed">
          ここを中心に、近くのAEDから<br />スタンプラリーが始まります
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        {/* Current setting */}
        <div className={`rounded-xl p-4 border ${
          homeBase.label === DEFAULT_HOME.label
            ? "bg-blue-900/30 border-blue-500/50"
            : "bg-green-900/30 border-green-500/50"
        }`}>
          <p className="text-xs text-gray-400 mb-1">現在の設定</p>
          <p className="font-bold text-sm">
            {homeBase.label === DEFAULT_HOME.label ? "🏛️" : "📍"} {homeBase.label}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{homeBase.lat.toFixed(5)}, {homeBase.lng.toFixed(5)}</p>
        </div>

        {/* Use default */}
        <button
          onClick={() => setHomeBase(DEFAULT_HOME)}
          className={`w-full py-3 rounded-xl border text-sm font-semibold text-left px-4 transition-colors ${
            homeBase.label === DEFAULT_HOME.label
              ? "bg-blue-600 border-transparent text-white"
              : "bg-gray-800 border-gray-700 text-gray-300"
          }`}
        >
          🏛️ 中央区庁舎を使用（デモ初期値）
        </button>

        {/* Use GPS */}
        <button
          onClick={getGPS}
          disabled={gpsLoading}
          className="w-full py-3 rounded-xl border border-gray-700 bg-gray-800 text-sm font-semibold text-gray-300 px-4 flex items-center gap-2 disabled:opacity-50"
        >
          {gpsLoading
            ? <span className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
            : <span>📍</span>}
          {gpsLoading ? "GPS取得中…" : "現在地を生活拠点に設定（中央区内のみ）"}
        </button>
      </div>

      <button
        onClick={finish}
        className="w-full max-w-sm py-4 rounded-2xl bg-green-500 font-black text-gray-900 text-lg active:scale-95 transition-transform"
      >
        スタート！
      </button>
    </div>
  );
}
