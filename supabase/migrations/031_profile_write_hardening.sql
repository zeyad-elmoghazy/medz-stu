-- =============================================================
-- MedZ · 031_profile_write_hardening.sql
-- =============================================================
-- Closes four ways a signed-in student could write data the app
-- never meant them to, all reachable straight through PostgREST
-- with their own session (no app route involved):
--
-- 1. profiles: `profiles_owner_update` is `USING (auth.uid() = id)`
--    with no column limits, and only `role` was protected (013). A
--    student could PATCH their own total_xp / counters /
--    last_active_at / email / created_at — i.e. cheat the
--    leaderboard. A BEFORE UPDATE trigger now rejects any change
--    outside an allow-list when the caller is an API role.
--
-- 2. profiles INSERT: `profiles_owner_insert` allowed inserting an
--    own row with arbitrary columns (only reachable if the row is
--    missing). The signup trigger is the only thing that creates
--    profile rows, so the policy is dropped.
--
-- 3. daily_streaks: `students_own_streaks` was FOR ALL with no
--    limits; record_quiz_result() enforces the 150-correct/day XP
--    cap from daily_streaks.xp_correct_count, so a student could
--    reset their own cap, or forge streak rows. Students keep
--    SELECT on their own rows; all writes now go through the app's
--    server routes (service role) or record_quiz_result().
--
-- 4. get_leaderboard_top(int): still executable by anon and
--    authenticated (028 locked its sibling get_student_rank), so
--    anyone, logged out, could read the top-N students' names and
--    last-active times. The only caller is the service-role client
--    in app/api/student/leaderboard/route.ts.
--
-- DEPLOY ORDER: ship the app code first. The streak routes are
-- switched to the service-role client in the same change; under
-- the OLD policy they keep working too, but under the NEW policy
-- the previous (user-session) code would fail to write.
--
-- Which callers the profiles trigger restricts: only `anon` and
-- `authenticated`. service_role (the app's server routes and
-- record_quiz_result(), a SECURITY DEFINER function called with the
-- service key) and maintenance contexts (SQL editor / migrations,
-- where the role reads 'none' or 'postgres') are NOT restricted, so
-- the README's manual `UPDATE profiles SET ...` keeps working
-- (role changes still go through 013's trigger as before).
--
-- Rollback (manual):
--   DROP TRIGGER enforce_profile_allowlist ON public.profiles;
--   DROP FUNCTION public.protect_profile_columns();
--   CREATE POLICY "profiles_owner_insert" ON public.profiles
--     FOR INSERT WITH CHECK (auth.uid() = id);
--   DROP POLICY "students_read_own_streaks" ON public.daily_streaks;
--   CREATE POLICY "students_own_streaks" ON public.daily_streaks
--     FOR ALL USING (student_id = auth.uid());
--   GRANT EXECUTE ON FUNCTION public.get_leaderboard_top(integer)
--     TO anon, authenticated;
-- =============================================================

BEGIN;

-- ---------- 1. profiles column allow-list ----------------------
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  -- Columns a student may change about themselves. Anything else
  -- (current and future) is rejected for API callers.
  safe_cols CONSTANT TEXT[] := ARRAY[
    'full_name', 'username', 'academic_year', 'academic_year_session',
    'notify_email', 'notify_reminders'
  ];
  claims TEXT;
  caller TEXT;
BEGIN
  -- Caller role as PostgREST reports it. nullif() because a custom
  -- GUC set earlier on a pooled connection reads '' (not NULL),
  -- which a bare coalesce() would treat as a real value.
  claims := nullif(current_setting('request.jwt.claims', true), '');
  caller := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    CASE WHEN claims IS NOT NULL THEN claims::jsonb ->> 'role' END,
    nullif(current_setting('role', true), ''),
    'none'
  );

  IF caller IN ('anon', 'authenticated')
     AND (to_jsonb(NEW) - safe_cols) IS DISTINCT FROM (to_jsonb(OLD) - safe_cols)
  THEN
    RAISE EXCEPTION 'profile update forbidden for columns outside the allow-list (caller role: %)', caller
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS enforce_profile_allowlist ON public.profiles;
CREATE TRIGGER enforce_profile_allowlist
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_columns();

-- Trigger-only function: not meant to be callable through the REST API
-- (trigger dispatch bypasses EXECUTE checks) — same as 014.
REVOKE ALL ON FUNCTION public.protect_profile_columns() FROM PUBLIC, anon, authenticated;

-- ---------- 2. no client-side profile creation -----------------
DROP POLICY IF EXISTS "profiles_owner_insert" ON public.profiles;

-- ---------- 3. daily_streaks: read-only for students -----------
DROP POLICY IF EXISTS "students_own_streaks" ON public.daily_streaks;
DROP POLICY IF EXISTS "students_read_own_streaks" ON public.daily_streaks;
CREATE POLICY "students_read_own_streaks" ON public.daily_streaks
  FOR SELECT USING (student_id = auth.uid());

-- ---------- 4. leaderboard top-N: server only ------------------
REVOKE EXECUTE ON FUNCTION public.get_leaderboard_top(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_top(integer)
  TO service_role;

-- ---------- sanity check: abort if anything didn't land --------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'enforce_profile_allowlist' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION '031: enforce_profile_allowlist trigger missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND ((tablename = 'profiles' AND policyname = 'profiles_owner_insert')
        OR (tablename = 'daily_streaks' AND policyname = 'students_own_streaks'))
  ) THEN
    RAISE EXCEPTION '031: an old permissive policy is still present';
  END IF;
  IF has_function_privilege('anon', 'public.get_leaderboard_top(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_leaderboard_top(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '031: get_leaderboard_top is still executable by an API role';
  END IF;
END
$$;

COMMIT;
