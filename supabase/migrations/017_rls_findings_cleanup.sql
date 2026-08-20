-- =============================================================
-- MedZ · 017_rls_findings_cleanup.sql
-- =============================================================
-- Two non-security findings from the adversarial RLS test pass
-- against 015/016 (supabase/tests/rls_adversarial_015_016.sql):
--
--   1. is_admin() lost EXECUTE for anon (and, incidentally,
--      authenticated — 012 revoked from PUBLIC without an explicit
--      authenticated re-grant) but is still referenced from inside
--      profiles_admin_select's USING clause. Any query that forces
--      Postgres to evaluate that policy for a role lacking EXECUTE
--      (anon always; authenticated too, in the one case where its
--      own profiles_owner_select disjunct doesn't already short-
--      circuit it) fails with "permission denied for function
--      is_admin" instead of a clean RLS rejection. Still blocked
--      either way — not a hole — just a rougher error path.
--      is_admin() takes no arguments and returns a boolean about
--      the CALLING user only (false for anon, since auth.uid() is
--      null for unauthenticated callers); safe to expose directly.
--
--   2. professors_read_sessions (quiz_sessions, quiz_sessions_
--      partitioned, and all 13 of its monthly + default children —
--      012 applied it per-partition since partitions don't inherit
--      parent policies) checks profiles.role = 'professor', which
--      015's tightened profiles_role_check makes permanently
--      impossible to satisfy. Dead policy — fails closed, grants
--      no one anything — but it's clutter now that the professor
--      role doesn't exist. Dropped everywhere it was applied.
-- =============================================================

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_policies
    WHERE policyname = 'professors_read_sessions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS professors_read_sessions ON %I.%I', r.schemaname, r.tablename);
  END LOOP;
END $$;
