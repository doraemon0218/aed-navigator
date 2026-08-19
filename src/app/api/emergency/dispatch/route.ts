import { NextResponse } from "next/server";

export interface Responder {
  id: string;
  name: string;
  role: "doctor" | "nurse" | "paramedic" | "volunteer";
  badge: string;
  lat: number;
  lng: number;
  distanceM: number;
  etaSeconds: number;
  task: string;
  status: string;
}

// Master registered responders near Central Tokyo (中央区)
const REGISTERED_RESPONDERS: Omit<Responder, "distanceM" | "etaSeconds" | "task" | "status">[] = [
  {
    id: "dr-1",
    name: "Dr.相山 (救急科医師)",
    role: "doctor",
    badge: "👨‍⚕️ 医師 (厚労省認証済)",
    lat: 35.6712,
    lng: 139.7711,
  },
  {
    id: "nurse-1",
    name: "ナース鈴木",
    role: "nurse",
    badge: "👩‍⚕️ 看護師 (ACLS修了)",
    lat: 35.6698,
    lng: 139.7729,
  },
  {
    id: "paramedic-1",
    name: "消防指令・救急隊",
    role: "paramedic",
    badge: "🚑 119指令中枢連携",
    lat: 35.6728,
    lng: 139.7738,
  },
];

// Haversine distance in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userLat = 35.670599, userLng = 139.77201 } = body;

    console.log(`\n==================================================`);
    console.log(`[DISPATCH BACKEND LOG] 🚨 Emergency Dispatch Triggered!`);
    console.log(`[DISPATCH BACKEND LOG] Incident Location: (${userLat}, ${userLng})`);

    const responders: Responder[] = REGISTERED_RESPONDERS.map((resp) => {
      const distM = getDistanceMeters(userLat, userLng, resp.lat, resp.lng);
      const etaSec = Math.round(distM / 1.5);

      let task = "";
      let status = "";

      if (resp.role === "doctor") {
        task = "現場直行：胸骨圧迫・救命指導指揮";
        status = `現場へ急行中 (残り ${distM}m / 予想${etaSec}秒)`;
      } else if (resp.role === "nurse") {
        task = "最寄り第1位AEDの確保＆現場搬送";
        status = `AEDピックアップ移動中 (${distM}m)`;
      } else {
        task = "119通報自動連携・救急車誘導";
        status = `消防出動連携中 (予想${etaSec}秒)`;
      }

      console.log(`[DISPATCH BACKEND LOG] -> Assigned: ${resp.name} (${resp.badge}) | Task: ${task} | ETA: ${etaSec}s`);

      return {
        ...resp,
        distanceM: distM,
        etaSeconds: etaSec,
        task,
        status,
      };
    });

    console.log(`[DISPATCH BACKEND LOG] ✅ Dispatch optimization complete! Returned ${responders.length} responders.`);
    console.log(`==================================================\n`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      userLocation: { lat: userLat, lng: userLng },
      respondersCount: responders.length,
      responders,
      aiNotice: "【自動配信完了】近隣の登録医療従事者3名に救助要請および最適タスクを配信しました。",
    });
  } catch (error) {
    console.error("[DISPATCH BACKEND ERROR]", error);
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
  }
}
