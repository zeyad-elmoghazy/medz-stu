/**
 * Academic-year helpers. Zero dependencies so they work in demo mode,
 * client components and route handlers alike.
 *
 * Model: a student stores the year they *chose* (`academic_year`) and the
 * academic session in which they chose it (`academic_year_session`). The
 * current year is derived on read, so nothing has to run on 1 September.
 *
 * A session starts on 1 September (Africa/Cairo) and is identified by the
 * calendar year it starts in: 2026 = Sep 2026 – Aug 2027. The SQL twin is
 * `public.academic_session(timestamptz)` in migration 030 — keep the two
 * in sync.
 */

export const ACADEMIC_YEAR_MIN = 1;
export const ACADEMIC_YEAR_MAX = 5;
export const ACADEMIC_YEARS = Array.from(
  { length: ACADEMIC_YEAR_MAX - ACADEMIC_YEAR_MIN + 1 },
  (_, i) => ACADEMIC_YEAR_MIN + i
);

const SESSION_TIME_ZONE = 'Africa/Cairo';
/** Month (1-based) in which a new academic session begins. */
const SESSION_START_MONTH = 9;

export function isValidAcademicYear(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= ACADEMIC_YEAR_MIN &&
    value <= ACADEMIC_YEAR_MAX
  );
}

/** The academic session (start year) that `date` falls in, per Cairo time. */
export function academicSession(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SESSION_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return month >= SESSION_START_MONTH ? year : year - 1;
}

/**
 * The student's current academic year, or null when it is unknown (never
 * chosen, or stored values are out of range). Advances by one for every
 * September that has started since the year was chosen, capped at
 * `ACADEMIC_YEAR_MAX`.
 */
export function currentAcademicYear(
  storedYear: number | null | undefined,
  storedSession: number | null | undefined,
  now: Date = new Date()
): number | null {
  if (!isValidAcademicYear(storedYear)) return null;
  if (typeof storedSession !== 'number' || !Number.isInteger(storedSession)) {
    return null;
  }
  const elapsed = Math.max(0, academicSession(now) - storedSession);
  return Math.min(ACADEMIC_YEAR_MAX, storedYear + elapsed);
}

/** "2026/27" for the session that starts in 2026. */
export function formatSession(session: number): string {
  const end = String((session + 1) % 100).padStart(2, '0');
  return `${session}/${end}`;
}

/** "Year 3" */
export function formatAcademicYear(year: number): string {
  return `Year ${year}`;
}
