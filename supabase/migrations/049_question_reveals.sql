-- =============================================================
-- MedZ · 049_question_reveals.sql
-- =============================================================
-- Server-side answer checking (2026-11-10).
--
-- Before: every quiz payload carried each question's correct answer,
-- explanation and rationales, so anyone with an account could read the whole
-- bank out of the network tab, and `POST /bookmarks` + `GET /bookmarks`
-- returned the answer for ANY question id.
--
-- Now the answer endpoints (chapter + custom exam) reveal a question's answer
-- only after the student has answered it, and record that here. Every other
-- place that shows an answer (bookmarks, notes, results, resuming a quiz)
-- reads through this table: a student sees the answer to a question only if
-- a row says it has already been shown to them.
--
-- ADDITIVE: old code ignores the table. Apply this BEFORE deploying the app
-- code, then re-run section 2 (the backfill) once after the deploy to cover
-- answers given in between.
-- =============================================================

BEGIN;

-- ---------- 1. Which answers each student has been shown ----------
CREATE TABLE IF NOT EXISTS public.question_reveals (
  student_id  UUID   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  revealed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The primary key also serves "all reveals of one student" (leading column).
  PRIMARY KEY (student_id, question_id)
);
-- Server-only: RLS on, no policies, no grants to the API roles.
ALTER TABLE public.question_reveals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_reveals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.question_reveals TO service_role;

-- ---------- 2. Backfill: every answer a student has already given ----------
-- Only ANSWERED history counts. Bookmarks and notes are deliberately not a
-- source: a bookmark can be created for any question id, so treating it as
-- proof of having seen the answer would hand the whole bank to anyone who
-- had already enumerated it. Safe to re-run.
--
-- 2a. Finished attempts: quiz_sessions.answers is {"<question id>": "<choice id>"}.
INSERT INTO public.question_reveals (student_id, question_id, revealed_at)
SELECT qs.student_id, q.id, MIN(qs.completed_at)
FROM public.quiz_sessions qs
CROSS JOIN LATERAL jsonb_each_text(qs.answers) a(qid, choice)
JOIN public.questions q
  ON a.qid ~ '^[0-9]+$' AND q.id = a.qid::BIGINT
WHERE jsonb_typeof(qs.answers) = 'object'
GROUP BY qs.student_id, q.id
ON CONFLICT DO NOTHING;

-- 2b. Unfinished chapter attempts (same answers shape).
INSERT INTO public.question_reveals (student_id, question_id, revealed_at)
SELECT p.student_id, q.id, MIN(p.updated_at)
FROM public.chapter_quiz_progress p
CROSS JOIN LATERAL jsonb_each_text(p.answers) a(qid, choice)
JOIN public.questions q
  ON a.qid ~ '^[0-9]+$' AND q.id = a.qid::BIGINT
WHERE jsonb_typeof(p.answers) = 'object'
GROUP BY p.student_id, q.id
ON CONFLICT DO NOTHING;

-- 2c. The unfinished custom exam (same answers shape).
INSERT INTO public.question_reveals (student_id, question_id, revealed_at)
SELECT p.student_id, q.id, MIN(p.updated_at)
FROM public.custom_exam_progress p
CROSS JOIN LATERAL jsonb_each_text(p.answers) a(qid, choice)
JOIN public.questions q
  ON a.qid ~ '^[0-9]+$' AND q.id = a.qid::BIGINT
WHERE jsonb_typeof(p.answers) = 'object'
GROUP BY p.student_id, q.id
ON CONFLICT DO NOTHING;

-- ---------- 3. Sanity checks (the migration aborts if any fails) ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'question_reveals' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION '049: question_reveals is missing or has RLS disabled';
  END IF;

  IF has_table_privilege('anon', 'public.question_reveals', 'SELECT')
     OR has_table_privilege('authenticated', 'public.question_reveals', 'SELECT') THEN
    RAISE EXCEPTION '049: question_reveals must not be readable by the API roles';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.question_reveals', 'INSERT') THEN
    RAISE EXCEPTION '049: service_role cannot write question_reveals';
  END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------
-- ROLLBACK (manual; not run by the migration). Redeploy the old code first,
-- or every answer in the app goes blank.
--   BEGIN;
--   DROP TABLE public.question_reveals;
--   COMMIT;
-- ---------------------------------------------------------------
