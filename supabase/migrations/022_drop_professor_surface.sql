-- =============================================================
-- MediZee · 022_drop_professor_surface.sql
-- =============================================================
-- The B2C pivot (015_b2c_pivot_rebuild.sql) already removed the
-- 'professor' role from profiles.role (CHECK constraint now only
-- allows 'student'/'admin') and dropped the professor write
-- policies on modules/chapters/questions. This migration drops what
-- was left over: the RPC and RLS policies that backed the
-- professor-only app surface (app/(professor)/*, api/professor/*),
-- confirmed via a full read-only audit to have zero real callers —
-- professor_id is NULL on every row of every table that has it
-- (jobs, modules, questions, upload_jobs), and activity_log shows
-- zero professor-route-originated activity (only api/admin/content/*
-- routes write to it). The app-side surface is removed in the same
-- change as this migration.
--
-- Not touched here: the professor_id columns themselves (still a
-- valid, populated-by-admin legacy column name on questions/
-- upload_jobs/modules — e.g. admin/questions/import/route.ts sets
-- professor_id: user.id on every import), and the jobs/upload_jobs
-- tables (out of scope for this pass).
--
-- upload_jobs_prof_own is deliberately NOT dropped here, despite
-- being in the original delete list: app/api/admin/content/
-- upload/route.ts inserts into upload_jobs via the RLS-bound client
-- (requireAdmin()'s "request-scoped, not service-role" client),
-- setting professor_id: user.id to the ADMIN's own id — this
-- ownership-scoped policy (professor_id = auth.uid()) is what
-- currently permits that write, even though its name and origin are
-- professor-flavored. Dropping it breaks live PDF upload on the
-- admin content surface. professor_own_jobs and
-- flags_professor_manage don't have this problem: jobs' only write
-- path (api/jobs/generate-questions) uses a service-role client that
-- bypasses RLS entirely, and no code anywhere references the
-- question_flags table (only the separate, unrelated flag_count
-- column on questions) — confirmed by grep before writing this.
-- =============================================================

BEGIN;

DROP POLICY IF EXISTS "professor_own_jobs" ON jobs;
DROP POLICY IF EXISTS "flags_professor_manage" ON question_flags;

DROP FUNCTION IF EXISTS public.get_professor_stats(uuid);

COMMIT;
