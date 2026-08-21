import type { PushSubscription } from "web-push";

export type MedicalRole = "doctor" | "nurse" | "student" | "paramedic";

export interface DoctorPresence {
  clientId: string;
  name: string;
  email?: string;
  role: MedicalRole;
  lat: number;
  lng: number;
  ts: number;
  pushSub: PushSubscription | null;
}

export const ROLE_LABELS: Record<MedicalRole, { label: string; badge: string; task: string }> = {
  doctor:    { label: "医師",       badge: "👨‍⚕️ 医師",       task: "現場直行：胸骨圧迫・救命指導" },
  nurse:     { label: "看護師",     badge: "👩‍⚕️ 看護師",     task: "AED確保＆現場搬送サポート" },
  student:   { label: "医学生",     badge: "🎓 医学生",       task: "AED取得＆現場搬送" },
  paramedic: { label: "救急救命士", badge: "🚑 救急救命士",   task: "119連携・救急車誘導" },
};

const TTL_MS = 5 * 60 * 1000;

const _doctors = new Map<string, DoctorPresence>();

// Demo registrants — always active for hackathon demo
const DEMO_DOCTORS: DoctorPresence[] = [
  {
    clientId: "demo-doctor-1",
    name: "Aさん",
    email: "aiyam.doraemon@gmail.com",
    role: "nurse",
    lat: 35.6712,
    lng: 139.7711,
    ts: 0,
    pushSub: null,
  },
  {
    clientId: "demo-doctor-2",
    name: "Bさん",
    email: "y.aiyama.0218@gmail.com",
    role: "student",
    lat: 35.6698,
    lng: 139.7729,
    ts: 0,
    pushSub: null,
  },
];

export function ensureDemoDoctors(): void {
  const now = Date.now();
  for (const d of DEMO_DOCTORS) {
    _doctors.set(d.clientId, { ...d, ts: now });
  }
}

export function upsertDoctor(presence: DoctorPresence): void {
  _doctors.set(presence.clientId, presence);
}

export function getDoctorsNearby(lat: number, lng: number, radiusM: number): DoctorPresence[] {
  const now = Date.now();
  const results: DoctorPresence[] = [];
  for (const d of _doctors.values()) {
    if (now - d.ts > TTL_MS) continue;
    if (haversine(lat, lng, d.lat, d.lng) <= radiusM) results.push(d);
  }
  return results;
}

export function getAllActiveDoctors(): DoctorPresence[] {
  const now = Date.now();
  return [..._doctors.values()].filter((d) => now - d.ts <= TTL_MS);
}

export function clearAllDoctors(): void {
  _doctors.clear();
}

export interface AEDTarget {
  aedId: string;
  aedName: string;
  aedLat: number;
  aedLng: number;
}

export interface AssignedResponder extends DoctorPresence {
  distanceToAed: number;
  assignedAed: AEDTarget;
}

/**
 * For each AED in `aeds`, find the nearest N active registrants.
 * Each registrant is assigned to the AED they are closest to.
 * Returns up to maxPerAed * aeds.length unique assignees, sorted by distanceToAed.
 */
export function assignRespondersToAEDs(
  aeds: AEDTarget[],
  maxPerAed: number,
): AssignedResponder[] {
  const now = Date.now();
  const active = [..._doctors.values()].filter(
    (d) => now - d.ts <= TTL_MS && d.email,
  );

  // For each person: find which AED they're closest to and the distance
  type Candidate = { person: DoctorPresence; distanceToAed: number; aed: AEDTarget };
  const candidates: Candidate[] = active.map((person) => {
    let best: { dist: number; aed: AEDTarget } | null = null;
    for (const aed of aeds) {
      const dist = Math.round(haversine(person.lat, person.lng, aed.aedLat, aed.aedLng));
      if (!best || dist < best.dist) best = { dist, aed };
    }
    return { person, distanceToAed: best!.dist, aed: best!.aed };
  });

  // Group by assigned AED, take top maxPerAed per AED
  const byAed = new Map<string, Candidate[]>();
  for (const aed of aeds) byAed.set(aed.aedId, []);
  for (const c of candidates) {
    byAed.get(c.aed.aedId)?.push(c);
  }

  const selected: AssignedResponder[] = [];
  const seen = new Set<string>();

  for (const aed of aeds) {
    const group = (byAed.get(aed.aedId) ?? [])
      .sort((a, b) => a.distanceToAed - b.distanceToAed)
      .slice(0, maxPerAed);
    for (const c of group) {
      if (seen.has(c.person.clientId)) continue;
      seen.add(c.person.clientId);
      selected.push({ ...c.person, distanceToAed: c.distanceToAed, assignedAed: c.aed });
    }
  }

  return selected.sort((a, b) => a.distanceToAed - b.distanceToAed);
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
