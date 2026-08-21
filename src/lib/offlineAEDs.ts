import type { AEDLocation } from "@/app/api/aed/route";

const STORAGE_KEY = "aed_verified_v1";

export interface VerifiedAED extends AEDLocation {
  verifiedAt: string;
}

export function getVerifiedAEDs(): VerifiedAED[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveVerifiedAED(aed: AEDLocation): void {
  const list = getVerifiedAEDs().filter((a) => a.id !== aed.id);
  list.push({ ...aed, verifiedAt: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function removeVerifiedAED(id: string): void {
  const list = getVerifiedAEDs().filter((a) => a.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function isVerifiedAED(id: string): boolean {
  return getVerifiedAEDs().some((a) => a.id === id);
}
