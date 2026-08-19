import { NextResponse } from "next/server";
import Iconv from "iconv-lite";

export interface AEDLocation {
  id: string;
  name: string;
  address: string;
  installLocation: string;
  lat: number;
  lng: number;
  availableDays: string;
  startTime: string;
  endTime: string;
  accessible: boolean;
}

// 自治体標準オープンデータセット column layout (0-indexed)
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

const DAY_MAP: Record<string, number> = {
  日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6,
};

function isAccessibleNow(days: string, start: string, end: string): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  if (!days && !start && !end) return true;
  if (days) {
    const nums = [...days].map((c) => DAY_MAP[c]).filter((n) => n !== undefined);
    if (nums.length > 0 && !nums.includes(dayOfWeek)) return false;
  }
  if (start === "0:00" && end === "0:00") return true;
  if (!start || !end) return true;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (sh === undefined || eh === undefined) return true;
  const startMin = (sh ?? 0) * 60 + (sm ?? 0);
  const endMin = (eh ?? 0) * 60 + (em ?? 0);
  return currentMinutes >= startMin && currentMinutes <= endMin;
}

function inTokyo(lat: number, lng: number): boolean {
  return lat >= 35.5 && lat <= 35.9 && lng >= 139.0 && lng <= 140.1;
}

// Detect lat/lng column indices from header if non-standard
function detectLatLng(header: string[]): { lat: number; lng: number } {
  const latIdx = header.findIndex((h) => h.includes("緯度"));
  const lngIdx = header.findIndex((h) => h.includes("経度"));
  return {
    lat: latIdx >= 0 ? latIdx : COL.LAT,
    lng: lngIdx >= 0 ? lngIdx : COL.LNG,
  };
}

function parseCSV(text: string, wardId: string): AEDLocation[] {
  const lines = text.split("\n").filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const { lat: latCol, lng: lngCol } = detectLatLng(header);

  const aeds: AEDLocation[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (row.length < Math.max(latCol, lngCol) + 1) continue;

    const lat = parseFloat(row[latCol] ?? "");
    const lng = parseFloat(row[lngCol] ?? "");
    if (isNaN(lat) || isNaN(lng) || !inTokyo(lat, lng)) continue;

    const name = row[COL.NAME] || `AED ${wardId}-${i}`;
    const address = row[COL.ADDRESS] || "";
    const installLocation = row[COL.INSTALL_LOCATION] || "";
    const days = row[COL.AVAILABLE_DAYS] || "";
    const start = row[COL.START_TIME] || "";
    const end = row[COL.END_TIME] || "";

    aeds.push({
      id: `${wardId}-${i}`,
      name,
      address,
      installLocation,
      lat,
      lng,
      availableDays: days,
      startTime: start,
      endTime: end,
      accessible: isAccessibleNow(days, start, end),
    });
  }
  return aeds;
}

interface WardSource {
  id: string;
  url: string;
  encoding?: "Shift_JIS" | "utf-8";
}

// Tokyo ward AED open data sources (自治体標準オープンデータセット準拠)
const WARD_SOURCES: WardSource[] = [
  { id: "chuo",             url: "https://www.city.chuo.lg.jp/documents/984/aed.csv", encoding: "Shift_JIS" },
  { id: "koto",             url: "https://www.opendata.metro.tokyo.lg.jp/koto/131083_008_aed.csv" },
  { id: "nerima",           url: "https://www.city.nerima.tokyo.jp/kusei/tokei/opendata/opendatasite/hokenfukushi/aed.files/131202_aed.csv" },
  { id: "bunkyo",           url: "https://www.city.bunkyo.lg.jp/documents/6059/aedsettikasyoitiran.csv" },
  { id: "sumida",           url: "https://www.city.sumida.lg.jp/kuseijoho/sumida_info/opendata/opendata_ichiran/aed_data.files/shisetsu_aed_20210818.csv" },
  { id: "toshima",          url: "https://www.opendata.metro.tokyo.lg.jp/toyoshima/R4_aed.csv" },
  { id: "koganei",          url: "https://www.opendata.metro.tokyo.lg.jp/koganei/08_aed.csv" },
  { id: "komae",            url: "https://www.opendata.metro.tokyo.lg.jp/komae/132195_aed.csv" },
  { id: "machida",          url: "https://www.city.machida.tokyo.jp/shisei/opendata/shisetsu/aed.files/132098_aed.csv" },
  { id: "higashimurayama",  url: "https://www.opendata.metro.tokyo.lg.jp/higashimurayama/20240619_aed.csv" },
  { id: "hamura",           url: "https://www.opendata.metro.tokyo.lg.jp/hamura/132276_aed.csv" },
  { id: "akiruno",          url: "https://www.city.akiruno.tokyo.jp/cmsfiles/contents/0000015/15465/132284_aed.csv" },
];

async function fetchWard(source: WardSource): Promise<AEDLocation[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(source.url, {
      signal: controller.signal,
      next: { revalidate: 3600 },
    } as RequestInit & { next: { revalidate: number } });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const text = source.encoding === "Shift_JIS"
      ? Iconv.decode(Buffer.from(buffer), "Shift_JIS")
      : new TextDecoder("utf-8").decode(buffer);
    return parseCSV(text, source.id);
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Remove AEDs within ~10m of an already-kept entry
function deduplicateAEDs(all: AEDLocation[]): AEDLocation[] {
  const kept: AEDLocation[] = [];
  for (const aed of all) {
    const dup = kept.some(
      (k) => Math.abs(k.lat - aed.lat) < 0.0001 && Math.abs(k.lng - aed.lng) < 0.0001
    );
    if (!dup) kept.push(aed);
  }
  return kept;
}

export async function GET() {
  const results = await Promise.allSettled(WARD_SOURCES.map(fetchWard));

  const all: AEDLocation[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
    else console.warn("[AED API] Ward fetch failed:", (r.reason as Error)?.message ?? r.reason);
  }

  const aeds = deduplicateAEDs(all);
  return NextResponse.json({ aeds, total: aeds.length });
}
