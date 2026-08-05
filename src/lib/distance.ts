import type { AEDLocation } from "@/app/api/aed/route";

export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type RankedAED = AEDLocation & { distanceM: number; rank: number };

export function findTopAEDs(
  userLat: number,
  userLng: number,
  aeds: AEDLocation[],
  top = 5,
): RankedAED[] {
  const withDist = aeds.map((aed) => ({
    ...aed,
    distanceM: Math.round(haversineDistance(userLat, userLng, aed.lat, aed.lng)),
  }));

  // Accessible AEDs first, then inaccessible — each group sorted by distance
  const accessible = withDist.filter((a) => a.accessible).sort((a, b) => a.distanceM - b.distanceM);
  const inaccessible = withDist.filter((a) => !a.accessible).sort((a, b) => a.distanceM - b.distanceM);

  return [...accessible, ...inaccessible]
    .slice(0, top)
    .map((aed, i) => ({ ...aed, rank: i + 1 }));
}

export function findNearestAED(
  userLat: number,
  userLng: number,
  aeds: AEDLocation[],
  accessibleOnly = true
): (AEDLocation & { distanceM: number }) | null {
  const candidates = accessibleOnly ? aeds.filter((a) => a.accessible) : aeds;
  if (candidates.length === 0) return null;

  const top = findTopAEDs(userLat, userLng, candidates, 1);
  return top[0] ?? null;
}
