"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, updateProfile } from "@/lib/user";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

export default function ProfilePage() {
  const router = useRouter();
  const [license, setLicense] = useState("");
  const [employer, setEmployer] = useState("");
  const [saved, setSaved] = useState(false);
  const [isDoctor, setIsDoctor] = useState(false);
  const [name, setName] = useState("");
  const [locationSharing, setLocationSharing] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"idle" | "active" | "error">("idle");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace("/onboarding"); return; }
    setName(user.name);
    setLicense(user.licenseNumber ?? "");
    setEmployer(user.employer ?? "");
    setIsDoctor(user.isDoctor ?? false);

    // Restore sharing state from session storage
    const wasSharing = sessionStorage.getItem("doctor_location_sharing") === "1";
    if (wasSharing && user.isDoctor) {
      setLocationSharing(true);
    }
  }, [router]);

  const sendLocation = async (sub: PushSubscription | null) => {
    const user = getUser();
    if (!user) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await fetch("/api/doctor-location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId: user.id,
              name: user.name,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              pushSub: sub,
            }),
          });
          setLastUpdate(new Date());
          setLocationStatus("active");
        } catch {
          setLocationStatus("error");
        }
      },
      () => setLocationStatus("error"),
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  const startSharing = async () => {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      return;
    }

    // Register SW and get push subscription
    let pushSub: PushSubscription | null = null;
    if ("serviceWorker" in navigator && "PushManager" in window && VAPID_PUBLIC_KEY) {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        }
        pushSub = sub;
        // Save push sub to global push store as well
        await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub),
        });
      } catch { /* push unavailable — location sharing still works */ }
    }

    setLocationSharing(true);
    sessionStorage.setItem("doctor_location_sharing", "1");

    // Send immediately, then every 30s
    sendLocation(pushSub);
    const id = setInterval(() => sendLocation(pushSub), 30_000);
    intervalRef.current = id;
  };

  const stopSharing = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setLocationSharing(false);
    setLocationStatus("idle");
    sessionStorage.removeItem("doctor_location_sharing");
  };

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const save = () => {
    updateProfile({ licenseNumber: license.trim(), employer: employer.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 px-4 py-3 flex items-center gap-3 border-b border-white/10">
        <button onClick={() => router.back()} className="text-white/60 text-2xl leading-none px-1">‹</button>
        <div>
          <p className="font-bold text-base">プロフィール</p>
          <p className="text-gray-400 text-xs">医療従事者登録 · 位置情報共有</p>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 space-y-5 max-w-lg mx-auto w-full">
        {/* Identity */}
        <div className="bg-gray-800 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-2xl font-black">
            {name?.[0] ?? "?"}
          </div>
          <div>
            <p className="font-bold text-lg">{name}</p>
            {isDoctor
              ? <span className="inline-flex items-center gap-1 bg-green-500/20 text-green-300 text-xs font-bold px-2 py-0.5 rounded-full border border-green-500/30">✅ 医師認証済み</span>
              : (license || employer)
              ? <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-300 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-500/30">⏳ 認証待ち</span>
              : null}
          </div>
        </div>

        {/* Location sharing — doctor only */}
        {isDoctor && (
          <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="font-black text-base">📡 位置情報共有</p>
                <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">
                  ONにすると30秒ごとに現在地をサーバーへ送信。<br />
                  近くで緊急要請が発生した際に即時通知が届きます。
                </p>
              </div>
              <button
                onClick={locationSharing ? stopSharing : startSharing}
                className={`flex-shrink-0 w-14 h-8 rounded-full transition-colors relative ${
                  locationSharing ? "bg-green-500" : "bg-gray-600"
                }`}
              >
                <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                  locationSharing ? "translate-x-7" : "translate-x-1"
                }`} />
              </button>
            </div>

            {locationSharing && (
              <div className={`rounded-xl px-3 py-2.5 flex items-center gap-2 ${
                locationStatus === "active"
                  ? "bg-green-500/10 border border-green-500/30"
                  : locationStatus === "error"
                  ? "bg-red-500/10 border border-red-500/30"
                  : "bg-gray-700/50 border border-gray-600/30"
              }`}>
                {locationStatus === "active" && (
                  <>
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                    <div>
                      <p className="text-green-300 text-xs font-bold">共有中</p>
                      {lastUpdate && (
                        <p className="text-green-400/70 text-xs">
                          最終送信: {lastUpdate.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </p>
                      )}
                    </div>
                  </>
                )}
                {locationStatus === "error" && (
                  <>
                    <span className="text-red-400 text-sm flex-shrink-0">⚠️</span>
                    <p className="text-red-300 text-xs font-bold">位置情報の取得に失敗しました</p>
                  </>
                )}
                {locationStatus === "idle" && (
                  <>
                    <div className="w-3 h-3 border-2 border-green-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <p className="text-gray-400 text-xs">位置情報を取得中…</p>
                  </>
                )}
              </div>
            )}

            <div className="bg-blue-900/30 border border-blue-500/20 rounded-xl px-3 py-2.5">
              <p className="text-blue-300 text-xs font-bold mb-1">📌 緊急時の流れ</p>
              <div className="space-y-1 text-xs text-blue-200/80">
                <p>① 付近800m以内で緊急要請が発生</p>
                <p>② このデバイスにプッシュ通知が届く</p>
                <p>③ タップで患者・AED情報を表示</p>
              </div>
            </div>
          </div>
        )}

        {/* Medical registration */}
        <div className="bg-gray-800 rounded-2xl p-4 space-y-4">
          <div>
            <p className="font-black text-base mb-1">🩺 医療従事者登録</p>
            <p className="text-gray-400 text-xs leading-relaxed">
              医師免許証番号と所属施設を登録してください。管理者が確認後、緊急通知の対象になります。
            </p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 font-semibold block mb-1">医師免許証番号</label>
              <input
                type="text"
                value={license}
                onChange={(e) => setLicense(e.target.value)}
                placeholder="例: 第123456号"
                className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold block mb-1">所属施設・勤務先</label>
              <input
                type="text"
                value={employer}
                onChange={(e) => setEmployer(e.target.value)}
                placeholder="例: 東京大学医学部附属病院"
                className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <button
            onClick={save}
            disabled={!license.trim() && !employer.trim()}
            className="w-full py-3 rounded-xl bg-blue-600 font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed active:opacity-80 transition-opacity"
          >
            {saved ? "✅ 保存しました" : "登録内容を保存"}
          </button>
          {(license || employer) && !isDoctor && (
            <p className="text-center text-amber-300/80 text-xs">⏳ 管理者の認証をお待ちください</p>
          )}
        </div>

        {/* Push notification info */}
        <div className="bg-gray-800 rounded-2xl p-4">
          <p className="font-black text-base mb-2">🔔 プッシュ通知の対応環境</p>
          <div className="space-y-1">
            <p className="text-xs text-gray-400">✅ Android Chrome / Edge</p>
            <p className="text-xs text-gray-400">✅ iOS 16.4+ Safari（ホーム画面追加後）</p>
            <p className="text-xs text-gray-400">✅ Mac / PC Chrome / Firefox / Edge</p>
          </div>
        </div>

        <div className="text-center">
          <button onClick={() => router.push("/admin")} className="text-gray-600 text-xs underline">
            管理者ページ
          </button>
        </div>
      </div>
    </div>
  );
}
