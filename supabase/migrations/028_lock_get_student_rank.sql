-- =============================================================
-- MediZee · 028_lock_get_student_rank.sql
-- =============================================================
-- Security fix, same root cause as 027_lock_record_quiz_result.sql:
-- get_student_rank(p_student_id uuid) is a SECURITY DEFINER
-- function with no internal check that the caller IS p_student_id.
-- Migration 025_leaderboard_xp.sql granted EXECUTE to
-- `authenticated`, and — via Postgres's implicit PUBLIC-owner ACL
-- on newly created functions — `anon` had it too (confirmed live on
-- production via pg_proc/aclexplode, same as record_quiz_result).
-- Any authenticated OR fully anonymous caller could look up any
-- other specific student's last_active_at by UUID — an
-- activity-tracking oracle, not a write vector, but still an
-- unintended info-disclosure surface.
--
-- The only real call site (app/api/student/leaderboard/route.ts:63)
-- already calls this exclusively through the service-role client
-- with the caller's own id, never via the user-scoped client, so —
-- same reasoning as 027 — the function needs no public/anon/
-- authenticated access at all.
-- =============================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.get_student_rank(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_student_rank(uuid)
  TO service_role;

COMMIT;
