-- Migration 013 — role-immutability trigger + violation retention
--
-- Complements 012's RLS pass with an app-layer guard:
--   * Only writes made with the service_role JWT (server-side
--     admin-authored calls) can flip profiles.role. Any request
--     coming through PostgREST with an authenticated user token
--     lands with request.jwt.claim.role = 'authenticated', which
--     fails the guard — so a compromised user token can't
--     self-elevate to admin even if a future policy accidentally
--     allows the UPDATE.
--   * Cleanup fn for stale quiz-violation rows (invoked from a
--     scheduled worker; keeps the audit table bounded).

BEGIN;

-- ============================================================
-- 1. Prevent role elevation
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_role_elevation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  jwt_role TEXT;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    jwt_role := coalesce(
      current_setting('request.jwt.claim.role', true),
      current_setting('role', true)
    );
    IF jwt_role <> 'service_role' THEN
      RAISE EXCEPTION 'role change forbidden (caller role: %)', jwt_role
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS enforce_role_immutability ON public.profiles;
CREATE TRIGGER enforce_role_immutability
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_elevation();

-- ============================================================
-- 2. Bounded retention for quiz-violation audit rows.
--    Table may not exist yet (only created when anti-cheat lands);
--    the guarded DELETE is a no-op in that case.
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_violations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'quiz_violations'
  ) THEN
    DELETE FROM public.quiz_violations
    WHERE occurred_at < NOW() - INTERVAL '30 days';
  END IF;
END;
$fn$;

-- Sanity check — abort the migration if the trigger didn't land.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'enforce_role_immutability'
  ) THEN
    RAISE EXCEPTION 'migration 013: role-immutability trigger missing';
  END IF;
END $$;

COMMIT;
