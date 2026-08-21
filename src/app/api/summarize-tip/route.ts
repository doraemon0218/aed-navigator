import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { tips } = await req.json() as { tips: string[] };

  if (!tips || tips.length === 0) {
    return NextResponse.json({ summary: null });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ summary: null }, { status: 500 });
  }

  const tipsText = tips.map((t) => `・${t}`).join("\n");
  const prompt =
    `AEDの目印メモです。内容を統合し、緊急時に人に伝えやすい25文字以内の一文にしてください。返答は要約文のみ（句読点含む）。\n\n${tipsText}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await res.json() as {
      candidates?: { content: { parts: { text: string }[] } }[];
    };
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ summary: null }, { status: 500 });
  }
}
