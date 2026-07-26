-- Migration 014 — lock down the role-immutability helper functions
--
-- Both fns from 013 default to EXECUTE granted to anon+authenticated
-- via PostgREST. Neither is meant to be called through the REST API:
--   * prevent_role_elevation()  is trigger-only
--   * cleanup_old_violations()  runs from a service-role scheduler
--
-- Trigger dispatch bypasses EXECUTE checks, so this doesn't break
-- enforce_role_immutability.

BEGIN;

REVOKE ALL ON FUNCTION public.prevent_role_elevation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_old_violations() FROM PUBLIC, anon, authenticated;

COMMIT;
