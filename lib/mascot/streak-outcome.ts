import { milestoneFor } from '@/lib/mascot/milestones';
import type { StreakState } from '@/lib/streak-state';

/**
 * What a quiz submission did to the student's streak, as the results page needs
 * it. Computed from the streak state before and after the submission, so it can
 * never disagree with what `get_student_streak` will say afterwards.
 */
export type StreakOutcome = {
  /** Streak length before this submission. */
  before: number;
  /** Streak length after it. */
  after: number;
  /** This was the first quiz of the day: the streak just grew (or started). */
  extended: boolean;
  /** The 100-question rescue was completed by this submission. */
  rescued: boolean;
  /** Set when the new length is exactly a milestone and something worth celebrating happened. */
  milestoneDays: number | null;
  /** Seven flags, oldest first, ending today (for the week row). */
  last7: boolean[];
  /** The server's calendar day. */
  today: string;
};

export function streakOutcome(before: StreakState, after: StreakState, rescued: boolean): StreakOutcome {
  const extended = !before.doneToday && after.doneToday;
  const celebrates = extended || rescued;
  return {
    before: before.currentStreak,
    after: after.currentStreak,
    extended,
    rescued,
    milestoneDays: celebrates ? milestoneFor(after.currentStreak)?.days ?? null : null,
    last7: after.last7,
    today: after.today,
  };
}

/** Whether the results page should open with the full-screen streak celebration. */
export function shouldCelebrate(outcome: StreakOutcome | null | undefined): boolean {
  return !!outcome && (outcome.extended || outcome.rescued);
}
