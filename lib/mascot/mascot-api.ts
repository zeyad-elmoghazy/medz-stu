import type { StreakState } from '@/lib/streak-state';

/** Response of GET /api/student/mascot/status. */
export type MascotStatus = {
  today: string;
  state: StreakState;
  rescue: { answeredToday: number; target: number };
};

/** Null on any failure: the mascot is a bonus, so the app just carries on without him. */
export async function fetchMascotStatus(signal?: AbortSignal): Promise<MascotStatus | null> {
  try {
    const res = await fetch('/api/student/mascot/status', {
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as MascotStatus;
  } catch {
    return null;
  }
}
