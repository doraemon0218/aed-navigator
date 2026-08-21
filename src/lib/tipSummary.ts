const SUMMARY_KEY = "aed_tip_summaries_v1";

export function getTipSummary(aedId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const all = JSON.parse(localStorage.getItem(SUMMARY_KEY) ?? "{}") as Record<string, string>;
    return all[aedId] ?? null;
  } catch {
    return null;
  }
}

export function saveTipSummary(aedId: string, summary: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(SUMMARY_KEY) ?? "{}") as Record<string, string>;
    all[aedId] = summary;
    localStorage.setItem(SUMMARY_KEY, JSON.stringify(all));
  } catch {}
}
