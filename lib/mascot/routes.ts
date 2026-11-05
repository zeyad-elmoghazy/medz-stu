/**
 * Where the floating Bueno (daily greeting, peace-sign goodbye) must stay quiet:
 * during a quiz, where it would break concentration, and on the results screens,
 * which already have their own Bueno reacting to the score.
 */
const QUIET_PREFIXES = ['/student/quiz/', '/student/results/'] as const;

export function isQuietRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return QUIET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
