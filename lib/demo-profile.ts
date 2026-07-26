/**
 * Demo-mode helpers. Deliberately zero external dependencies —
 * anything that imports this file must remain able to tree-shake
 * @supabase/supabase-js away when it doesn't need real auth.
 */

export type UserRole = 'student' | 'professor' | 'admin';

const ROLE_DASHBOARD: Record<UserRole, string> = {
  student: '/student/dashboard',
  professor: '/professor/dashboard',
  admin: '/admin/dashboard',
};

export function dashboardPathForRole(role: UserRole | null | undefined) {
  if (!role) return '/login';
  return ROLE_DASHBOARD[role] ?? '/login';
}

/**
 * Demo mode: profile lives in localStorage, middleware waves
 * everything through. Explicit opt-in via NEXT_PUBLIC_DEMO=1.
 */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO === '1';
}

export const DEMO_PROFILE_KEY = 'medz-demo-profile';

export type DemoProfile = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
};

export function readDemoProfile(): DemoProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DEMO_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoProfile;
    if (!parsed || !parsed.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDemoProfile(profile: DemoProfile) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify(profile));
}

export function clearDemoProfile() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DEMO_PROFILE_KEY);
}

export function inferRoleFromEmail(email: string): UserRole {
  const lower = email.toLowerCase();
  if (/\b(admin|ops|director)\b/.test(lower)) return 'admin';
  if (/\b(prof|professor|faculty|dr|teach|instructor)\b/.test(lower)) return 'professor';
  return 'student';
}
