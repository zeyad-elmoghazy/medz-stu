-- =============================================================
-- MediZee · 027_lock_record_quiz_result.sql
-- =============================================================
-- Security fix: record_quiz_result() is a SECURITY DEFINER
-- function that updates ANY student's profiles.total_xp /
-- total_correct_answers / total_questions_answered / daily_streaks
-- given only a p_student_id argument, with no internal check that
-- the caller IS that student. Migration 025_leaderboard_xp.sql
-- granted EXECUTE to `authenticated` (and, via the implicit
-- PUBLIC-owner ACL Postgres attaches to every newly created
-- function, `anon` as well — confirmed live on production via
-- pg_proc/aclexplode before writing this). That means any signed
-- request — authenticated OR fully anonymous — could call this RPC
-- directly through PostgREST with an arbitrary student_id and XP
-- delta and corrupt another student's stats/leaderboard position.
--
-- Both real call sites (app/api/quiz/submit/route.ts,
-- app/api/student/chapters/[chapterId]/submit/route.ts) already
-- invoke this exclusively through the service-role client — never
-- the user-scoped one — so the function needs no `authenticated`
-- access at all. Revoking public/anon/authenticated access entirely
-- (rather than adding an auth.uid() = p_student_id check, per
-- get_student_streak's pattern in 012_security_hardening.sql) is
-- strictly safer here: a same-uid check would still let a student
-- call this RPC on themselves with a client-forged p_xp_delta /
-- p_eligible_correct_count, which a same-uid check alone does not
-- guard against.
-- =============================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.record_quiz_result(uuid, integer, integer, integer, integer, date)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_quiz_result(uuid, integer, integer, integer, integer, date)
  TO service_role;

COMMIT;
