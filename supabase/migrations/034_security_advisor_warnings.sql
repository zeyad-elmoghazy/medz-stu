-- =============================================================
-- MedZ · 034_security_advisor_warnings.sql
-- =============================================================
-- Clears the six Supabase Security Advisor warnings (all WARN, no
-- errors). Nothing the app calls changes behaviour:
--
--   1-3. function_search_path_mutable
--        get_leaderboard_top / get_student_rank / record_quiz_result
--        are SECURITY DEFINER with no pinned search_path. They are
--        already callable by service_role only (027, 028, 031), so
--        this just pins the path. ALTER FUNCTION ... SET leaves the
--        body, owner and ACL exactly as they are.
--
--   4-5. anon_ / authenticated_security_definer_function_executable
--        public.is_admin() is reachable at /rest/v1/rpc/is_admin.
--        It cannot simply be revoked: RLS policy profiles_admin_select
--        (roles = public) calls it, RLS runs functions as the calling
--        role, and 017 had to re-grant it to anon/authenticated for
--        exactly that reason. So the function moves to a schema the
--        API does not expose (`private`, absent from
--        supabase/config.toml [api].schemas) with the same body and
--        the same grants, and the one policy + one function that use
--        it are repointed. Nothing in the app calls it as an RPC.
--
--   6.   authenticated_security_definer_function_executable
--        get_student_streak(uuid) is called by /api/student/stats,
--        /api/student/streak/update and /api/student/streak/complete
--        with the signed-in user's own client, so EXECUTE cannot be
--        revoked. It is switched to SECURITY INVOKER instead: the
--        daily_streaks RLS policy students_read_own_streaks
--        (student_id = auth.uid()) already lets a student read exactly
--        the rows the function counts, so every current call returns
--        the same number. The auth.uid() guard stays. Only an admin
--        asking for ANOTHER student's streak would now get 0 (RLS)
--        instead of the real value; no caller does that.
--
-- Every step is metadata-only. A rollback script is at the bottom.
-- =============================================================

BEGIN;

-- ---------- 1. pin search_path (warnings 1-3) ------------------
ALTER FUNCTION public.get_leaderboard_top(integer)
  SET search_path = public;
ALTER FUNCTION public.get_student_rank(uuid)
  SET search_path = public;
ALTER FUNCTION public.record_quiz_result(uuid, integer, integer, numeric, integer, date)
  SET search_path = public;

-- ---------- 2. private.is_admin() (warnings 4-5) ---------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
-- RLS evaluation needs USAGE on the schema and EXECUTE on the
-- function for whichever role is running the query.
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_admin() TO anon, authenticated, service_role;

-- The only policy that referenced public.is_admin() (checked against
-- pg_depend on the live project). Command and roles are unchanged.
ALTER POLICY "profiles_admin_select" ON public.profiles
  USING (private.is_admin());

-- ---------- 3. get_student_streak -> INVOKER (warning 6) -------
-- Same logic as 012_security_hardening.sql, except: SECURITY INVOKER,
-- and the admin check calls private.is_admin().
CREATE OR REPLACE FUNCTION public.get_student_streak(p_student_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_streak      INTEGER := 0;
  v_check_date  DATE    := CURRENT_DATE;
  v_has_today   BOOLEAN;
BEGIN
  IF auth.uid() IS NULL
     OR (auth.uid() <> p_student_id AND NOT private.is_admin()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM daily_streaks
    WHERE student_id = p_student_id
      AND streak_date = CURRENT_DATE
      AND challenges_completed > 0
  ) INTO v_has_today;

  IF NOT v_has_today THEN
    v_check_date := CURRENT_DATE - INTERVAL '1 day';
  END IF;

  LOOP
    IF EXISTS(
      SELECT 1 FROM daily_streaks
      WHERE student_id = p_student_id
        AND streak_date = v_check_date
        AND challenges_completed > 0
    ) THEN
      v_streak := v_streak + 1;
      v_check_date := v_check_date - INTERVAL '1 day';
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN v_streak;
END;
$$;

-- Same ACL the live function has today (anon never had it).
REVOKE ALL ON FUNCTION public.get_student_streak(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_streak(uuid) TO authenticated, service_role;

-- ---------- 4. drop the exposed copy ---------------------------
-- No CASCADE on purpose: if anything else still depended on it this
-- aborts and rolls the whole migration back.
DROP FUNCTION IF EXISTS public.is_admin();

-- ---------- sanity check: abort if anything didn't land --------
DO $$
DECLARE
  fn TEXT;
BEGIN
  -- 1-3: search_path pinned, still server-only
  FOREACH fn IN ARRAY ARRAY[
    'public.get_leaderboard_top(integer)',
    'public.get_student_rank(uuid)',
    'public.record_quiz_result(uuid, integer, integer, numeric, integer, date)'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE oid = fn::regprocedure
        AND proconfig::text LIKE '%search_path=public%'
    ) THEN
      RAISE EXCEPTION '034: % has no pinned search_path', fn;
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE')
       OR has_function_privilege('authenticated', fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION '034: % ACL is no longer service_role-only', fn;
    END IF;
  END LOOP;

  -- 4-5: moved, repointed, and nothing left behind
  IF to_regprocedure('public.is_admin()') IS NOT NULL THEN
    RAISE EXCEPTION '034: public.is_admin() still exists';
  END IF;
  IF to_regprocedure('private.is_admin()') IS NULL THEN
    RAISE EXCEPTION '034: private.is_admin() missing';
  END IF;
  IF NOT has_schema_privilege('anon', 'private', 'USAGE')
     OR NOT has_schema_privilege('authenticated', 'private', 'USAGE')
     OR NOT has_function_privilege('anon', 'private.is_admin()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'private.is_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION '034: anon/authenticated cannot reach private.is_admin()';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'profiles_admin_select'
      AND polrelid = 'public.profiles'::regclass
      AND pg_get_expr(polqual, polrelid) LIKE '%private.is_admin()%'
  ) THEN
    RAISE EXCEPTION '034: profiles_admin_select does not use private.is_admin()';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE coalesce(qual, '') || coalesce(with_check, '') ~* '(^|[^a-z_.])is_admin\s*\('
       OR coalesce(qual, '') || coalesce(with_check, '') ~* 'public\.is_admin'
  ) THEN
    RAISE EXCEPTION '034: a policy still references public.is_admin()';
  END IF;
  -- plpgsql bodies are not tracked by pg_depend, so scan them too.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prokind = 'f'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND (p.prosrc ~* '(^|[^a-z_.])is_admin\s*\(' OR p.prosrc ~* 'public\.is_admin')
  ) THEN
    RAISE EXCEPTION '034: a function body still references public.is_admin()';
  END IF;

  -- 6: streak function invoker, same callers
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = 'public.get_student_streak(uuid)'::regprocedure AND prosecdef
  ) THEN
    RAISE EXCEPTION '034: get_student_streak is still SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', 'public.get_student_streak(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_student_streak(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_student_streak(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '034: get_student_streak ACL changed';
  END IF;
END
$$;

COMMIT;

-- =============================================================
-- ROLLBACK (manual; not run by the migration)
-- =============================================================
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
--     SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
--   $f$;
-- GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
-- ALTER POLICY "profiles_admin_select" ON public.profiles USING (is_admin());
-- -- restore get_student_streak: re-run its definition from
-- -- 012_security_hardening.sql (SECURITY DEFINER, public.is_admin()).
-- DROP FUNCTION private.is_admin();
-- ALTER FUNCTION public.get_leaderboard_top(integer) RESET search_path;
-- ALTER FUNCTION public.get_student_rank(uuid) RESET search_path;
-- ALTER FUNCTION public.record_quiz_result(uuid, integer, integer, numeric, integer, date) RESET search_path;
-- COMMIT;
