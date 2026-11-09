-- =============================================================
-- MedZ · 048_xp_per_answer.sql
-- =============================================================
-- XP on every answer, no daily cap (2026-11-09).
--
-- Before: XP was credited only when a quiz/exam was SUBMITTED, by
-- record_quiz_result() (029): 10 XP per correct answer, x1.5 when the
-- session's accuracy is >= 90%, and only the first 150 correct answers
-- per day counted.
--
-- Now:
--   * Each question earns 10 XP the FIRST time a student answers it
--     correctly, ever. That rule (not a daily cap) is what stops someone
--     farming the leaderboard by retaking one easy chapter. It is
--     enforced by the primary key of the new `xp_awards` table.
--   * XP is credited as each answer is saved (award_answers_xp, called
--     by the progress PUT routes), so it shows live in the quiz and
--     isn't lost when a student leaves early.
--   * At submit, finish_attempt_xp() credits any answer whose live save
--     was lost, and adds the 90%-accuracy bonus: +50% of the XP newly
--     earned IN THIS ATTEMPT (rows awarded since the attempt started).
--   * record_quiz_stats() keeps the streak and answer counters, without
--     any XP.
--
-- ADDITIVE: record_quiz_result() is left untouched so the code that is
-- running when this is applied keeps working. Apply this BEFORE deploying
-- the app code, then re-run the backfill INSERT once after the deploy.
-- =============================================================

BEGIN;

-- ---------- 1. Which questions have already paid out, per student ----------
CREATE TABLE IF NOT EXISTS public.xp_awards (
  student_id  UUID   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  awarded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Set by the ONE finished attempt that counts this award (its XP total
  -- and accuracy bonus). Row locks make concurrent submits of the same
  -- attempt split the rows instead of both counting them.
  claimed     BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (student_id, question_id)
);
-- Server-only: RLS on, no policies, no grants to the API roles.
ALTER TABLE public.xp_awards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xp_awards FROM PUBLIC, anon, authenticated;

-- The accuracy bonus counts only XP awarded since the attempt started:
-- chapter_quiz_progress.started_at (032) / custom_exam_progress.started_at (035).

-- ---------- 2. Backfill: everything already paid for under the old system ----------
-- quiz_sessions.answers is {"<question id>": "<choice id>"}. Safe to re-run.
INSERT INTO public.xp_awards (student_id, question_id, awarded_at, claimed)
SELECT qs.student_id, q.id, MIN(qs.completed_at), TRUE
FROM public.quiz_sessions qs
CROSS JOIN LATERAL jsonb_each_text(qs.answers) a(qid, choice)
JOIN public.questions q
  ON a.qid ~ '^[0-9]+$' AND q.id = a.qid::BIGINT AND q.correct_answer = a.choice
WHERE jsonb_typeof(qs.answers) = 'object'
GROUP BY qs.student_id, q.id
ON CONFLICT DO NOTHING;

-- ---------- 3. Credit answers (live, per save) ----------
CREATE OR REPLACE FUNCTION public.award_answers_xp(
  p_student_id   UUID,
  p_question_ids BIGINT[],
  p_choices      TEXT[]
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new INTEGER;
BEGIN
  WITH ins AS (
    INSERT INTO xp_awards (student_id, question_id)
    SELECT p_student_id, q.id
    FROM unnest(p_question_ids, p_choices) AS a(qid, choice)
    JOIN questions q
      ON q.id = a.qid AND q.status = 'published' AND q.correct_answer = a.choice
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_new FROM ins;

  IF v_new > 0 THEN
    UPDATE profiles
    SET total_xp = total_xp + v_new * 10, last_active_at = NOW()
    WHERE id = p_student_id;
  END IF;

  RETURN v_new * 10;
END;
$$;

-- ---------- 4. Finish an attempt: catch-up + accuracy bonus ----------
-- Returns the attempt's XP: 10 per question first answered correctly
-- since p_since and not yet counted by another finished attempt, plus 50%
-- of that when p_accuracy >= 90.
CREATE OR REPLACE FUNCTION public.finish_attempt_xp(
  p_student_id   UUID,
  p_question_ids BIGINT[],
  p_choices      TEXT[],
  p_since        TIMESTAMPTZ,
  p_accuracy     NUMERIC
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base  INTEGER;
  v_bonus INTEGER := 0;
BEGIN
  PERFORM award_answers_xp(p_student_id, p_question_ids, p_choices);

  WITH claimed AS (
    UPDATE xp_awards x
    SET claimed = TRUE
    WHERE x.student_id = p_student_id
      AND x.question_id = ANY (p_question_ids)
      AND x.awarded_at >= p_since
      AND NOT x.claimed
    RETURNING 1
  )
  SELECT COUNT(*) * 10 INTO v_base FROM claimed;

  IF p_accuracy >= 90 THEN
    v_bonus := ROUND(v_base * 0.5)::INTEGER;
    IF v_bonus > 0 THEN
      UPDATE profiles SET total_xp = total_xp + v_bonus WHERE id = p_student_id;
    END IF;
  END IF;

  RETURN v_base + v_bonus;
END;
$$;

-- ---------- 5. Streak + counters, no XP (replaces record_quiz_result's other half) ----------
CREATE OR REPLACE FUNCTION public.record_quiz_stats(
  p_student_id    UUID,
  p_correct_count INTEGER,
  p_total_count   INTEGER,
  p_streak_date   DATE
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO daily_streaks (student_id, streak_date, challenges_completed, xp_correct_count)
  VALUES (p_student_id, p_streak_date, 1, 0)
  ON CONFLICT (student_id, streak_date)
  DO UPDATE SET challenges_completed = daily_streaks.challenges_completed + 1;

  UPDATE profiles
  SET
    total_correct_answers = total_correct_answers + p_correct_count,
    total_questions_answered = total_questions_answered + p_total_count,
    last_active_at = NOW()
  WHERE id = p_student_id;
END;
$$;

-- Same lockdown as 027/029/034: only trusted server routes (service role).
REVOKE EXECUTE ON FUNCTION public.award_answers_xp(uuid, bigint[], text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finish_attempt_xp(uuid, bigint[], text[], timestamptz, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_quiz_stats(uuid, integer, integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_answers_xp(uuid, bigint[], text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_attempt_xp(uuid, bigint[], text[], timestamptz, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_quiz_stats(uuid, integer, integer, date) TO service_role;
GRANT ALL ON public.xp_awards TO service_role;

COMMIT;

-- =============================================================
-- ROLLBACK (manual; not run by the migration). Redeploy the old code first.
-- =============================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.finish_attempt_xp(uuid, bigint[], text[], timestamptz, numeric);
-- DROP FUNCTION IF EXISTS public.award_answers_xp(uuid, bigint[], text[]);
-- DROP FUNCTION IF EXISTS public.record_quiz_stats(uuid, integer, integer, date);
-- DROP TABLE IF EXISTS public.xp_awards;
-- COMMIT;
