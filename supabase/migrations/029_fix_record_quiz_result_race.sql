-- =============================================================
-- MediZee · 029_fix_record_quiz_result_race.sql
-- =============================================================
-- Security review finding (race-condition, MEDIUM): the daily XP
-- cap was enforced by reading daily_streaks.xp_correct_count in the
-- app layer (getTodayXpCorrectCount), computing the capped/bonus XP
-- in lib/xp.ts's calculateSessionXp(), and only THEN calling
-- record_quiz_result() with the precomputed numbers. Those are two
-- separate, non-atomic steps — two concurrent submissions from the
-- same student (double-submit, two tabs) can both read the same
-- "already counted today" snapshot and both get the full remaining
-- cap applied, letting the 150/day cap be exceeded and awarding
-- more XP than intended.
--
-- Fix: move the cap + accuracy-bonus calculation into
-- record_quiz_result() itself, and make it read daily_streaks under
-- a row lock (SELECT ... FOR UPDATE) so concurrent calls for the
-- same (student_id, streak_date) serialize on that lock instead of
-- racing. The INSERT ... ON CONFLICT DO NOTHING immediately before
-- it does NOT itself lock the row when it hits the conflict branch
-- (documented Postgres behavior) — it only guarantees the row
-- exists so the following SELECT ... FOR UPDATE has something to
-- lock, whichever transaction gets there first.
--
-- The formula mirrors lib/xp.ts's calculateSessionXp() exactly
-- (XP_PER_CORRECT_ANSWER = 10, ACCURACY_BONUS_THRESHOLD = 90,
-- ACCURACY_BONUS_MULTIPLIER = 1.5, DAILY_XP_CORRECT_CAP = 150) —
-- keep both in sync if the formula ever changes. calculateSessionXp
-- itself is being removed from the app's write path (see the
-- accompanying app code change); lib/xp.ts keeps only the named
-- constants, now documented as mirroring this function.
--
-- Signature changes (uuid,int,int,int,int,date) ->
-- (uuid,int,int,numeric,int,date) — old callers passed a
-- precomputed p_xp_delta/p_eligible_correct_count; new callers pass
-- the raw session inputs and get the awarded xp_earned/
-- eligible_correct_count back instead. Old overload is dropped so
-- there's no dangling, unused SECURITY DEFINER surface.
-- =============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.record_quiz_result(uuid, integer, integer, integer, integer, date);

CREATE FUNCTION public.record_quiz_result(
  p_student_id UUID,
  p_correct_count INTEGER,
  p_total_count INTEGER,
  p_accuracy NUMERIC,
  p_violations_count INTEGER,
  p_streak_date DATE
) RETURNS TABLE (xp_earned INTEGER, eligible_correct_count INTEGER) AS $$
DECLARE
  v_prior_xp_correct INTEGER;
  v_eligible INTEGER;
  v_xp INTEGER;
BEGIN
  INSERT INTO daily_streaks (student_id, streak_date, challenges_completed, xp_correct_count)
  VALUES (p_student_id, p_streak_date, 0, 0)
  ON CONFLICT (student_id, streak_date) DO NOTHING;

  SELECT ds.xp_correct_count INTO v_prior_xp_correct
  FROM daily_streaks ds
  WHERE ds.student_id = p_student_id AND ds.streak_date = p_streak_date
  FOR UPDATE;

  IF p_violations_count > 0 THEN
    v_eligible := 0;
  ELSE
    v_eligible := GREATEST(0, LEAST(p_correct_count, 150 - v_prior_xp_correct));
  END IF;

  v_xp := v_eligible * 10;
  IF p_accuracy >= 90 THEN
    v_xp := ROUND(v_xp * 1.5)::INTEGER;
  END IF;

  UPDATE daily_streaks ds
  SET
    challenges_completed = ds.challenges_completed + 1,
    xp_correct_count = ds.xp_correct_count + v_eligible
  WHERE ds.student_id = p_student_id AND ds.streak_date = p_streak_date;

  UPDATE profiles
  SET
    total_xp = total_xp + v_xp,
    total_correct_answers = total_correct_answers + p_correct_count,
    total_questions_answered = total_questions_answered + p_total_count,
    last_active_at = NOW()
  WHERE id = p_student_id;

  RETURN QUERY SELECT v_xp, v_eligible;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Same lockdown as 027_lock_record_quiz_result.sql — this function
-- is only ever called via the service-role client from trusted
-- server routes, never by the user-scoped client.
REVOKE EXECUTE ON FUNCTION public.record_quiz_result(uuid, integer, integer, numeric, integer, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_quiz_result(uuid, integer, integer, numeric, integer, date)
  TO service_role;

COMMIT;
