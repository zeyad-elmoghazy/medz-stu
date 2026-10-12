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
-- Deliberately NOT granted: functions. They keep their migration-
-- defined EXECUTE grants, so the locks in 027/028 stay in force.
-- =============================================================

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Same grants for tables/sequences created by migrations applied
-- later with `supabase migration up` (seed.sql only re-runs on reset).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
