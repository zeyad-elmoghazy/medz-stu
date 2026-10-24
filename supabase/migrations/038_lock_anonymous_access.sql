-- =============================================================
-- MedZ · 038_lock_anonymous_access.sql
-- =============================================================
-- Security audit 2026-10-23. The anon key ships in every page's JS
-- bundle, so "anon" means "anyone on the internet". Until now anon held
-- full table privileges on all of `public` and RLS was the only thing
-- standing between the internet and the data. RLS held up (every table
-- has it, privilege escalation is blocked by the 031 triggers), but two
-- things were still wrong:
--
--   1. Anyone could dump the whole question bank WITHOUT AN ACCOUNT:
--        GET /rest/v1/questions?select=*      -> 5,447 published
--        questions with correct_answer + explanation, plus
--        reference_pages / reference_books / subjects / badges.
--      The `*_public_read` / `questions_read_published` policies were
--      TO public, which includes anon.
--
--   2. anon still held INSERT/UPDATE/DELETE/TRUNCATE on every table —
--      harmless only as long as no policy ever matches, and TRUNCATE is
--      not subject to RLS at all.
--
-- What changes:
--   * anon loses every privilege on every table/sequence in `public`,
--     EXCEPT column-limited SELECT on `modules` and `chapters`. The
--     public landing page (app/page.tsx) reads those two tables from the
--     browser to show real module names and published counts; it needs
--     nothing else. Internal columns (chapters.flagged_count,
--     chapters.question_count, modules.book_id, subject ids) stay
--     hidden. The landing's question total now comes from
--     chapters.published_count (identical: 5447 = 5447 on prod) so the
--     page no longer touches `questions` at all.
--   * Future tables created by postgres no longer auto-grant to anon.
--   * The read policies on questions / subjects / module_subjects /
--     reference_books / reference_pages / badges become TO authenticated,
--     so even a future accidental re-grant to anon would not expose them.
--   * authenticated loses TRUNCATE / TRIGGER / REFERENCES (never used by
--     the app; TRUNCATE bypasses RLS).
--
-- Not changed: what a SIGNED-IN student can read. Signup is open, so a
-- determined scraper can still register and page through questions;
-- closing that needs a product decision (invite-only / paid access, or
-- serving questions only through rate-limited API routes). See the audit
-- report.
--
-- Every statement is a privilege/policy change — no data is touched.
-- A rollback script is at the bottom.
-- =============================================================

BEGIN;

-- ---------- 1. anon: nothing, except the landing page's two reads -----
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

GRANT SELECT (code, name, year_num, year_label, is_active)
  ON public.modules TO anon;
GRANT SELECT (id, module_code, slug, name, ordinal, published_count)
  ON public.chapters TO anon;

-- New tables must not silently re-open anon access.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;

-- ---------- 2. authenticated: drop RLS-bypassing / unused privileges --
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;

-- ---------- 3. read policies: signed-in users only --------------------
-- (modules_public_read / chapters_public_read stay TO public: the
--  landing page needs them, and the column grants above limit them.)
ALTER POLICY "questions_read_published"      ON public.questions         TO authenticated;
ALTER POLICY "subjects_public_read"          ON public.subjects          TO authenticated;
ALTER POLICY "module_subjects_public_read"   ON public.module_subjects   TO authenticated;
ALTER POLICY "reference_books_public_read"   ON public.reference_books   TO authenticated;
ALTER POLICY "reference_pages_public_read"   ON public.reference_pages   TO authenticated;
ALTER POLICY "badges_public_read"            ON public.badges            TO authenticated;

COMMIT;

-- =============================================================
-- ROLLBACK (manual; not run by the migration)
-- =============================================================
-- BEGIN;
-- GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
-- -- 012 deliberately keeps these two matviews away from the API roles:
-- REVOKE ALL ON public.student_analytics, public.student_subject_stats
--   FROM PUBLIC, anon, authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--   GRANT ALL ON TABLES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--   GRANT ALL ON SEQUENCES TO anon;
-- GRANT TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public TO authenticated;
-- ALTER POLICY "questions_read_published"    ON public.questions       TO public;
-- ALTER POLICY "subjects_public_read"        ON public.subjects        TO public;
-- ALTER POLICY "module_subjects_public_read" ON public.module_subjects TO public;
-- ALTER POLICY "reference_books_public_read" ON public.reference_books TO public;
-- ALTER POLICY "reference_pages_public_read" ON public.reference_pages TO public;
-- ALTER POLICY "badges_public_read"          ON public.badges          TO public;
-- COMMIT;
