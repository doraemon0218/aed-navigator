export interface DoctorInvite {
  token: string;
  doctorId: string;
  name: string;
  email: string;
}

export interface DoctorResponse {
  token: string;
  doctorId: string;
  name: string;
  email: string;
  etaMinutes: number | null; // null = 対応不可
  respondedAt: number;
}

export interface DispatchRecord {
  id: string;
  lat: number;
  lng: number;
  dispatchedAt: number;
  doctors: DoctorInvite[];
  responses: DoctorResponse[];
  status: "waiting" | "assigned" | "no_response";
  winner: DoctorResponse | null;
  winnerNotified: boolean;
}

const DEADLINE_MS = 60 * 1000; // 1 minute

const _dispatches = new Map<string, DispatchRecord>();

export function createDispatch(
  id: string,
  lat: number,
  lng: number,
  doctors: DoctorInvite[],
): DispatchRecord {
  const record: DispatchRecord = {
    id,
    lat,
    lng,
    dispatchedAt: Date.now(),
    doctors,
    responses: [],
    status: "waiting",
    winner: null,
    winnerNotified: false,
  };
  _dispatches.set(id, record);
  return record;
}

export function recordResponse(token: string, etaMinutes: number | null): DispatchRecord | null {
  for (const record of _dispatches.values()) {
    const invite = record.doctors.find((d) => d.token === token);
    if (!invite) continue;

    // Reject if already responded
    if (record.responses.some((r) => r.token === token)) return record;

    // Record only if within deadline
    const withinDeadline = Date.now() - record.dispatchedAt <= DEADLINE_MS;
    if (!withinDeadline) return record;

    record.responses.push({
      token,
      doctorId: invite.doctorId,
      name: invite.name,
      email: invite.email,
      etaMinutes,
      respondedAt: Date.now(),
    });

    return record;
  }
  return null;
}

export function getDispatch(id: string): DispatchRecord | null {
  return _dispatches.get(id) ?? null;
}

export function finalizeIfReady(record: DispatchRecord): boolean {
  if (record.status !== "waiting") return false;
  const elapsed = Date.now() - record.dispatchedAt;
  if (elapsed < DEADLINE_MS) return false;

  // Pick the respondent with the smallest eta (対応不可 = null は除外)
  const valid = record.responses.filter((r) => r.etaMinutes !== null);
  if (valid.length === 0) {
    record.status = "no_response";
  } else {
    const winner = valid.reduce((a, b) =>
      (a.etaMinutes ?? 999) <= (b.etaMinutes ?? 999) ? a : b
    );
    record.winner = winner;
    record.status = "assigned";
  }
  return true;
}
