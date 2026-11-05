/**
 * Calendar-day helpers shared by the streak code and the mascot.
 *
 * Days are plain 'YYYY-MM-DD' strings (the `daily_streaks.streak_date`
 * format). Arithmetic goes through UTC so a DST change can never make a
 * day 23 or 25 hours long.
 */

/**
 * "Today" exactly the way the streak routes compute it (local getters of
 * the machine running the server, which is UTC on Vercel). The mascot must
 * agree with what `record_quiz_result` writes, so it uses the same rule.
 */
export function todayISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return t.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday, for a 'YYYY-MM-DD' string. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
