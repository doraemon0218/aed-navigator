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

// Access penalty added to distance score so that near-equal distances
// favour easy-access AEDs over caution/locked ones.
const ACCESS_PENALTY: Record<string, number> = {
  easy: 0,
  caution: 30,
  locked: 80,
};

export type AccessLevelMap = Map<string, "easy" | "caution" | "locked">;

export function findTopAEDs(
  userLat: number,
  userLng: number,
  aeds: AEDLocation[],
  top = 5,
  accessLevels?: AccessLevelMap,
): RankedAED[] {
  const withScore = aeds.map((aed) => {
    const distM = Math.round(haversineDistance(userLat, userLng, aed.lat, aed.lng));
    const level = accessLevels?.get(aed.id);
    const penalty = level ? (ACCESS_PENALTY[level] ?? 0) : 0;
    return { ...aed, distanceM: distM, _score: distM + penalty };
  });

  return withScore
    .sort((a, b) => a._score - b._score)
    .slice(0, top)
    .map((aed, i) => ({ ...aed, rank: i + 1 }));
}

/**
 * Rank 1 & 2 are non-security AEDs only.
 * Rank 3 is the nearest remaining AED (may be security).
 * "Security" = accessible===false OR access level===locked.
 */
export function findTopAEDsWithSecurityConstraint(
  userLat: number,
  userLng: number,
  aeds: AEDLocation[],
  accessLevels: AccessLevelMap,
  securityIds: Set<string>,
): RankedAED[] {
  const nonSecurity = aeds.filter((a) => !securityIds.has(a.id));
  const top2 = findTopAEDs(userLat, userLng, nonSecurity, 2, accessLevels);

  const usedIds = new Set(top2.map((a) => a.id));
  const remaining = aeds.filter((a) => !usedIds.has(a.id));
  if (remaining.length === 0) return top2;

  const [rank3] = findTopAEDs(userLat, userLng, remaining, 1, accessLevels);
  return rank3 ? [...top2, { ...rank3, rank: 3 }] : top2;
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
