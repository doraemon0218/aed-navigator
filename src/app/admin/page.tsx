"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, updateProfile } from "@/lib/user";

export default function AdminPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [approved, setApproved] = useState(false);

  const user = typeof window !== "undefined" ? getUser() : null;

  const login = async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json() as { ok: boolean; error?: string };
    setLoading(false);
    if (data.ok) {
      setAuthed(true);
    } else {
      setError(data.error ?? "エラー");
    }
  };

  const approveDoctor = () => {
    updateProfile({ isDoctor: true });
    setApproved(true);
  };

  const revokeDoctor = () => {
    updateProfile({ isDoctor: false });
    setApproved(false);
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-6 gap-6">
        <div className="text-center">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-xl font-black">管理者ページ</h1>
          <p className="text-gray-400 text-sm mt-1">医師認証・システム設定</p>
        </div>
        <div className="w-full max-w-sm space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="管理者パスワード"
            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-base focus:outline-none focus:border-blue-500"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            onClick={login}
            disabled={loading || !password}
            className="w-full py-4 rounded-2xl bg-blue-600 font-black text-base disabled:opacity-40 active:opacity-80"
          >
            {loading ? "認証中…" : "ログイン"}
          </button>
        </div>
        <button onClick={() => router.back()} className="text-gray-600 text-xs">← 戻る</button>
      </div>
    );
  }

  const currentUser = getUser();
  const hasRegistered = currentUser?.licenseNumber || currentUser?.employer;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="bg-gray-900 px-4 py-3 flex items-center gap-3 border-b border-white/10">
        <button onClick={() => router.back()} className="text-white/60 text-2xl leading-none px-1">‹</button>
        <div>
          <p className="font-bold text-base">管理者ページ</p>
          <p className="text-gray-400 text-xs">医療従事者認証</p>
        </div>
        <div className="ml-auto">
          <span className="bg-green-500/20 text-green-300 text-xs font-bold px-2 py-1 rounded-full border border-green-500/30">
            🔓 認証済み
          </span>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 space-y-5 max-w-lg mx-auto w-full">
        <div className="bg-gray-800 rounded-2xl p-4 space-y-4">
          <p className="font-black text-base">🩺 医師認証</p>

          {!currentUser ? (
            <p className="text-gray-400 text-sm">登録ユーザーが見つかりません。オンボーディングを先に完了してください。</p>
          ) : (
            <>
              <div className="bg-gray-700/60 rounded-xl p-4 space-y-2">
                <p className="text-xs text-gray-400 font-semibold">登録ユーザー</p>
                <p className="font-bold">{currentUser.name}</p>
                {currentUser.licenseNumber && (
                  <p className="text-sm text-gray-300">🪪 免許番号: {currentUser.licenseNumber}</p>
                )}
                {currentUser.employer && (
                  <p className="text-sm text-gray-300">🏥 所属: {currentUser.employer}</p>
                )}
                {!hasRegistered && (
                  <p className="text-amber-400 text-sm">⚠️ 医師情報の登録なし</p>
                )}
                <div className="mt-2">
                  {currentUser.isDoctor || approved ? (
                    <span className="inline-flex items-center gap-1 bg-green-500/20 text-green-300 text-sm font-bold px-3 py-1 rounded-full border border-green-500/30">
                      ✅ 医師認証済み
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-300 text-sm font-bold px-3 py-1 rounded-full border border-amber-500/30">
                      ⏳ 未認証
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={approveDoctor}
                  disabled={!hasRegistered || (currentUser.isDoctor || approved)}
                  className="flex-1 py-3 rounded-xl bg-green-600 font-bold text-sm disabled:opacity-40 active:opacity-80"
                >
                  ✅ 医師として認証する
                </button>
                <button
                  onClick={revokeDoctor}
                  disabled={!(currentUser.isDoctor || approved)}
                  className="flex-1 py-3 rounded-xl bg-red-700 font-bold text-sm disabled:opacity-40 active:opacity-80"
                >
                  ❌ 認証を取り消す
                </button>
              </div>

              {!hasRegistered && (
                <p className="text-gray-500 text-xs text-center">
                  プロフィールページで医師情報を登録してから認証してください
                </p>
              )}
            </>
          )}
        </div>

        <div className="bg-gray-800 rounded-2xl p-4">
          <p className="font-black text-base mb-2">📊 システム状態</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">ユーザー数（このデバイス）</span>
              <span className="font-semibold">{currentUser ? 1 : 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">認証済み医師</span>
              <span className="font-semibold text-green-400">{(currentUser?.isDoctor || approved) ? 1 : 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
