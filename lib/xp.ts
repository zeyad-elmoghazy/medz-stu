// XP formula for the global leaderboard (Part 2.3 "Leaderboard —
// New" in docs/MedZ_Complete_Master_Document_v2.md: "a composite
// XP score ... not raw correct-answer count or accuracy alone").
//
// Named constants so the formula can be retuned without hunting
// through the submit route:
//   - flat points per correct answer rewards volume
//   - the accuracy bonus rewards care, not just speed-clicking
//   - the daily cap stops a marathon-grinding session at low
//     accuracy from ever out-earning a focused one
export const XP_PER_CORRECT_ANSWER = 10;
export const ACCURACY_BONUS_THRESHOLD = 90; // session accuracy %, 0-100 scale (matches quiz_sessions.accuracy)
export const ACCURACY_BONUS_MULTIPLIER = 1.5;
export const DAILY_XP_CORRECT_CAP = 150; // correct answers/day that earn XP

export type XpCalcInput = {
  correctCount: number;
  accuracy: number; // 0-100
  violationsCount: number;
  alreadyCountedToday: number; // daily_streaks.xp_correct_count so far today
};

export type XpCalcResult = {
  xpEarned: number;
  // How many of this session's correct answers counted toward
  // today's cap — separate from `correctCount` because personal
  // stats (profiles.total_correct_answers) should reflect real
  // performance even once the daily XP cap is hit.
  eligibleCorrectCount: number;
};

/**
 * Pure function — no DB access. The caller passes in
 * `alreadyCountedToday` (read from `daily_streaks.xp_correct_count`
 * for today's date) and persists the result via the
 * `record_quiz_result` RPC.
 */
export function calculateSessionXp(input: XpCalcInput): XpCalcResult {
  // Anti-cheat violations forfeit XP entirely — the session still
  // counts for the student's own personal stats, just not toward
  // the leaderboard.
  if (input.violationsCount > 0) {
    return { xpEarned: 0, eligibleCorrectCount: 0 };
  }

  const remainingCap = Math.max(0, DAILY_XP_CORRECT_CAP - input.alreadyCountedToday);
  const eligibleCorrectCount = Math.max(0, Math.min(input.correctCount, remainingCap));

  let xp = eligibleCorrectCount * XP_PER_CORRECT_ANSWER;
  if (input.accuracy >= ACCURACY_BONUS_THRESHOLD) {
    xp *= ACCURACY_BONUS_MULTIPLIER;
  }

  return { xpEarned: Math.round(xp), eligibleCorrectCount };
}
