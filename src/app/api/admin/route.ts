import { NextRequest, NextResponse } from "next/server";

const PASSWORD = process.env.ADMIN_PASSWORD ?? "aed2024admin";

export async function POST(req: NextRequest) {
  const { password } = await req.json() as { password: string };
  if (password !== PASSWORD) {
    return NextResponse.json({ ok: false, error: "認証に失敗しました" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
