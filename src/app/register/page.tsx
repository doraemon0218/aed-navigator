"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MedicalRole = "doctor" | "nurse" | "student" | "paramedic";

const ROLES: { value: MedicalRole; label: string; badge: string; desc: string }[] = [
  { value: "doctor",    label: "医師",       badge: "👨‍⚕️", desc: "患者のもとへ直行し胸骨圧迫・救命指導" },
  { value: "nurse",     label: "看護師",     badge: "👩‍⚕️", desc: "AEDを取得し現場搬送・心肺蘇生補助" },
  { value: "student",   label: "医学生",     badge: "🎓",   desc: "AEDを取得し現場搬送・心肺蘇生補助" },
  { value: "paramedic", label: "救急救命士", badge: "🚑",   desc: "119連携・救急車誘導" },
];

// 中央区庁舎周辺のプリセット位置
const PRESETS = [
  { label: "中央区庁舎（築地1丁目）",    lat: 35.6663, lng: 139.7723 },
  { label: "築地4丁目付近",              lat: 35.6693, lng: 139.7758 },
  { label: "明石町付近",                  lat: 35.6648, lng: 139.7692 },
  { label: "新富1丁目付近",              lat: 35.6700, lng: 139.7760 },
  { label: "湊1丁目付近",                lat: 35.6678, lng: 139.7780 },
  { label: "銀座8丁目付近",              lat: 35.6682, lng: 139.7644 },
];

const STORAGE_KEY = "aed_registrant_v1";

interface Registrant {
  clientId: string;
  name: string;
  email: string;
  role: MedicalRole;
  lat: number;
  lng: number;
  label: string;
  registeredAt: string;
}

function loadRegistrant(): Registrant | null {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"); } catch { return null; }
}

function saveRegistrant(r: Registrant) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
}

export default function RegisterPage() {
  const router = useRouter();
  const [existing, setExisting] = useState<Registrant | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MedicalRole>("nurse");
  const [lat, setLat] = useState(PRESETS[0]!.lat);
  const [lng, setLng] = useState(PRESETS[0]!.lng);
  const [locLabel, setLocLabel] = useState(PRESETS[0]!.label);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const r = loadRegistrant();
    if (r) {
      setExisting(r);
      setName(r.name);
      setEmail(r.email);
      setRole(r.role);
      setLat(r.lat);
      setLng(r.lng);
      setLocLabel(r.label);
    }
  }, []);

  const getGPS = useCallback(() => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude);
        setLng(p.coords.longitude);
        setLocLabel("現在地（GPS）");
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { timeout: 8000, enableHighAccuracy: true },
    );
  }, []);

  const submit = async () => {
    if (!name.trim() || !email.trim()) { setError("名前とメールアドレスを入力してください"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("正しいメールアドレスを入力してください"); return; }
    setError("");
    setSubmitting(true);

    const clientId = existing?.clientId ?? crypto.randomUUID();

    try {
      await fetch("/api/doctor-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, name: name.trim(), email: email.trim(), role, lat, lng, pushSub: null }),
      });

      const registrant: Registrant = {
        clientId,
        name: name.trim(),
        email: email.trim(),
        role,
        lat,
        lng,
        label: locLabel,
        registeredAt: new Date().toISOString(),
      };
      saveRegistrant(registrant);
      setExisting(registrant);
      setDone(true);
    } catch {
      setError("登録に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  const roleInfo = ROLES.find((r) => r.value === role)!;

  if (done) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-6 gap-6">
        <div className="text-7xl animate-bounce">✅</div>
        <div className="text-center">
          <p className="font-black text-2xl mb-2">登録完了！</p>
          <p className="text-gray-400 text-sm leading-relaxed">
            {name} さん（{roleInfo.badge} {roleInfo.label}）<br />
            緊急要請が発生した際にメールでお知らせします。
          </p>
        </div>
        <div className="bg-gray-800 rounded-2xl p-4 w-full max-w-sm space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">メール</span>
            <span className="font-semibold">{email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">職種</span>
            <span className="font-semibold">{roleInfo.badge} {roleInfo.label}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">自宅位置</span>
            <span className="font-semibold text-right text-xs">{locLabel}</span>
          </div>
        </div>
        <div className="w-full max-w-sm space-y-2">
          <button
            onClick={() => setDone(false)}
            className="w-full py-3 rounded-xl bg-blue-600 font-bold text-base"
          >
            登録内容を変更する
          </button>
          <button
            onClick={() => router.push("/")}
            className="w-full py-3 rounded-xl bg-gray-800 text-gray-300 font-semibold text-sm"
          >
            トップへ戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 px-4 py-3 flex items-center gap-3 border-b border-white/10">
        <button onClick={() => router.back()} className="text-white/60 text-2xl leading-none px-1">‹</button>
        <div>
          <p className="font-bold text-base">医療従事者 登録</p>
          <p className="text-gray-400 text-xs">デモ用 — 緊急通知の送信先として登録されます</p>
        </div>
        {existing && (
          <span className="ml-auto text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-0.5 rounded-full font-bold">
            登録済み
          </span>
        )}
      </div>

      <div className="flex-1 px-4 py-6 space-y-5 max-w-lg mx-auto w-full">

        {/* Name */}
        <div className="bg-gray-800 rounded-2xl p-4 space-y-2">
          <label className="text-sm font-black text-white block">👤 名前</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 山田 太郎"
            maxLength={30}
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-base focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Email */}
        <div className="bg-gray-800 rounded-2xl p-4 space-y-2">
          <label className="text-sm font-black text-white block">📧 メールアドレス</label>
          <p className="text-gray-400 text-xs">緊急要請メールの送信先になります</p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="例: taro.yamada@hospital.jp"
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-base focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Role */}
        <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
          <label className="text-sm font-black text-white block">🏥 職種</label>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRole(r.value)}
                className={`rounded-xl p-3 text-left border-2 transition-all ${
                  role === r.value
                    ? "border-blue-500 bg-blue-500/15"
                    : "border-gray-700 bg-gray-700/50"
                }`}
              >
                <div className="text-2xl mb-1">{r.badge}</div>
                <p className="font-black text-sm text-white">{r.label}</p>
                <p className="text-gray-400 text-xs leading-tight mt-0.5">{r.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
          <div>
            <label className="text-sm font-black text-white block mb-0.5">📍 自宅・生活拠点</label>
            <p className="text-gray-400 text-xs">最寄りのAEDを割り当てる基準位置になります</p>
          </div>

          {/* Current location display */}
          <div className="bg-gray-700/60 rounded-xl px-3 py-2.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">現在の設定</p>
              <p className="text-sm font-bold text-white">{locLabel}</p>
              <p className="text-xs text-gray-500">{lat.toFixed(5)}, {lng.toFixed(5)}</p>
            </div>
            <button
              onClick={getGPS}
              disabled={gpsLoading}
              className="flex-shrink-0 flex items-center gap-1.5 bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50"
            >
              {gpsLoading
                ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : "📡"}
              {gpsLoading ? "取得中…" : "GPS"}
            </button>
          </div>

          {/* Presets */}
          <div className="space-y-1.5">
            <p className="text-xs text-gray-400 font-semibold">中央区内プリセット</p>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => { setLat(p.lat); setLng(p.lng); setLocLabel(p.label); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  locLabel === p.label
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300"
                }`}
              >
                🏠 {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/40 border border-red-500/40 rounded-xl px-4 py-3">
            <p className="text-red-300 text-sm font-semibold">⚠️ {error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={submit}
          disabled={submitting || !name.trim() || !email.trim()}
          className="w-full py-4 rounded-2xl bg-green-500 font-black text-gray-900 text-lg disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-transform"
        >
          {submitting
            ? "登録中…"
            : existing
            ? "✅ 登録内容を更新する"
            : "🚑 緊急通知の対象として登録する"}
        </button>

        <p className="text-center text-gray-600 text-xs pb-6">
          登録情報は AED Navigator デモ用のサーバーに送信されます。<br />
          個人情報の外部提供・商用利用はありません。
        </p>
      </div>
    </div>
  );
}
