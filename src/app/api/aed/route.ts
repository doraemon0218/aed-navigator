import { NextResponse } from "next/server";
import Iconv from "iconv-lite";

export interface AEDLocation {
  id: string;
  name: string;
  address: string;
  installLocation: string; // e.g. "1階正面玄関受付横"
  lat: number;
  lng: number;
  availableDays: string;  // e.g. "月火水木金土日"
  startTime: string;      // e.g. "0:00"
  endTime: string;        // e.g. "23:59"
  accessible: boolean;    // accessible right now
}

// Column indices from 中央区 AED CSV (Shift-JIS, confirmed from header)
const COL = {
  NAME: 3,
  ADDRESS: 8,
  LAT: 14,
  LNG: 15,
  INSTALL_LOCATION: 18,
  AVAILABLE_DAYS: 27,
  START_TIME: 28,
  END_TIME: 29,
} as const;

const AED_CSV_URL = "https://www.city.chuo.lg.jp/documents/984/aed.csv";

const DAY_MAP: Record<string, number> = {
  日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6,
};

function isAccessibleNow(days: string, start: string, end: string): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // No restriction info → assume accessible
  if (!days && !start && !end) return true;

  // Check day availability
  if (days) {
    const availableDayNums = [...days].map((c) => DAY_MAP[c]).filter((n) => n !== undefined);
    if (availableDayNums.length > 0 && !availableDayNums.includes(dayOfWeek)) return false;
  }

  // "0:00" start and "0:00" end means 24-hour access
  if (start === "0:00" && end === "0:00") return true;
  if (!start || !end) return true;

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (sh === undefined || eh === undefined) return true;
  const startMin = (sh ?? 0) * 60 + (sm ?? 0);
  const endMin = (eh ?? 0) * 60 + (em ?? 0);
  return currentMinutes >= startMin && currentMinutes <= endMin;
}

export async function GET() {
  try {
    const res = await fetch(AED_CSV_URL, { next: { revalidate: 3600 } });
    const buffer = await res.arrayBuffer();
    const decoded = Iconv.decode(Buffer.from(buffer), "Shift_JIS");
    const lines = decoded.split("\n").filter(Boolean);

    if (lines.length < 2) return NextResponse.json({ aeds: [], total: 0 });

    const aeds: AEDLocation[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols.length < 16) continue;

      const lat = parseFloat(cols[COL.LAT] ?? "");
      const lng = parseFloat(cols[COL.LNG] ?? "");
      if (isNaN(lat) || isNaN(lng)) continue;
      if (lat < 35.5 || lat > 35.8 || lng < 139.6 || lng > 140.0) continue;

      const days = cols[COL.AVAILABLE_DAYS] ?? "";
      const start = cols[COL.START_TIME] ?? "";
      const end = cols[COL.END_TIME] ?? "";

      aeds.push({
        id: `aed-${i}`,
        name: cols[COL.NAME] || `AED設置場所 ${i}`,
        address: cols[COL.ADDRESS] || "",
        installLocation: cols[COL.INSTALL_LOCATION] || "",
        lat,
        lng,
        availableDays: days,
        startTime: start,
        endTime: end,
        accessible: isAccessibleNow(days, start, end),
      });
    }

    return NextResponse.json({ aeds, total: aeds.length });
  } catch (err) {
    console.error("AED fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch AED data", aeds: [] }, { status: 500 });
  }
}
