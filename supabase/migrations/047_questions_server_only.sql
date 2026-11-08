-- =============================================================
-- MedZ · 047_questions_server_only.sql
-- =============================================================
-- Anti-scraping, 2026-11-08. After 038 the question bank was no longer
-- readable without an account, but signup is open: anyone could register
-- and page the whole bank (questions + correct_answer + explanation)
-- straight out of PostgREST with the public anon key and their own JWT:
--
--     GET /rest/v1/questions?select=*        -> every published question
--
-- That path is never used by the app (every student read goes through an
-- /api/student/* route handler), so it had no rate limit and left no trace.
--
-- What changes:
--   * questions_read_published is dropped. Students can no longer SELECT
--     `questions` at all through the API. Admins keep full access through
--     questions_admin_write (FOR ALL, so it covers SELECT too).
--   * The student routes now read questions with the service role, after
--     authenticating the user, with an explicit status='published' filter,
--     and the routes that return full question content are rate-limited
--     per user per day (lib/rate-limit.ts contentLimiter).
--
-- ORDER: deploy the app code FIRST (it works under both the old and the
-- new policy), THEN apply this migration. Applying it before the deploy
-- empties every student quiz.
--
-- update_chapter_counts / update_question_flag_count read `questions` but
-- are SECURITY DEFINER, so they are unaffected.
-- =============================================================

BEGIN;

DROP POLICY IF EXISTS "questions_read_published" ON public.questions;

COMMIT;

-- =============================================================
-- ROLLBACK (manual; not run by the migration)
-- =============================================================
-- BEGIN;
-- CREATE POLICY "questions_read_published" ON public.questions
--   FOR SELECT TO authenticated
--   USING (
--     status = 'published'
--     OR EXISTS (
--       SELECT 1 FROM public.profiles p
--       WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
--     )
--   );
-- COMMIT;
