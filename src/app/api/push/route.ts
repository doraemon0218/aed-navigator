import { NextRequest, NextResponse } from "next/server";
import type { PushSubscription } from "web-push";
import { setSubscription, getSubscription } from "@/lib/pushStore";

export async function POST(req: NextRequest) {
  const sub = (await req.json()) as PushSubscription;
  setSubscription(sub);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ hasSub: getSubscription() !== null });
}
