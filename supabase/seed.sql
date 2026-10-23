-- =============================================================
-- MedZ · seed.sql  (LOCAL DEVELOPMENT ONLY)
-- =============================================================
-- Loaded by the Supabase CLI after migrations on `supabase start`
-- (first creation) and `supabase db reset` — see [db.seed] in
-- config.toml. NEVER run this against a hosted project
-- (do not pass --include-seed to `supabase db push`).
--
-- Why this exists: hosted projects were created when Supabase's
-- default privileges gave anon / authenticated / service_role full
-- DML on every new table in `public`, so our migrations never had to
-- GRANT anything. Current local images only give those roles
-- TRUNCATE/REFERENCES/TRIGGER on tables created by `postgres`, so a
-- freshly replayed local database rejects every PostgREST request
-- (and every service_role server route) with "permission denied".
-- This restores the hosted behaviour locally. Row access is still
-- gated by RLS exactly as on hosted.
--
-- Functions: anon / authenticated are granted nothing here, so the
-- EXECUTE locks from 012/014/027/028 stay in force. Only service_role is
-- given EXECUTE (at the end of this file), because hosted projects'
-- default privileges give it that and 012/014 revoked PUBLIC.
--
-- The blanket table GRANT below also covers the two materialized views,
-- which 012 deliberately revoked from anon / authenticated (Supabase
-- advisor 0016). The end of this file puts that revoke back, so a local
-- database ends up with the same privileges as a hosted one.
-- =============================================================

-- anon is deliberately NOT granted here: migration 038 took every table
-- privilege away from anon on hosted (bar two column-limited landing-page
-- SELECTs it grants itself), and this seed runs after migrations, so
-- granting anon again would undo 038 locally and hide regressions.
GRANT ALL ON ALL TABLES    IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Same grants for tables/sequences created by migrations applied
-- later with `supabase migration up` (seed.sql only re-runs on reset).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES    TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO authenticated, service_role;

-- 038 mirror: authenticated has no TRUNCATE/TRIGGER/REFERENCES on hosted
-- after 038, and the blanket GRANT ALL above would hand them back.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Put back 012's revoke: GRANT ALL ON ALL TABLES above also granted these
-- two materialized views to anon / authenticated, exposing every
-- student's analytics through PostgREST. service_role keeps its access.
REVOKE ALL ON public.student_analytics, public.student_subject_stats
  FROM PUBLIC, anon, authenticated;

-- service_role-only EXECUTE on public functions, as on hosted projects
-- (012/014 revoked PUBLIC, leaving service_role with no access locally).
-- Does not touch anon / authenticated, so the 027/028 locks on
-- record_quiz_result / get_student_rank stay in force.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
