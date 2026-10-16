import type { StudentStats } from './dashboard-data';
import type { ProfilePatch } from './profile-schema';
import type { StudentProfileDto } from './student-profile';
import type { LeaderboardRow } from './supabase';

/**
 * Client-side fetch helpers for the student data layer.
 *
 * All three include credentials so the session cookie ships with
 * each request. `cache: 'no-store'` on the stats endpoint defeats
 * Next's RSC fetch cache — the route handler already sets a
 * 60-second private cache via Cache-Control, which is the layer
 * we actually want doing the work.
 */

export async function fetchStudentStats(): Promise<StudentStats> {
  const res = await fetch('/api/student/stats', {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchStudentProfile(): Promise<StudentProfileDto> {
  const res = await fetch('/api/student/profile', {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await readApiError(res, 'Failed to load your profile'));
  return res.json();
}

/** Throws an Error carrying the server's user-facing message on failure. */
export async function updateStudentProfile(patch: ProfilePatch): Promise<StudentProfileDto> {
  const res = await fetch('/api/student/profile', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await readApiError(res, 'Could not save your changes'));
  return res.json();
}

export async function changeStudentPassword(current: string, next: string): Promise<void> {
  const res = await fetch('/api/student/profile/password', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current, next }),
  });
  if (!res.ok) throw new Error(await readApiError(res, 'Could not change your password'));
}

export async function deleteStudentAccount(confirmEmail: string): Promise<void> {
  const res = await fetch('/api/student/profile', {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: confirmEmail }),
  });
  if (!res.ok) throw new Error(await readApiError(res, 'Could not delete your account'));
}

/** The caller's own leaderboard row (rank, XP, badge); null if unranked. */
export async function fetchMyLeaderboardRow(): Promise<LeaderboardRow | null> {
  const res = await fetch('/api/student/leaderboard', {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  const body = (await res.json()) as { me: LeaderboardRow | null };
  return body.me ?? null;
}
