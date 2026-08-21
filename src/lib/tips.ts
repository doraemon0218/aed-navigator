const TIPS_KEY = "aed_tips_v1";

export interface AEDTip {
  aedId: string;
  text: string;
  userName: string;
  addedAt: string;
}

export function getTips(): AEDTip[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(TIPS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function getTipsForAED(aedId: string): AEDTip[] {
  return getTips().filter((t) => t.aedId === aedId);
}

export function addTip(aedId: string, text: string, userName: string): void {
  const tips = getTips();
  tips.push({ aedId, text: text.trim(), userName, addedAt: new Date().toISOString() });
  localStorage.setItem(TIPS_KEY, JSON.stringify(tips));
}
