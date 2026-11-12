/**
 * Exam dates for the Home countdown. Zero dependencies: safe in client
 * components, route handlers and unit tests.
 *
 * Every module has up to two exams (End of Module, Final). A student sees a
 * countdown to the nearest exam that has not passed, across the modules of
 * their academic year. A module with no entry here has no countdown.
 *
 * Format: 'YYYY-MM-DD', the exam day itself, Africa/Cairo. `label` is shown
 * verbatim on Home ("12 days to End of Module ISK 101").
 *
 * TODO(owner): Year 2 final exams (205, 206) are not announced yet; add them
 * as a second entry in each list when they are. Year 4-5 have no modules yet.
 */

export type ExamDate = string | null;

export interface ModuleExam {
  date: ExamDate;
  label: string;
}

export interface ExamSchedule {
  /** Keyed by module code, e.g. '205'. */
  byModule: Record<string, ModuleExam[]>;
}

export const EXAM_SCHEDULE: ExamSchedule = {
  byModule: {
    // Year 1
    '101': [
      { date: '2026-12-02', label: 'End of Module ISK 101' },
      { date: '2026-12-12', label: 'Final ISK 101' },
    ],
    '102': [
      { date: '2026-12-07', label: 'End of Module INT 102' },
      { date: '2026-12-21', label: 'Final INT 102' },
    ],
    // Year 2
    '205': [{ date: '2026-11-16', label: 'End of Module 205' }],
    '206': [{ date: '2026-12-30', label: 'End of Module 206' }],
    // Year 3
    '310': [
      { date: '2026-12-19', label: 'End of Module PAT 310' },
      { date: '2026-12-22', label: 'Final PAT 310' },
    ],
    '309': [
      { date: '2026-12-30', label: 'End of Module INF 309' },
      { date: '2027-01-02', label: 'Final INF 309' },
    ],
  },
};

const TIME_ZONE = 'Africa/Cairo';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function validDate(value: ExamDate | undefined): string | null {
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

/** The exams of one module that have a valid date (invalid or null dates are dropped). */
export function examsFor(
  moduleCode: string,
  schedule: ExamSchedule = EXAM_SCHEDULE
): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [];
  for (const exam of schedule.byModule[moduleCode] ?? []) {
    const date = validDate(exam.date);
    if (date) out.push({ date, label: exam.label });
  }
  return out;
}

/**
 * Whether any exam at all has a valid date. Lets the API answer "no countdown"
 * without touching the database.
 */
export function hasExamDates(schedule: ExamSchedule = EXAM_SCHEDULE): boolean {
  return Object.keys(schedule.byModule).some((code) => examsFor(code, schedule).length > 0);
}

/** Whole days from `today` to `date` (both 'YYYY-MM-DD'): 0 on the day, negative once past. */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}
