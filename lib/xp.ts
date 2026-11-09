// XP formula for the global leaderboard (Part 2.3 "Leaderboard —
// New" in docs/MedZ_Complete_Master_Document_v2.md: "a composite
// XP score ... not raw correct-answer count or accuracy alone").
//
// The formula lives in Postgres (supabase/migrations/048_xp_per_answer.sql,
// called through lib/server/xp.ts):
//   * 10 XP the FIRST time a student answers a question correctly, ever
//     (xp_awards primary key). Credited live, as each answer is saved.
//   * +50% of the XP newly earned in an attempt when that attempt's
//     accuracy is >= 90%, credited at submit.
//   * No daily cap (the old 150-correct-answers-per-day cap from 029 is
//     gone; "first correct only" is what stops leaderboard farming).
//
// These constants document the SQL's values; keep them in sync by hand.
export const XP_PER_CORRECT_ANSWER = 10;
export const ACCURACY_BONUS_THRESHOLD = 90; // attempt accuracy %, 0-100 scale (matches quiz_sessions.accuracy)
export const ACCURACY_BONUS_MULTIPLIER = 1.5;
