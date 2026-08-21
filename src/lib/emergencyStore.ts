export interface ActiveEmergency {
  lat: number;
  lng: number;
  ts: number;
  doctorsNotified: number;
}

const TTL_MS = 10 * 60 * 1000;

let _stored: ActiveEmergency | null = null;

export function getEmergency(): ActiveEmergency | null {
  if (!_stored || Date.now() - _stored.ts > TTL_MS) return null;
  return _stored;
}

export function setEmergency(e: ActiveEmergency): void { _stored = e; }
export function clearEmergency(): void { _stored = null; }
