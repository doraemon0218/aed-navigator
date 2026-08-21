import { NextRequest, NextResponse } from "next/server";
import { getSubscription } from "@/lib/pushStore";
import { getDoctorsNearby } from "@/lib/doctorStore";
import { getEmergency, setEmergency, clearEmergency } from "@/lib/emergencyStore";

async function sendPushTo(sub: import("web-push").PushSubscription, payload: string) {
  const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:demo@example.com";
  if (!pubKey || !privKey) return;
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(subject, pubKey, privKey);
  await webpush.sendNotification(sub, payload);
}

export async function GET() {
  const emergency = getEmergency();
  return NextResponse.json({ emergency });
}

export async function POST(req: NextRequest) {
  const { lat, lng, notifyDoctors } = await req.json() as {
    lat: number;
    lng: number;
    notifyDoctors?: boolean;
  };

  let doctorsNotified = 0;

  if (notifyDoctors) {
    const nearbyDoctors = getDoctorsNearby(lat, lng, 800);
    const doctorPayload = JSON.stringify({
      title: "🩺 医師への救護支援依頼",
      body: "付近（800m以内）で心停止が発生しました。現場での救護支援をお願いします。",
      url: `/respond?lat=${lat}&lng=${lng}`,
    });

    const results = await Promise.allSettled(
      nearbyDoctors
        .filter((d) => d.pushSub)
        .map((d) => sendPushTo(d.pushSub!, doctorPayload))
    );
    doctorsNotified = results.filter((r) => r.status === "fulfilled").length;

    const selfSub = getSubscription();
    if (selfSub) {
      sendPushTo(selfSub, JSON.stringify({
        title: "🚨 緊急: 心停止が発生しました",
        body: "近くでAED要請が出ています。アプリを開いて確認してください！",
        url: "/respond",
      })).catch(() => {});
    }
  }

  setEmergency({ lat, lng, ts: Date.now(), doctorsNotified });
  return NextResponse.json({ ok: true, doctorsNotified });
}

export async function DELETE() {
  clearEmergency();
  return NextResponse.json({ ok: true });
}
