/**
 * A one-slot, short-lived hand-off between pages. Save & Exit and sign-out
 * navigate away immediately, so the page that triggers the moment can't show
 * Bueno itself; it leaves a note here and the next page's host picks it up.
 *
 * sessionStorage on purpose: it dies with the tab, and every access is wrapped
 * because it can throw (private windows, blocked site data).
 */
export type MascotEventType = 'saved-exit' | 'signed-out';

export type MascotEvent = { type: MascotEventType; at: number };

export const EVENT_KEY = 'bueno:event';
/** A note older than this is stale (the student wandered off), so it is dropped. */
export const EVENT_TTL_MS = 2 * 60 * 1000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function pushMascotEvent(
  type: MascotEventType,
  storage: StorageLike | null = defaultStorage(),
  now: number = Date.now()
): void {
  if (!storage) return;
  try {
    storage.setItem(EVENT_KEY, JSON.stringify({ type, at: now } satisfies MascotEvent));
  } catch {
    /* best effort: a missing goodbye must never break leaving a quiz */
  }
}

/** Reads and clears the pending event; null if there is none, it is stale, or it is malformed. */
export function consumeMascotEvent(
  storage: StorageLike | null = defaultStorage(),
  now: number = Date.now()
): MascotEvent | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(EVENT_KEY);
    if (!raw) return null;
    storage.removeItem(EVENT_KEY);
    const parsed = JSON.parse(raw) as Partial<MascotEvent>;
    if (parsed.type !== 'saved-exit' && parsed.type !== 'signed-out') return null;
    if (typeof parsed.at !== 'number' || now - parsed.at > EVENT_TTL_MS || parsed.at > now + 5_000) return null;
    return { type: parsed.type, at: parsed.at };
  } catch {
    return null;
  }
}
