import { addDays, daysBetween } from '@/lib/streak-date';

/**
 * Pure streak maths for the mascot. It mirrors the rule in the SQL function
 * `get_student_streak`: a day counts only if `challenges_completed > 0`, and
 * the streak is counted back from today when today is done, otherwise from
 * yesterday (so a student who hasn't practised yet today keeps their streak
 * until the day ends).
 *
 * On top of that it detects the one situation the mascot can rescue: the
 * student missed exactly yesterday after a streak worth saving.
 */

/** A streak shorter than this isn't worth a "rescue" (a 1-day streak is just a restart). */
export const RESCUE_MIN_STREAK = 2;
/** Questions to answer today to win back the missed day. */
export const RESCUE_QUESTION_TARGET = 100;

export type StreakState = {
  /** The server's calendar day this state was computed for ('YYYY-MM-DD'). */
  today: string;
  /** Same number `get_student_streak` returns. */
  currentStreak: number;
  doneToday: boolean;
  /** Seven flags, oldest first, the last one being today. */
  last7: boolean[];
  /** The student has completed at least one quiz, ever. */
  everActive: boolean;
  /** Whole days since the latest active day (0 = today); null if never active. */
  daysSinceActive: number | null;
  /**
   * Length of the streak that ended just before a gap, when yesterday was
   * missed; 0 when there is no gap (or nothing before it).
   */
  previousStreak: number;
  /** Missed exactly yesterday, after a previous streak >= RESCUE_MIN_STREAK. */
  rescueEligible: boolean;
};

function runEndingAt(active: Set<string>, end: string): number {
  let n = 0;
  let d = end;
  while (active.has(d)) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

export function computeStreakState(activeDates: string[], today: string): StreakState {
  const active = new Set(activeDates);
  const yesterday = addDays(today, -1);
  const doneToday = active.has(today);

  const currentStreak = runEndingAt(active, doneToday ? today : yesterday);

  const last7: boolean[] = [];
  for (let i = 6; i >= 0; i -= 1) last7.push(active.has(addDays(today, -i)));

  // Latest active day on or before today (ignore any stray future dates).
  let latest: string | null = null;
  for (const d of active) {
    if (d <= today && (latest === null || d > latest)) latest = d;
  }

  let previousStreak = 0;
  let rescueEligible = false;
  if (!active.has(yesterday)) {
    // Most recent active day before the gap (which includes yesterday).
    let before: string | null = null;
    for (const d of active) {
      if (d < yesterday && (before === null || d > before)) before = d;
    }
    if (before !== null) {
      previousStreak = runEndingAt(active, before);
      rescueEligible = before === addDays(today, -2) && previousStreak >= RESCUE_MIN_STREAK;
    }
  }

  return {
    today,
    currentStreak,
    doneToday,
    last7,
    everActive: latest !== null,
    daysSinceActive: latest === null ? null : daysBetween(latest, today),
    previousStreak,
    rescueEligible,
  };
}
