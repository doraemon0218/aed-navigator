import { NextRequest, NextResponse } from "next/server";
import type { PushSubscription } from "web-push";
import { upsertDoctor, getAllActiveDoctors, ensureDemoDoctors } from "@/lib/doctorStore";

interface RegisterBody {
  clientId: string;
  name: string;
  role?: import("@/lib/doctorStore").MedicalRole;
  email?: string;
  lat: number;
  lng: number;
  pushSub: PushSubscription | null;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as RegisterBody;
  upsertDoctor({ ...body, role: body.role ?? "doctor", ts: Date.now() });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  ensureDemoDoctors();
  const doctors = getAllActiveDoctors().map((d) => ({
    clientId: d.clientId,
    name: d.name,
    lat: d.lat,
    lng: d.lng,
    ts: d.ts,
  }));
  return NextResponse.json({ doctors });
}
