/**
 * Exam dates for the Home countdown. Zero dependencies: safe in client
 * components, route handlers and unit tests.
 *
 * TODO(owner): fill in the dates below when the faculty confirms them.
 * While a date is `null` the countdown card, and the /api/student/exam-plan
 * route behind it, stay completely hidden: shipping this file with every
 * date null changes nothing a student sees.
 *
 * Format: 'YYYY-MM-DD', the exam day itself, Africa/Cairo.
 *   byYear   one date for every module of an academic year (1-5).
 *   byModule optional override for a single module code, e.g. { '205': '2026-11-27' }.
 *            A module not listed here falls back to its year's date.
 */

export type ExamDate = string | null;

export interface ExamSchedule {
  byYear: Record<number, ExamDate>;
  byModule: Record<string, ExamDate>;
}

export const EXAM_SCHEDULE: ExamSchedule = {
  byYear: { 1: null, 2: null, 3: null, 4: null, 5: null },
  byModule: {},
};

const TIME_ZONE = 'Africa/Cairo';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function validDate(value: ExamDate | undefined): ExamDate {
  // The file is edited by hand: ignore anything that is not a real calendar date.
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? null : value;
}

/** Today's date in Cairo as 'YYYY-MM-DD' (en-CA formats year-month-day). */
export function cairoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** The exam date for one module of a year: the module override, else the year's, else null. */
export function examDateFor(
  year: number,
  moduleCode: string,
  schedule: ExamSchedule = EXAM_SCHEDULE
): ExamDate {
  const override = validDate(schedule.byModule[moduleCode]);
  return override ?? validDate(schedule.byYear[year]);
}

/**
 * Whether any date at all is set for this year (its own, or a module override).
 * Lets the API return "no countdown" without touching the database.
 */
export function hasExamDates(year: number, schedule: ExamSchedule = EXAM_SCHEDULE): boolean {
  return (
    validDate(schedule.byYear[year]) !== null ||
    Object.values(schedule.byModule).some((d) => validDate(d) !== null)
  );
}

/** Whole days from `today` to `date` (both 'YYYY-MM-DD'): 0 on the day, negative once past. */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}
