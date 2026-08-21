import { addPoints } from "@/lib/user";

const STAMPS_KEY = "aed_stamps_v1";

export interface Stamp {
  aedId: string;
  scannedAt: string;
  method: "qr" | "manual";
}

// Stage definitions: cumulative AED count from home base
export const STAGES = [
  { id: 1, target: 10, bonus: 100, label: "ステージ1" },
  { id: 2, target: 30, bonus: 300, label: "ステージ2" },
  { id: 3, target: 50, bonus: 500, label: "ステージ3" },
] as const;

export const POINTS_PER_STAMP = 10;

export function getStamps(): Stamp[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STAMPS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function getStampedIds(): Set<string> {
  return new Set(getStamps().map((s) => s.aedId));
}

export function hasStamp(aedId: string): boolean {
  return getStamps().some((s) => s.aedId === aedId);
}

// Returns points gained (0 if already stamped)
export function addStamp(aedId: string, method: "qr" | "manual"): number {
  if (hasStamp(aedId)) return 0;

  const stamps = getStamps();
  stamps.push({ aedId, scannedAt: new Date().toISOString(), method });
  localStorage.setItem(STAMPS_KEY, JSON.stringify(stamps));

  // Base points per stamp
  let earned = POINTS_PER_STAMP;

  // Check stage completion bonus
  // The stamp we just added is for a specific rank in sorted AED list.
  // We award the bonus when the stamp count crosses a stage target.
  const newCount = stamps.length;
  for (const stage of STAGES) {
    if (newCount === stage.target) {
      earned += stage.bonus;
      break;
    }
  }

  addPoints(earned);
  return earned;
}

// Deterministic token per AED for QR validation
export function getStampToken(aedId: string): string {
  let h = 0x811c9dc5;
  for (const c of (aedId + "chuo-aed-navigator-2026")) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0").slice(0, 7);
}

export function validateStampToken(aedId: string, token: string): boolean {
  return getStampToken(aedId) === token;
}

// Current stage info based on stamp count within ranked AED list
export function getStageInfo(stampCount: number) {
  for (const stage of STAGES) {
    if (stampCount < stage.target) {
      return { current: stage, progress: stampCount, next: stage.target };
    }
  }
  const last = STAGES[STAGES.length - 1]!;
  return { current: last, progress: stampCount, next: last.target, completed: true };
}
