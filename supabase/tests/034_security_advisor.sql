-- =====================================================================
-- Migration 034 verification — Security Advisor warnings.
--
-- Run AFTER migrations 001-034 AND supabase/seed.sql (the seed grants the
-- API roles table privileges, which hosted projects have by default),
-- against a NON-PRODUCTION database:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/034_security_advisor.sql
--
-- Everything runs in one transaction that is ROLLED BACK, so no fixture
-- users/rows remain. Each case impersonates a role the way PostgREST
-- does (SET LOCAL ROLE + request.jwt.claims). The final DO block RAISES
-- listing every failed check (non-zero exit under ON_ERROR_STOP);
-- on success it prints "034: all N checks passed".
-- =====================================================================

BEGIN;

CREATE TEMP TABLE t_results (
  n SERIAL PRIMARY KEY, name TEXT NOT NULL, expected TEXT, actual TEXT, ok BOOLEAN NOT NULL
);
CREATE FUNCTION pg_temp.chk(p_name TEXT, p_expected TEXT, p_actual TEXT)
RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO t_results (name, expected, actual, ok)
  VALUES (p_name, p_expected, p_actual, p_expected IS NOT DISTINCT FROM p_actual);
$$;

-- A real auth.users row (fires the real signup trigger -> profiles row).
CREATE FUNCTION pg_temp.mk_user(p_email TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE new_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    p_email, '', now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"T","academic_year":2}', false,
    '', '', '', ''
  );
  RETURN new_id;
END $$;

-- Run ONE single-value query as an API role and report the outcome:
--   'val:<first column as text>' | 'blocked:<sqlstate>'.
-- The role switch is undone before returning so the caller can use temp objects.
CREATE FUNCTION pg_temp.as_role_val(p_role TEXT, p_uid UUID, p_sql TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE v TEXT; res TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', p_role, 'sub', p_uid)::text, true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql INTO v;
    res := 'val:' || coalesce(v, 'NULL');
  EXCEPTION WHEN OTHERS THEN
    res := 'blocked:' || SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  RETURN res;
END $$;

-- ---------------------------------------------------------------------
-- Fixtures: two students (a, b) and one admin
-- ---------------------------------------------------------------------
CREATE TEMP TABLE t_ids AS
  SELECT pg_temp.mk_user('t034_a@example.test') AS a,
         pg_temp.mk_user('t034_b@example.test') AS b,
         pg_temp.mk_user('t034_admin@example.test') AS adm;

-- prevent_role_elevation() only lets service_role change a role, so
-- promote the admin the way the real service does, then drop the claim.
SELECT set_config('request.jwt.claim.role', 'service_role', true);
UPDATE public.profiles SET role = 'admin' WHERE id = (SELECT adm FROM t_ids);
SELECT set_config('request.jwt.claim.role', '', true);

-- Student a: a 3-day streak ending today.
INSERT INTO public.daily_streaks (student_id, streak_date, challenges_completed, xp_correct_count)
SELECT (SELECT a FROM t_ids), current_date - d, 1, 10 FROM generate_series(0, 2) AS d;

-- ---------------------------------------------------------------------
-- 1. Warnings 1-3: search_path pinned, still server-only
-- ---------------------------------------------------------------------
DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_leaderboard_top(integer)',
    'public.get_student_rank(uuid)',
    'public.record_quiz_result(uuid, integer, integer, numeric, integer, date)'
  ] LOOP
    PERFORM pg_temp.chk(fn || ' has a pinned search_path', 'true',
      coalesce((SELECT coalesce(proconfig::text LIKE '%search_path=public%', false)::TEXT
                FROM pg_proc WHERE oid = to_regprocedure(fn)), 'function missing'));
    PERFORM pg_temp.chk('anon cannot EXECUTE ' || fn, 'false',
      has_function_privilege('anon', fn, 'EXECUTE')::TEXT);
    PERFORM pg_temp.chk('authenticated cannot EXECUTE ' || fn, 'false',
      has_function_privilege('authenticated', fn, 'EXECUTE')::TEXT);
    PERFORM pg_temp.chk('service_role CAN EXECUTE ' || fn, 'true',
      has_function_privilege('service_role', fn, 'EXECUTE')::TEXT);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2. Warnings 4-5: is_admin() left the exposed schema
-- ---------------------------------------------------------------------
SELECT pg_temp.chk('public.is_admin() no longer exists', '0',
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'is_admin')::TEXT);
SELECT pg_temp.chk('private.is_admin() exists', 'true',
  (to_regprocedure('private.is_admin()') IS NOT NULL)::TEXT);

DO $$
DECLARE a UUID := (SELECT a FROM t_ids); adm UUID := (SELECT adm FROM t_ids);
BEGIN
  PERFORM pg_temp.chk('private.is_admin() is false for anon', 'val:false',
    pg_temp.as_role_val('anon', NULL, 'SELECT private.is_admin()'));
  PERFORM pg_temp.chk('private.is_admin() is false for a student', 'val:false',
    pg_temp.as_role_val('authenticated', a, 'SELECT private.is_admin()'));
  PERFORM pg_temp.chk('private.is_admin() is true for an admin', 'val:true',
    pg_temp.as_role_val('authenticated', adm, 'SELECT private.is_admin()'));
END $$;

-- 017 needed anon policy evaluation not to error, back when anon held
-- table privileges. Migration 038 removed them, so anon is now stopped
-- earlier, with permission denied (42501) — still no rows, and still no
-- is_admin() evaluation error. 038_anon_lockdown.sql covers the detail.
DO $$
DECLARE a UUID := (SELECT a FROM t_ids); adm UUID := (SELECT adm FROM t_ids);
BEGIN
  PERFORM pg_temp.chk('anon reading profiles is refused outright (038)', 'blocked:42501',
    pg_temp.as_role_val('anon', NULL, 'SELECT count(*) FROM public.profiles'));
  PERFORM pg_temp.chk('a student sees only their own profile', 'val:1',
    pg_temp.as_role_val('authenticated', a, 'SELECT count(*) FROM public.profiles'));
  PERFORM pg_temp.chk('an admin sees every profile (profiles_admin_select)',
    'val:' || (SELECT count(*) FROM public.profiles),
    pg_temp.as_role_val('authenticated', adm, 'SELECT count(*) FROM public.profiles'));
END $$;

-- ---------------------------------------------------------------------
-- 3. Warning 6: get_student_streak is SECURITY INVOKER, same results
-- ---------------------------------------------------------------------
SELECT pg_temp.chk('get_student_streak is SECURITY INVOKER', 'false',
  (SELECT prosecdef::TEXT FROM pg_proc WHERE oid = to_regprocedure('public.get_student_streak(uuid)')));
SELECT pg_temp.chk('get_student_streak keeps a pinned search_path', 'true',
  (SELECT (proconfig::text LIKE '%search_path=public%')::TEXT
   FROM pg_proc WHERE oid = to_regprocedure('public.get_student_streak(uuid)')));
SELECT pg_temp.chk('authenticated CAN EXECUTE get_student_streak (the routes use it)', 'true',
  has_function_privilege('authenticated', 'public.get_student_streak(uuid)', 'EXECUTE')::TEXT);
SELECT pg_temp.chk('anon cannot EXECUTE get_student_streak', 'false',
  has_function_privilege('anon', 'public.get_student_streak(uuid)', 'EXECUTE')::TEXT);

DO $$
DECLARE a UUID := (SELECT a FROM t_ids); b UUID := (SELECT b FROM t_ids);
        adm UUID := (SELECT adm FROM t_ids);
BEGIN
  PERFORM pg_temp.chk('a student gets their own 3-day streak', 'val:3',
    pg_temp.as_role_val('authenticated', a,
      format('SELECT public.get_student_streak(%L::uuid)', a)));
  PERFORM pg_temp.chk('a student with no activity gets 0', 'val:0',
    pg_temp.as_role_val('authenticated', b,
      format('SELECT public.get_student_streak(%L::uuid)', b)));
  PERFORM pg_temp.chk('a student cannot read another student''s streak', 'blocked:42501',
    pg_temp.as_role_val('authenticated', b,
      format('SELECT public.get_student_streak(%L::uuid)', a)));
  PERFORM pg_temp.chk('anon cannot call get_student_streak', 'blocked:42501',
    pg_temp.as_role_val('anon', NULL,
      format('SELECT public.get_student_streak(%L::uuid)', a)));
  -- Documented trade-off of INVOKER: daily_streaks RLS only exposes a
  -- student's own rows, so an admin asking about someone else gets 0
  -- (not an error). No route does this; they all pass the caller's id.
  PERFORM pg_temp.chk('admin asking for another student gets 0 under RLS (documented)', 'val:0',
    pg_temp.as_role_val('authenticated', adm,
      format('SELECT public.get_student_streak(%L::uuid)', a)));
END $$;

-- ---------------------------------------------------------------------
-- 4. The three server-only RPCs still work for service_role
-- ---------------------------------------------------------------------
DO $$
DECLARE a UUID := (SELECT a FROM t_ids);
BEGIN
  PERFORM pg_temp.chk('service_role: record_quiz_result returns XP (8 correct x 10)', 'val:80',
    pg_temp.as_role_val('service_role', NULL,
      format('SELECT xp_earned FROM public.record_quiz_result(%L, 8, 10, 80, 0, current_date)', a)));
  PERFORM pg_temp.chk('...and the profile counters moved', '10',
    (SELECT total_questions_answered FROM public.profiles WHERE id = a)::TEXT);
  PERFORM pg_temp.chk('service_role: get_student_rank returns the student row', 'val:1',
    pg_temp.as_role_val('service_role', NULL,
      format('SELECT count(*) FROM public.get_student_rank(%L)', a)));
  PERFORM pg_temp.chk('service_role: get_leaderboard_top returns rows', 'val:' ||
      LEAST(10, (SELECT count(*) FROM public.profiles WHERE role = 'student')),
    pg_temp.as_role_val('service_role', NULL,
      'SELECT count(*) FROM public.get_leaderboard_top(10)'));
END $$;

-- ---------------------------------------------------------------------
-- Verdict
-- ---------------------------------------------------------------------
DO $$
DECLARE bad INT; total INT;
BEGIN
  SELECT count(*) FILTER (WHERE NOT ok), count(*) INTO bad, total FROM t_results;
  IF bad > 0 THEN
    RAISE EXCEPTION '034: % of % checks FAILED: %', bad, total, (
      SELECT string_agg(name || ' (expected ' || coalesce(expected, 'NULL')
                        || ', got ' || coalesce(actual, 'NULL') || ')', '; ' ORDER BY n)
      FROM t_results WHERE NOT ok);
  END IF;
  RAISE NOTICE '034: all % checks passed', total;
END $$;

ROLLBACK;
