// XP formula for the global leaderboard (Part 2.3 "Leaderboard —
// New" in docs/MedZ_Complete_Master_Document_v2.md: "a composite
// XP score ... not raw correct-answer count or accuracy alone").
//
// The formula itself now lives in the record_quiz_result() Postgres
// function (supabase/migrations/029_fix_record_quiz_result_race.sql)
// rather than here — computing the daily cap in the app layer, as a
// separate read (getTodayXpCorrectCount) then write, was a
// read-then-write race: two concurrent submissions from the same
// student could both read the same "already counted today" snapshot
// and both get the full remaining cap applied, letting the daily cap
// be exceeded. record_quiz_result() now does the read (under a row
// lock) and the write atomically in one call.
//
// These constants are kept here as the documented, named source of
// truth for the formula's tunable knobs — record_quiz_result()'s SQL
// body inlines the same values and must be kept in sync if this ever
// changes.
export const XP_PER_CORRECT_ANSWER = 10;
export const ACCURACY_BONUS_THRESHOLD = 90; // session accuracy %, 0-100 scale (matches quiz_sessions.accuracy)
export const ACCURACY_BONUS_MULTIPLIER = 1.5;
export const DAILY_XP_CORRECT_CAP = 150; // correct answers/day that earn XP
