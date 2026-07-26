/**
 * Streak utilities.
 *
 * Day-granularity arithmetic — every comparison normalizes to
 * 00:00 local time so a quiz finished at 23:59 still counts for
 * "today" and one finished at 00:01 the next morning starts a
 * new day.
 */

export function calculateStreak(
  sessions: { completedAt: string }[]
): number {
  // Sort sessions newest first
  // Walk backwards day by day from today
  // Count consecutive days that have at least one completed session
  // Return the streak count
  // If today has no session yet, start counting from yesterday (grace period)

  if (sessions.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sessionDays = new Set(
    sessions.map((s) => {
      const d = new Date(s.completedAt);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })
  );

  let streak = 0;
  const checkDay = new Date(today);

  // If no session today, start checking from yesterday
  if (!sessionDays.has(today.getTime())) {
    checkDay.setDate(checkDay.getDate() - 1);
  }

  while (sessionDays.has(checkDay.getTime())) {
    streak++;
    checkDay.setDate(checkDay.getDate() - 1);
  }

  return streak;
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}
