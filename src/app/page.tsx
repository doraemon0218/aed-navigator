"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, type User } from "@/lib/user";
import { getStampedIds } from "@/lib/stamps";

export default function ModeSelectPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [stampCount, setStampCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [nearbyEmergency, setNearbyEmergency] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace("/onboarding");
      return;
    }
    setUser(u);
    setStampCount(getStampedIds().size);
    setReady(true);
  }, [router]);

  // Poll for active emergencies every 15 seconds
  useEffect(() => {
    const poll = () => {
      fetch("/api/emergency")
        .then((r) => r.json())
        .then((d) => setNearbyEmergency(d.emergency ?? null))
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, []);

  if (!ready) {
    return <div className="min-h-screen bg-gray-950" />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Logo */}
      <div className="px-6 pt-14 pb-4 text-center">
        <p className="text-xs text-gray-500 tracking-[0.2em] uppercase font-semibold mb-2">AED Navigator</p>
        <p className="text-gray-400 text-sm">
          こんにちは、<span className="text-white font-bold">{user?.name}</span> さん
        </p>
        <div className="flex items-center justify-center gap-4 mt-2 flex-wrap">
          <span className="text-xs text-yellow-400 font-bold">🏅 {user?.points ?? 0}pt</span>
          {stampCount > 0 && (
            <span className="text-xs text-green-400 font-bold">✓ {stampCount}台スタンプ済み</span>
          )}
          {user?.isDoctor && (
            <span className="text-xs text-blue-300 font-bold border border-blue-500/40 px-2 py-0.5 rounded-full">🩺 医師認証済み</span>
          )}
        </div>
      </div>

      {/* Emergency dispatch banner */}
      {nearbyEmergency && (
        <div className="mx-4 mb-2">
          <button
            onClick={() => router.push(`/respond?lat=${nearbyEmergency.lat}&lng=${nearbyEmergency.lng}`)}
            className="w-full rounded-2xl bg-red-600 px-5 py-4 flex items-center gap-3 shadow-[0_0_30px_rgba(239,68,68,0.5)] animate-pulse"
          >
            <span className="text-3xl flex-shrink-0">🚨</span>
            <div className="text-left min-w-0">
              <p className="font-black text-white text-base leading-tight">AED搬送の依頼が届いています</p>
              <p className="text-red-200 text-xs mt-0.5">タップして最適なAEDを確認する</p>
            </div>
            <span className="text-white text-xl ml-auto">›</span>
          </button>
        </div>
      )}

      {/* Mode buttons */}
      <div className="flex-1 flex flex-col justify-center px-5 gap-4">
        {/* Daily */}
        <button
          onClick={() => router.push("/daily")}
          className="w-full rounded-3xl p-7 text-left active:scale-[0.98] transition-transform"
          style={{ background: "linear-gradient(135deg, #1d4ed8, #1e40af)", boxShadow: "0 8px 40px rgba(59,130,246,0.35)" }}
        >
          <p className="text-5xl mb-4">🗺️</p>
          <p className="font-black text-2xl leading-tight mb-2">平時モード</p>
          <p className="text-blue-200 text-sm leading-relaxed">
            AEDマップ・スタンプラリー<br />
            タイムトライアル・現地確認
          </p>
        </button>

        {/* Emergency */}
        <button
          onClick={() => router.push("/emergency")}
          className="w-full rounded-3xl p-7 text-left active:scale-[0.98] transition-transform"
          style={{ background: "linear-gradient(135deg, #dc2626, #991b1b)", boxShadow: "0 8px 40px rgba(239,68,68,0.45)" }}
        >
          <p className="text-5xl mb-4 animate-pulse">🚨</p>
          <p className="font-black text-2xl leading-tight mb-2">緊急モード</p>
          <p className="text-red-200 text-sm leading-relaxed">
            最寄りAEDを即時表示<br />
            119通報・患者を助ける手順
          </p>
        </button>
      </div>

      {/* Footer */}
      <div className="pb-8 flex flex-col items-center gap-3">
        <button
          onClick={() => router.push("/demo")}
          className="px-5 py-2 rounded-xl bg-gray-800 border border-gray-600 text-xs text-gray-300 font-bold flex items-center gap-2"
        >
          🎬 デモコントロール
        </button>
        <div className="flex items-center gap-6">
          <button
            onClick={() => router.push("/rally")}
            className="text-xs text-gray-500 font-semibold flex items-center gap-1"
          >
            🏅 スタンプラリー
          </button>
          <span className="text-gray-700">|</span>
          <button
            onClick={() => router.push("/profile")}
            className="text-xs text-gray-500 flex items-center gap-1"
          >
            🩺 プロフィール
          </button>
          <span className="text-gray-700">|</span>
          <button
            onClick={() => router.push("/onboarding")}
            className="text-xs text-gray-500"
          >
            ⚙️ 設定
          </button>
        </div>
      </div>
    </div>
  );
}
