import { daysUntil } from '@/lib/exam-schedule';

/*
 * How many questions a day gets a student through their material before the
 * exam. Pure: no I/O. The route gathers the groups, this decides what Home shows.
 *
 * __tests__/unit/exam-plan.test.ts is the spec.
 */

/** One exam day and the work still to do for the modules that sit it. */
export interface ExamGroup {
  /** 'YYYY-MM-DD', Africa/Cairo. */
  date: string;
  label: string;
  remainingQuestions: number;
  /** Published questions in the module(s) behind this exam; 0 = no content yet. */
  publishedQuestions: number;
}

/** 'empty' = the exam is coming but its module has no published questions yet. */
export type ExamPlanStatus = 'upcoming' | 'today' | 'done' | 'empty';

export interface ExamPlan {
  examDate: string;
  label: string;
  /** Whole days until the exam; 0 on the day. */
  daysLeft: number;
  remaining: number;
  /** Suggested questions per day from today; 0 when there is nothing to plan. */
  perDay: number;
  status: ExamPlanStatus;
}

/**
 * Questions to do each day to be through `remaining` by the exam.
 * `daysLeft` is at least 1 here (the exam day itself is not a study day).
 *
 * TODO(owner): this is the product decision, a few lines. The default spreads the
 * work evenly. Alternatives worth considering:
 *   - keep the last 2-3 days free for revision: spread over `daysLeft - 2`
 *   - never ask for fewer than ~10 a day, so a far-off exam is not "2 a day"
 *   - cap it, and say "you're behind" instead of showing 400 a day
 */
export function chooseDailyTarget(remaining: number, daysLeft: number): number {
  return Math.ceil(remaining / Math.max(1, daysLeft));
}

/**
 * The plan for the nearest exam that has not passed, or null when there is none
 * (no dates set, or every date is behind us), in which case Home shows nothing.
 *
 * Decision: only the nearest exam is planned. A student whose first exam is
 * done sees "done" for it and moves on to the next one once its day passes.
 */
export function planExam(today: string, groups: ExamGroup[]): ExamPlan | null {
  const nearest = groups
    .map((g) => ({ g, daysLeft: daysUntil(g.date, today) }))
    .filter((x) => x.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)[0];
  if (!nearest) return null;

  const { g, daysLeft } = nearest;
  const remaining = Math.max(0, Math.round(g.remainingQuestions));
  const base = { examDate: g.date, label: g.label, daysLeft, remaining };

  if (daysLeft === 0) return { ...base, perDay: 0, status: 'today' };
  // Nothing published is not "you've covered everything": say the content is not there yet.
  if (g.publishedQuestions <= 0) return { ...base, perDay: 0, status: 'empty' };
  if (remaining === 0) return { ...base, perDay: 0, status: 'done' };
  return { ...base, perDay: chooseDailyTarget(remaining, daysLeft), status: 'upcoming' };
}
