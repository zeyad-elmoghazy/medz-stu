-- =============================================================
-- MedZ · 025_leaderboard_xp.sql
-- =============================================================
-- Global XP leaderboard (Part 2.3 "Leaderboard — New" in
-- docs/MedZ_Complete_Master_Document_v2.md). profiles.total_xp
-- has existed since 015_b2c_pivot_rebuild.sql but nothing ever
-- wrote to it. This migration:
--   - adds running counters to `profiles` so leaderboard reads
--     never need to scan `quiz_sessions`
--   - adds a per-day XP-eligible-correct-answer counter to
--     `daily_streaks` so the anti-grinding daily cap can be
--     enforced without re-aggregating history on every submit
--   - adds one atomic RPC (`record_quiz_result`) that the
--     quiz-submit route calls instead of the old select-then-
--     update `bumpDailyStreak` helper — folds the streak bump
--     and the XP write into a single round trip, and avoids the
--     read-then-write race the old code's own comment flagged
--   - adds two narrow read-only RPCs for the leaderboard page,
--     SECURITY DEFINER so they can read other students' safe
--     columns (id/username/total_xp/...) without opening a
--     broad cross-student RLS policy on `profiles` (which has
--     none today, deliberately, since it also holds email)
--   - backfills existing students' XP from their quiz history so
--     launch day doesn't show everyone at 0
-- =============================================================

BEGIN;

-- =============================================================
-- 1. Running counters on profiles
-- =============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS total_correct_answers INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_questions_answered INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_role_xp
  ON profiles(role, total_xp DESC);

-- =============================================================
-- 2. Daily XP-eligible-correct-answer counter (cap tracking)
-- =============================================================
ALTER TABLE daily_streaks
  ADD COLUMN IF NOT EXISTS xp_correct_count INTEGER NOT NULL DEFAULT 0;

-- =============================================================
-- 3. record_quiz_result() — atomic write path for quiz submit
-- =============================================================
-- XP itself is computed in the app layer (lib/xp.ts) — this
-- function just persists the result atomically. p_correct_count
-- is the FULL correct count this session (personal stats always
-- reflect real performance); p_eligible_correct_count is the
-- post-daily-cap count (what actually earned XP), tracked
-- separately so `profiles.total_xp` and `daily_streaks.
-- xp_correct_count` never disagree about how much of today's
-- cap has been used.
CREATE OR REPLACE FUNCTION record_quiz_result(
  p_student_id UUID,
  p_xp_delta INTEGER,
  p_correct_count INTEGER,
  p_eligible_correct_count INTEGER,
  p_total_count INTEGER,
  p_streak_date DATE
) RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET
    total_xp = total_xp + p_xp_delta,
    total_correct_answers = total_correct_answers + p_correct_count,
    total_questions_answered = total_questions_answered + p_total_count,
    last_active_at = NOW()
  WHERE id = p_student_id;

  INSERT INTO daily_streaks (student_id, streak_date, challenges_completed, xp_correct_count)
  VALUES (p_student_id, p_streak_date, 1, p_eligible_correct_count)
  ON CONFLICT (student_id, streak_date)
  DO UPDATE SET
    challenges_completed = daily_streaks.challenges_completed + 1,
    xp_correct_count = daily_streaks.xp_correct_count + EXCLUDED.xp_correct_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION record_quiz_result(UUID, INTEGER, INTEGER, INTEGER, INTEGER, DATE) TO authenticated;

-- =============================================================
-- 4. get_leaderboard_top() — top N by XP, narrow column set
-- =============================================================
CREATE OR REPLACE FUNCTION get_leaderboard_top(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  id UUID,
  username TEXT,
  full_name TEXT,
  total_xp INTEGER,
  total_correct_answers INTEGER,
  total_questions_answered INTEGER,
  last_active_at TIMESTAMPTZ,
  highest_badge TEXT
) AS $$
  SELECT
    (RANK() OVER (ORDER BY p.total_xp DESC, p.total_correct_answers DESC, p.id))::INTEGER AS rank,
    p.id,
    p.username,
    p.full_name,
    p.total_xp,
    p.total_correct_answers,
    p.total_questions_answered,
    p.last_active_at,
    (
      SELECT b.badge_type FROM badges b
      WHERE b.student_id = p.id
      ORDER BY
        CASE b.badge_type WHEN 'streak_30' THEN 3 WHEN 'streak_14' THEN 2 WHEN 'streak_7' THEN 1 ELSE 0 END DESC
      LIMIT 1
    ) AS highest_badge
  FROM profiles p
  WHERE p.role = 'student'
  ORDER BY p.total_xp DESC, p.total_correct_answers DESC, p.id
  LIMIT p_limit;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_leaderboard_top(INTEGER) TO authenticated;

-- =============================================================
-- 5. get_student_rank() — one student's rank + stats, for when
--    they're outside the top N
-- =============================================================
CREATE OR REPLACE FUNCTION get_student_rank(p_student_id UUID)
RETURNS TABLE (
  rank INTEGER,
  id UUID,
  username TEXT,
  full_name TEXT,
  total_xp INTEGER,
  total_correct_answers INTEGER,
  total_questions_answered INTEGER,
  last_active_at TIMESTAMPTZ,
  highest_badge TEXT
) AS $$
  SELECT
    (
      (SELECT COUNT(*) FROM profiles o
       WHERE o.role = 'student' AND o.total_xp > p.total_xp)
      + 1
    )::INTEGER AS rank,
    p.id,
    p.username,
    p.full_name,
    p.total_xp,
    p.total_correct_answers,
    p.total_questions_answered,
    p.last_active_at,
    (
      SELECT b.badge_type FROM badges b
      WHERE b.student_id = p.id
      ORDER BY
        CASE b.badge_type WHEN 'streak_30' THEN 3 WHEN 'streak_14' THEN 2 WHEN 'streak_7' THEN 1 ELSE 0 END DESC
      LIMIT 1
    ) AS highest_badge
  FROM profiles p
  WHERE p.id = p_student_id AND p.role = 'student';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_student_rank(UUID) TO authenticated;

-- =============================================================
-- 6. Backfill existing students' XP from quiz history
-- =============================================================
-- Flat-rate only (XP_PER_CORRECT_ANSWER = 10) — the accuracy
-- bonus and daily cap aren't reconstructable per historical day
-- without re-deriving per-session-per-day ordering, and this is
-- a one-time launch seed, not an ongoing shortcut (new
-- submissions go through record_quiz_result() above, which
-- applies the full formula). Sessions with violations_count > 0
-- are excluded, matching the "flagged sessions earn zero XP"
-- rule applied going forward. The total_xp = 0 AND
-- total_correct_answers = 0 guard makes this idempotent if the
-- migration is ever re-applied.
WITH backfill AS (
  SELECT
    student_id,
    SUM(score) AS total_correct,
    SUM(total_questions) AS total_answered,
    MAX(completed_at) AS last_completed
  FROM quiz_sessions
  WHERE violations_count = 0
  GROUP BY student_id
)
UPDATE profiles p
SET
  total_correct_answers = b.total_correct,
  total_questions_answered = b.total_answered,
  total_xp = b.total_correct * 10,
  last_active_at = b.last_completed
FROM backfill b
WHERE p.id = b.student_id
  AND p.total_xp = 0
  AND p.total_correct_answers = 0;

COMMIT;
