import type { PushSubscription } from "web-push";

// Module-level singleton — works for single-instance demo
let _sub: PushSubscription | null = null;

export function setSubscription(sub: PushSubscription) { _sub = sub; }
export function getSubscription(): PushSubscription | null { return _sub; }
