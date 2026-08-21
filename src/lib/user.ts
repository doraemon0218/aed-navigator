const USER_KEY = "aed_user_v1";

export interface HomeBase {
  lat: number;
  lng: number;
  label: string;
}

export interface User {
  id: string;
  name: string;
  homeBase: HomeBase;
  points: number;
  createdAt: string;
  licenseNumber?: string;
  employer?: string;
  isDoctor?: boolean; // set true by admin approval
}

export const DEFAULT_HOME: HomeBase = {
  lat: 35.670599,
  lng: 139.77201,
  label: "中央区庁舎（デモ初期値）",
};

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function saveUser(name: string, homeBase: HomeBase = DEFAULT_HOME): User {
  const user: User = {
    id: crypto.randomUUID(),
    name,
    homeBase,
    points: 0,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export function updateHomeBase(homeBase: HomeBase): void {
  const user = getUser();
  if (!user) return;
  localStorage.setItem(USER_KEY, JSON.stringify({ ...user, homeBase }));
}

export function addPoints(pts: number): number {
  const user = getUser();
  if (!user) return 0;
  const updated = { ...user, points: user.points + pts };
  localStorage.setItem(USER_KEY, JSON.stringify(updated));
  return updated.points;
}

export function updateProfile(patch: Partial<Pick<User, "licenseNumber" | "employer" | "isDoctor">>): void {
  const user = getUser();
  if (!user) return;
  localStorage.setItem(USER_KEY, JSON.stringify({ ...user, ...patch }));
}
