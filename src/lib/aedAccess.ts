const ACCESS_KEY = "aed_access_v1";

export type AccessLevel = "easy" | "caution" | "locked";

export interface AEDAccessInfo {
  level: AccessLevel;
  updatedAt: string;
}

function getAll(): Record<string, AEDAccessInfo> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(ACCESS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function getAEDAccess(aedId: string): AEDAccessInfo | null {
  return getAll()[aedId] ?? null;
}

export function setAEDAccess(aedId: string, level: AccessLevel): void {
  const all = getAll();
  all[aedId] = { level, updatedAt: new Date().toISOString() };
  localStorage.setItem(ACCESS_KEY, JSON.stringify(all));
}
