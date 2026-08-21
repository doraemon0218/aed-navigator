import { NextRequest, NextResponse } from "next/server";
import { recordResponse } from "@/lib/dispatchStore";

// GET /api/doctor-dispatch/respond?token=xxx&eta=5
// eta = number (minutes) | "none" (対応不可)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const etaParam = req.nextUrl.searchParams.get("eta");

  if (!token || !etaParam) {
    return new Response("パラメータが不正です。", { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const etaMinutes = etaParam === "none" ? null : parseInt(etaParam, 10);
  const record = recordResponse(token, etaMinutes);

  const isUnable = etaMinutes === null;
  const label = isUnable ? "対応不可" : `${etaMinutes}分`;

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>回答完了 — AED Navigator</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; background: #f9fafb; }
    .card { background: white; border-radius: 16px; padding: 40px 32px; max-width: 400px;
            width: 90%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 22px; margin: 0 0 12px; color: #111; }
    p { color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0; }
    .badge { display: inline-block; padding: 6px 18px; border-radius: 20px;
             font-weight: bold; font-size: 16px; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isUnable ? "🙏" : "✅"}</div>
    <h1>${isUnable ? "ご回答ありがとうございます" : "応答を受け付けました"}</h1>
    <span class="badge" style="background:${isUnable ? "#f3f4f6" : "#dcfce7"};color:${isUnable ? "#374151" : "#166534"}">
      ${label}
    </span>
    <p>
      ${isUnable
        ? "ご回答ありがとうございます。<br>別の医師が対応いたします。"
        : `到着まで ${label} のご回答を受け付けました。<br>現場へのご対応をよろしくお願いします。`}
      ${record ? "" : "<br><br><small style='color:#9ca3af'>（締め切り時刻を過ぎているため記録されませんでした）</small>"}
    </p>
  </div>
</body>
</html>`;

  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
