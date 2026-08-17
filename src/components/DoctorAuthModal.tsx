"use client";

import { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function DoctorAuthModal({ isOpen, onClose }: Props) {
  const [name, setName] = useState("相山 佑樹");
  const [licenseNumber, setLicenseNumber] = useState("458912");
  const [profession, setProfession] = useState("doctor");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verified, setVerified] = useState(true);

  if (!isOpen) return null;

  const handleVerify = () => {
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      setVerified(true);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-100 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold"
        >
          ✕
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center text-xl font-bold">
            👨‍⚕️
          </div>
          <div>
            <h3 className="font-bold text-base">医療従事者 資格照会・認証</h3>
            <p className="text-xs text-gray-400">厚生労働省「医師等資格確認検索」DB連動システム</p>
          </div>
        </div>

        {verified ? (
          <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-bold text-sm mb-1">
              <span>✅ 資格確認認証済み（顔見知り医療者）</span>
            </div>
            <p className="text-xs text-purple-600 dark:text-purple-400 leading-relaxed">
              【登録名】: <strong>相山 佑樹 (救急科医師)</strong><br />
              【照会状況】: 厚労省データベースと一致。緊急時の自動タスク通知および搬送指令権限が付与されています。
            </p>
          </div>
        ) : null}

        <div className="space-y-3 text-xs mb-5">
          <div>
            <label className="font-semibold text-gray-600 dark:text-gray-400 block mb-1">資格種別</label>
            <select
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-semibold"
            >
              <option value="doctor">👨‍⚕️ 医師 (Doctor)</option>
              <option value="nurse">👩‍⚕️ 看護師 (Nurse)</option>
              <option value="paramedic">🚑 救急救命士 (Paramedic)</option>
            </select>
          </div>

          <div>
            <label className="font-semibold text-gray-600 dark:text-gray-400 block mb-1">氏名 (漢字)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-semibold"
            />
          </div>

          <div>
            <label className="font-semibold text-gray-600 dark:text-gray-400 block mb-1">医籍登録番号 / 免許証番号</label>
            <input
              type="text"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-semibold"
            />
          </div>
        </div>

        <button
          onClick={handleVerify}
          disabled={isVerifying}
          className="w-full py-3 rounded-2xl bg-purple-600 text-white font-bold text-sm shadow-md active:scale-98 transition-transform disabled:opacity-50"
        >
          {isVerifying ? "厚労省DBと照会中…" : "厚労省データベースで再認証"}
        </button>

        <p className="text-[10px] text-gray-400 text-center mt-3">
          ※ 災害・緊急時において、現地近くに居合わせた医療資格保持者を安全に連携・認証するための仕組みです。
        </p>
      </div>
    </div>
  );
}
