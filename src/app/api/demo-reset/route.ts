import { NextResponse } from "next/server";
import { clearAllDoctors } from "@/lib/doctorStore";
import { clearEmergency } from "@/lib/emergencyStore";

export async function POST() {
  clearEmergency();
  clearAllDoctors();
  return NextResponse.json({ ok: true });
}
