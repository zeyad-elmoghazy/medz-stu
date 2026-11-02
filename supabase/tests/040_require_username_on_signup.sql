-- =====================================================================
-- Migration 040 verification — signup requires a username.
--
-- Run AFTER migrations 001-040 AND supabase/seed.sql, against a
-- NON-PRODUCTION database:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/040_require_username_on_signup.sql
--
-- One transaction, ROLLED BACK at the end. Each rejected signup runs in a
-- sub-transaction so the test can inspect the error and prove no
-- auth.users / profiles row was left behind.
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

-- Try a signup. Returns 'created' or the trigger's error message + SQLSTATE.
CREATE FUNCTION pg_temp.try_signup(p_email TEXT, p_meta JSONB) RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    p_email, '', now(), now(), now(),
    '{"provider":"email","providers":["email"]}', p_meta, false,
    '', '', '', ''
  );
  RETURN 'created';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM || '/' || SQLSTATE;
END $$;

SELECT pg_temp.chk('valid signup is created', 'created',
  pg_temp.try_signup('t040_ok@example.test',
    '{"full_name":"T Ok","academic_year":3,"username":"  Ok_Name  ","role":"admin"}'));
SELECT pg_temp.chk('...username stored trimmed + lowercased', 'ok_name',
  (SELECT username FROM public.profiles WHERE email = 't040_ok@example.test'));
SELECT pg_temp.chk('...role forced to student', 'student',
  (SELECT role FROM public.profiles WHERE email = 't040_ok@example.test'));
SELECT pg_temp.chk('...year stored', '3',
  (SELECT academic_year::TEXT FROM public.profiles WHERE email = 't040_ok@example.test'));
SELECT pg_temp.chk('...first username does not start the cooldown', 'true',
  (SELECT (username_changed_at IS NULL)::TEXT FROM public.profiles WHERE email = 't040_ok@example.test'));

SELECT pg_temp.chk('no username key -> username_required',  'username_required/23502',
  pg_temp.try_signup('t040_none@example.test', '{"full_name":"T"}'));
SELECT pg_temp.chk('null username -> username_required',    'username_required/23502',
  pg_temp.try_signup('t040_null@example.test', '{"full_name":"T","username":null}'));
SELECT pg_temp.chk('blank username -> username_required',   'username_required/23502',
  pg_temp.try_signup('t040_blank@example.test', '{"full_name":"T","username":"   "}'));
SELECT pg_temp.chk('2 chars -> username_invalid',           'username_invalid/23514',
  pg_temp.try_signup('t040_short@example.test', '{"full_name":"T","username":"ab"}'));
SELECT pg_temp.chk('21 chars -> username_invalid',          'username_invalid/23514',
  pg_temp.try_signup('t040_long@example.test', jsonb_build_object('full_name','T','username',repeat('a',21))));
SELECT pg_temp.chk('space -> username_invalid',             'username_invalid/23514',
  pg_temp.try_signup('t040_space@example.test', '{"full_name":"T","username":"has space"}'));
SELECT pg_temp.chk('dash -> username_invalid',              'username_invalid/23514',
  pg_temp.try_signup('t040_dash@example.test', '{"full_name":"T","username":"dash-ed"}'));
SELECT pg_temp.chk('non-string username (number) is treated as text and validated', 'created',
  pg_temp.try_signup('t040_num@example.test', '{"full_name":"T","username":12345}'));
SELECT pg_temp.chk('reserved -> username_reserved',         'username_reserved/23514',
  pg_temp.try_signup('t040_res@example.test', '{"full_name":"T","username":"Admin"}'));
SELECT pg_temp.chk('reserved numbered clone -> username_reserved', 'username_reserved/23514',
  pg_temp.try_signup('t040_res2@example.test', '{"full_name":"T","username":"support_2"}'));
SELECT pg_temp.chk('taken -> username_taken',               'username_taken/23505',
  pg_temp.try_signup('t040_taken@example.test', '{"full_name":"T","username":"ok_name"}'));
SELECT pg_temp.chk('taken, different case -> username_taken', 'username_taken/23505',
  pg_temp.try_signup('t040_taken2@example.test', '{"full_name":"T","username":"OK_NAME"}'));

SELECT pg_temp.chk('rejected signups left no auth.users row', '0',
  (SELECT count(*)::TEXT FROM auth.users
   WHERE email LIKE 't040\_%@example.test' AND email <> 't040_ok@example.test' AND email <> 't040_num@example.test'));
SELECT pg_temp.chk('rejected signups left no profiles row', '0',
  (SELECT count(*)::TEXT FROM public.profiles
   WHERE email LIKE 't040\_%@example.test' AND email <> 't040_ok@example.test' AND email <> 't040_num@example.test'));

SELECT pg_temp.chk('handle_new_auth_user is SECURITY DEFINER', 'true',
  (SELECT prosecdef::TEXT FROM pg_proc WHERE oid = 'public.handle_new_auth_user()'::regprocedure));
SELECT pg_temp.chk('handle_new_auth_user is not callable through the REST API', 'false',
  (has_function_privilege('anon', 'public.handle_new_auth_user()', 'EXECUTE')
   OR has_function_privilege('authenticated', 'public.handle_new_auth_user()', 'EXECUTE'))::TEXT);

DO $$
DECLARE bad INT; total INT;
BEGIN
  SELECT count(*) FILTER (WHERE NOT ok), count(*) INTO bad, total FROM t_results;
  IF bad > 0 THEN
    RAISE EXCEPTION '040: % of % checks FAILED: %', bad, total, (
      SELECT string_agg(name || ' (expected ' || coalesce(expected, 'NULL')
                        || ', got ' || coalesce(actual, 'NULL') || ')', '; ' ORDER BY n)
      FROM t_results WHERE NOT ok);
  END IF;
  RAISE NOTICE '040: all % checks passed', total;
END $$;

ROLLBACK;
