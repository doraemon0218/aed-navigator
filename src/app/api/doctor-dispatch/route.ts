import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { assignRespondersToAEDs, ensureDemoDoctors, ROLE_LABELS, type AEDTarget } from "@/lib/doctorStore";
import {
  createDispatch,
  getDispatch,
  finalizeIfReady,
  type DoctorInvite,
} from "@/lib/dispatchStore";

const TOP_PER_AED = 10;

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ja`,
      { headers: { "User-Agent": "AED-Navigator/1.0" }, signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return `緯度 ${lat.toFixed(4)}, 経度 ${lng.toFixed(4)}`;
    const data = await res.json() as { address?: Record<string, string>; display_name?: string };
    const a = data.address ?? {};
    // Build compact address: prefecture + city/town + suburb/neighbourhood + road
    const parts = [
      a.state ?? a.prefecture,
      a.city ?? a.town ?? a.village ?? a.county,
      a.suburb ?? a.neighbourhood ?? a.quarter,
      a.road ?? a.pedestrian,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : (data.display_name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
  } catch {
    return `緯度 ${lat.toFixed(4)}, 経度 ${lng.toFixed(4)}`;
  }
}

function etaButtonsHtml(token: string, baseUrl: string) {
  const options = [
    { label: "3分",     value: 3 },
    { label: "5分",     value: 5 },
    { label: "10分",    value: 10 },
    { label: "15分",    value: 15 },
    { label: "15分以上", value: 20 },
    { label: "対応不可", value: 0 },
  ];
  const btnStyle = (color: string) =>
    `display:inline-block;margin:4px;padding:12px 20px;background:${color};color:white;font-weight:bold;font-size:15px;border-radius:8px;text-decoration:none;`;

  return options
    .map(({ label, value }) => {
      const eta = value === 0 ? "none" : String(value);
      const url = `${baseUrl}/api/doctor-dispatch/respond?token=${token}&eta=${eta}`;
      const color = value === 0 ? "#6b7280" : value <= 5 ? "#dc2626" : value <= 10 ? "#ea580c" : "#2563eb";
      return `<a href="${url}" style="${btnStyle(color)}">${label}</a>`;
    })
    .join("");
}

async function sendDispatchEmail(
  resend: Resend,
  invite: DoctorInvite & { distanceToAed: number; role: string; aedName: string; aedLat: number; aedLng: number },
  patientLat: number,
  patientLng: number,
  baseUrl: string,
) {
  const roleInfo = ROLE_LABELS[invite.role as keyof typeof ROLE_LABELS] ?? ROLE_LABELS.doctor;
  const isDoctor = invite.role === "doctor";
  const patientMapUrl = mapsUrl(patientLat, patientLng);
  const aedMapUrl = mapsUrl(invite.aedLat, invite.aedLng);
  const distKm = (invite.distanceToAed / 1000).toFixed(1);
  const buttons = etaButtonsHtml(invite.token, baseUrl);
  const patientAddress = await reverseGeocode(patientLat, patientLng);

  const bodyHtml = isDoctor
    ? `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:14px 0">
          <p style="margin:0 0 10px;font-weight:bold;color:#1e293b;font-size:15px">⏱️ ① 対応可能ですか？何分で到着できますか？（1分以内に回答）</p>
          <div>${buttons}</div>
        </div>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin:14px 0">
          <p style="margin:0 0 8px;font-weight:bold;color:#dc2626;font-size:15px">📍 ② 患者の発生場所</p>
          <p style="margin:0 0 6px;font-size:14px;color:#374151;font-weight:bold">${patientAddress}</p>
          <p style="margin:0 0 10px;font-size:13px;color:#374151">心停止の疑いがあります。直ちに現場へ向かってください。AEDは他の登録者が手配中です。</p>
          <a href="${patientMapUrl}" style="display:inline-block;padding:10px 18px;background:#dc2626;color:white;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">🗺️ Google Maps で開く</a>
        </div>`
    : `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:14px 0">
          <p style="margin:0 0 10px;font-weight:bold;color:#1e293b;font-size:15px">⏱️ ① 対応可能ですか？何分で到着できますか？（1分以内に回答）</p>
          <div>${buttons}</div>
        </div>
        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:16px;margin:14px 0">
          <p style="margin:0 0 8px;font-weight:bold;color:#92400e;font-size:15px">📍 ② 患者の発生場所</p>
          <p style="margin:0 0 6px;font-size:14px;color:#374151;font-weight:bold">${patientAddress}</p>
          <p style="margin:0 0 10px;font-size:13px;color:#374151">付近で心停止の疑いがある患者が発生しました。急いでください。</p>
          <a href="${patientMapUrl}" style="display:inline-block;padding:10px 18px;background:#d97706;color:white;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">🗺️ Google Maps で開く</a>
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:14px 0">
          <p style="margin:0 0 8px;font-weight:bold;color:#15803d;font-size:15px">🔋 ③ AEDを持ってきてください</p>
          <p style="margin:0 0 10px;font-size:13px;color:#374151">
            最寄りのAED「<strong>${invite.aedName}</strong>」を取得し、患者のもとへ届けてください。<br>
            📏 あなたからAEDまで：約 ${distKm} km<br>
            AEDを届けたら、心肺蘇生の補助をお願いします。
          </p>
          <a href="${aedMapUrl}" style="display:inline-block;padding:10px 18px;background:#16a34a;color:white;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">🗺️ AEDの場所を Google Maps で開く</a>
        </div>`;

  await resend.emails.send({
    from: "AED Navigator <onboarding@resend.dev>",
    to: invite.email,
    subject: `【緊急】心肺蘇生の救護依頼 — AED Navigator`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#dc2626;color:white;padding:16px 20px;border-radius:12px;margin-bottom:20px">
          <h1 style="margin:0;font-size:22px">🚨 救急患者が発生しました</h1>
          <p style="margin:6px 0 0;font-size:14px;opacity:0.9">${roleInfo.badge} として応援をお願いします</p>
        </div>
        <p style="font-size:17px;font-weight:bold;margin:0 0 4px">${invite.name} さん</p>
        <p style="font-size:14px;color:#6b7280;margin:0 0 16px">AED Navigator からの緊急要請です</p>
        ${bodyHtml}
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">
          ※ AED Navigator から自動送信されています。1分以内の回答のみ有効です。
        </p>
      </div>
    `,
  });
}

async function sendWinnerEmail(
  resend: Resend,
  email: string,
  name: string,
  patientLat: number,
  patientLng: number,
  aedName: string,
  aedLat: number,
  aedLng: number,
  role: string,
) {
  const isDoctor = role === "doctor";
  const patientMapUrl = mapsUrl(patientLat, patientLng);
  const aedMapUrl = mapsUrl(aedLat, aedLng);
  await resend.emails.send({
    from: "AED Navigator <onboarding@resend.dev>",
    to: email,
    subject: "【救護依頼確定】現場への応援をお願いします — AED Navigator",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#16a34a;color:white;padding:16px 20px;border-radius:12px;margin-bottom:20px">
          <h1 style="margin:0;font-size:20px">✅ 応援をお願いします</h1>
        </div>
        <p style="font-size:16px;font-weight:bold">${name} さん</p>
        <p style="font-size:15px;color:#374151">
          あなたに救護担当をお願いすることになりました。急いで向かってください。
        </p>
        ${isDoctor
          ? `<a href="${patientMapUrl}" style="display:inline-block;padding:12px 20px;background:#dc2626;color:white;border-radius:8px;text-decoration:none;font-weight:bold">🏃 患者の場所を開く</a>`
          : `<p style="font-weight:bold;color:#16a34a">💼 ${aedName} のAEDを取得して患者のもとへ</p>
             <a href="${aedMapUrl}" style="display:inline-block;margin-right:8px;padding:10px 16px;background:#16a34a;color:white;border-radius:8px;text-decoration:none;font-weight:bold">🗺️ AEDの場所</a>
             <a href="${patientMapUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:bold">🏃 患者の場所</a>`
        }
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">※ AED Navigator から自動送信されています。</p>
      </div>
    `,
  });
}

async function sendThankYouEmail(resend: Resend, email: string, name: string) {
  await resend.emails.send({
    from: "AED Navigator <onboarding@resend.dev>",
    to: email,
    subject: "応援者が確保されました — AED Navigator",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#2563eb;color:white;padding:16px 20px;border-radius:12px;margin-bottom:20px">
          <h1 style="margin:0;font-size:20px">✅ 応援者が見つかりました</h1>
        </div>
        <p style="font-size:16px;font-weight:bold">${name} さん</p>
        <p style="font-size:15px;color:#374151">
          ご回答ありがとうございます。<br>
          別の方が現場に向かうことになりました。<br>
          ご協力に感謝申し上げます。
        </p>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">※ AED Navigator から自動送信されています。</p>
      </div>
    `,
  });
}

// POST /api/doctor-dispatch
// Body: { lat, lng, topAEDs: [{ aedId, aedName, aedLat, aedLng }] }
export async function POST(req: NextRequest) {
  ensureDemoDoctors();
  const { lat, lng, topAEDs = [] } = await req.json() as {
    lat: number;
    lng: number;
    topAEDs: AEDTarget[];
  };

  // If no AED info provided, fall back to patient location as single origin
  const aedTargets: AEDTarget[] = topAEDs.length > 0
    ? topAEDs
    : [{ aedId: "fallback", aedName: "最寄りAED", aedLat: lat, aedLng: lng }];

  const assigned = assignRespondersToAEDs(aedTargets, TOP_PER_AED);
  if (assigned.length === 0) {
    return NextResponse.json({ ok: true, dispatchId: null, responderCount: 0 });
  }

  const dispatchId = crypto.randomUUID();
  const invites: DoctorInvite[] = assigned.map((r) => ({
    token: crypto.randomUUID(),
    doctorId: r.clientId,
    name: r.name,
    email: r.email!,
  }));

  createDispatch(dispatchId, lat, lng, invites);

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const resend = new Resend(apiKey);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    await Promise.allSettled(
      assigned.map((r, i) =>
        sendDispatchEmail(resend, {
          ...invites[i]!,
          distanceToAed: r.distanceToAed,
          role: r.role,
          aedName: r.assignedAed.aedName,
          aedLat: r.assignedAed.aedLat,
          aedLng: r.assignedAed.aedLng,
        }, lat, lng, baseUrl)
      )
    );
  }

  return NextResponse.json({ ok: true, dispatchId, responderCount: assigned.length });
}

// GET /api/doctor-dispatch?id=xxx — poll for status
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const record = getDispatch(id);
  if (!record) return NextResponse.json({ error: "not found" }, { status: 404 });

  const justFinalized = finalizeIfReady(record);

  if (justFinalized && !record.winnerNotified) {
    record.winnerNotified = true;
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey && record.winner) {
      const resend = new Resend(apiKey);
      const winner = record.winner;
      const winnerInvite = record.doctors.find((d) => d.token === winner.token);

      if (record.status === "assigned" && winnerInvite) {
        const others = record.responses.filter(
          (r) => r.token !== winner.token && r.etaMinutes !== null
        );
        await Promise.allSettled([
          sendWinnerEmail(
            resend,
            winner.email,
            winner.name,
            record.lat,
            record.lng,
            "最寄りAED",
            record.lat,
            record.lng,
            "doctor",
          ),
          ...others.map((r) => sendThankYouEmail(resend, r.email, r.name)),
        ]);
      }
    }
  }

  const elapsed = Date.now() - record.dispatchedAt;
  const secondsLeft = Math.max(0, Math.ceil((60000 - elapsed) / 1000));

  // Latest response (any respondent, regardless of finalization) — for real-time UI
  const latest = record.responses.at(-1);

  return NextResponse.json({
    status: record.status,
    secondsLeft,
    responseCount: record.responses.length,
    latestResponse: latest && latest.etaMinutes !== null
      ? { name: latest.name, etaMinutes: latest.etaMinutes }
      : null,
    winner: record.winner
      ? { name: record.winner.name, etaMinutes: record.winner.etaMinutes }
      : null,
  });
}
