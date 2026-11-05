import type { GreetingSlot, SeenGreetings } from '@/lib/mascot/greeting';

/**
 * Which greetings this device has already shown today, so the daily hello is
 * once per day and not once per page load. Stored per student: a second student
 * signing in on the same device starts clean. Every access is wrapped because
 * localStorage can throw (private windows, blocked site data); with no storage
 * the worst case is that nothing is remembered.
 */
export const SEEN_KEY = 'bueno:seen';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

type Stored = { user: string; daily?: string | null; evening?: string | null };

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readSeen(userId: string, storage: StorageLike | null = defaultStorage()): SeenGreetings {
  if (!storage) return {};
  try {
    const raw = storage.getItem(SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (!parsed || parsed.user !== userId) return {};
    return {
      daily: typeof parsed.daily === 'string' ? parsed.daily : null,
      evening: typeof parsed.evening === 'string' ? parsed.evening : null,
    };
  } catch {
    return {};
  }
}

/** Records `slots` as shown on `today` for this student, keeping the other slot's date. */
export function markSeen(
  userId: string,
  slots: GreetingSlot[],
  today: string,
  storage: StorageLike | null = defaultStorage()
): void {
  if (!storage) return;
  try {
    const next: Stored = { user: userId, ...readSeen(userId, storage) };
    for (const slot of slots) next[slot] = today;
    storage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    /* best effort: forgetting only means one extra greeting */
  }
}
