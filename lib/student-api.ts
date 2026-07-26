import type { StudentStats } from './dashboard-data';

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

export async function pingStreak(): Promise<void> {
  await fetch('/api/student/streak/update', {
    method: 'POST',
    credentials: 'include',
  });
}

export async function markChallengeComplete(): Promise<number> {
  const res = await fetch('/api/student/streak/complete', {
    method: 'POST',
    credentials: 'include',
  });
  const data = await res.json();
  return data.streak;
}
