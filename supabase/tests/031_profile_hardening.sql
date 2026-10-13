-- =====================================================================
-- Migration 031 verification — profile write hardening.
--
-- Run AFTER migrations 001-031 AND supabase/seed.sql (the seed grants the
-- API roles table privileges, which hosted projects have by default),
-- against a NON-PRODUCTION database:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/031_profile_hardening.sql
--
-- Everything runs in one transaction that is ROLLED BACK, so no fixture
-- users/rows remain. Each case impersonates a role the way PostgREST
-- does (SET LOCAL ROLE + request.jwt.claims). The final DO block RAISES
-- listing every failed check (non-zero exit under ON_ERROR_STOP);
-- on success it prints "031: all N checks passed".
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

-- Run ONE statement as an API role and report the outcome:
--   'allowed:<rows>' | 'blocked:<sqlstate>' ; zero affected rows on a
--   write is reported as 'allowed:0' (RLS hides rows instead of erroring).
-- The role switch is undone before returning so the caller can use temp objects.
CREATE FUNCTION pg_temp.as_role(p_role TEXT, p_uid UUID, p_sql TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE rows_n BIGINT; res TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', p_role, 'sub', p_uid)::text, true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS rows_n = ROW_COUNT;
    res := 'allowed:' || rows_n;
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
-- Fixtures
-- ---------------------------------------------------------------------
CREATE TEMP TABLE t_ids AS
  SELECT pg_temp.mk_user('t031_a@example.test') AS a,
         pg_temp.mk_user('t031_b@example.test') AS b,
         pg_temp.mk_user('t031_nop@example.test') AS nop;

-- ---------------------------------------------------------------------
-- 1. A student can NOT change protected profile columns
-- ---------------------------------------------------------------------
DO $$
DECLARE a UUID := (SELECT a FROM t_ids);
        col TEXT; setexpr TEXT; r TEXT;
BEGIN
  FOR col, setexpr IN VALUES
    ('total_xp',                 'total_xp = 999999'),
    ('total_correct_answers',    'total_correct_answers = 5'),
    ('total_questions_answered', 'total_questions_answered = 5'),
    ('last_active_at',           'last_active_at = now()'),
    ('email',                    'email = ''forged@example.test'''),
    ('created_at',               'created_at = now() - interval ''1 year'''),
    ('role',                     'role = ''admin''')
  LOOP
    r := pg_temp.as_role('authenticated', a,
           format('UPDATE public.profiles SET %s WHERE id = %L', setexpr, a));
    PERFORM pg_temp.chk('authenticated cannot UPDATE ' || col, 'blocked:42501', r);
  END LOOP;

  -- Several columns at once, including one allowed: the whole statement is rejected.
  r := pg_temp.as_role('authenticated', a,
         format('UPDATE public.profiles SET full_name = ''Sneaky'', total_xp = 1 WHERE id = %L', a));
  PERFORM pg_temp.chk('mixed allowed+protected UPDATE is rejected', 'blocked:42501', r);
  PERFORM pg_temp.chk('...and the allowed column was not applied either',
    'T', (SELECT full_name FROM public.profiles WHERE id = a));

  -- anon (no session) can't write at all (no policy matches).
  r := pg_temp.as_role('anon', NULL,
         format('UPDATE public.profiles SET total_xp = 1 WHERE id = %L', a));
  PERFORM pg_temp.chk('anon cannot UPDATE profiles',
    'allowed:0', r);  -- RLS hides the row from anon; 0 rows, never a change
  PERFORM pg_temp.chk('...and nothing changed', '0',
    (SELECT total_xp FROM public.profiles WHERE id = a)::TEXT);
END $$;

-- ---------------------------------------------------------------------
-- 2. ...but CAN still change the 6 self-service columns
-- ---------------------------------------------------------------------
DO $$
DECLARE a UUID := (SELECT a FROM t_ids); r TEXT; s TEXT; q TEXT;
BEGIN
  FOR s, q IN VALUES
    ('full_name',             'full_name = ''Renamed'''),
    ('username',              'username = ''t031_name'''),
    ('academic_year',         'academic_year = 3, academic_year_session = 2026'),
    ('notify_email',          'notify_email = false'),
    ('notify_reminders',      'notify_reminders = false')
  LOOP
    r := pg_temp.as_role('authenticated', a,
           format('UPDATE public.profiles SET %s WHERE id = %L', q, a));
    PERFORM pg_temp.chk('authenticated CAN UPDATE ' || s, 'allowed:1', r);
  END LOOP;

  -- Another student's row is invisible/unwritable (owner policy), not erroring.
  r := pg_temp.as_role('authenticated', a,
         format('UPDATE public.profiles SET full_name = ''Hijack'' WHERE id = %L', (SELECT b FROM t_ids)));
  PERFORM pg_temp.chk('authenticated cannot touch another student''s row', 'allowed:0', r);
  PERFORM pg_temp.chk('...other student unchanged', 'T',
    (SELECT full_name FROM public.profiles WHERE id = (SELECT b FROM t_ids)));
END $$;

-- ---------------------------------------------------------------------
-- 3. Trusted callers are NOT restricted
-- ---------------------------------------------------------------------
DO $$
DECLARE a UUID := (SELECT a FROM t_ids); r TEXT;
BEGIN
  r := pg_temp.as_role('service_role', NULL,
         format('UPDATE public.profiles SET total_xp = 123 WHERE id = %L', a));
  PERFORM pg_temp.chk('service_role CAN UPDATE total_xp', 'allowed:1', r);

  -- No claim at all = SQL editor / maintenance context.
  UPDATE public.profiles SET total_xp = 456 WHERE id = a;
  PERFORM pg_temp.chk('maintenance context (no claim) CAN UPDATE total_xp', '456',
    (SELECT total_xp FROM public.profiles WHERE id = a)::TEXT);

  -- The real XP path: record_quiz_result (SECURITY DEFINER) called as service_role.
  UPDATE public.profiles SET total_xp = 0, total_questions_answered = 0 WHERE id = a;
  r := pg_temp.as_role('service_role', NULL,
         format('SELECT * FROM public.record_quiz_result(%L, 8, 10, 80, 0, current_date)', a));
  PERFORM pg_temp.chk('record_quiz_result runs as service_role', 'allowed:1', r);
  PERFORM pg_temp.chk('...and awarded 80 XP (8 correct x 10)', '80',
    (SELECT total_xp FROM public.profiles WHERE id = a)::TEXT);
  PERFORM pg_temp.chk('...and updated the counters', '10',
    (SELECT total_questions_answered FROM public.profiles WHERE id = a)::TEXT);

  -- Nobody but the server can call it.
  PERFORM pg_temp.chk('authenticated cannot EXECUTE record_quiz_result', 'blocked:42501',
    pg_temp.as_role('authenticated', a,
      format('SELECT * FROM public.record_quiz_result(%L, 150, 150, 100, 0, current_date)', a)));
END $$;

-- ---------------------------------------------------------------------
-- 4. No client-side profile creation
-- ---------------------------------------------------------------------
DO $$
DECLARE nop UUID := (SELECT nop FROM t_ids); r TEXT;
BEGIN
  DELETE FROM public.profiles WHERE id = nop;   -- simulate a missing row (as postgres)
  r := pg_temp.as_role('authenticated', nop,
         format('INSERT INTO public.profiles (id, role, total_xp) VALUES (%L, ''admin'', 999999)', nop));
  PERFORM pg_temp.chk('authenticated cannot INSERT own profile (any columns)', 'blocked:42501', r);
  PERFORM pg_temp.chk('...no row was created', '0',
    (SELECT count(*) FROM public.profiles WHERE id = nop)::TEXT);
END $$;

-- ---------------------------------------------------------------------
-- 5. daily_streaks: read own, never write
-- ---------------------------------------------------------------------
DO $$
DECLARE a UUID := (SELECT a FROM t_ids); b UUID := (SELECT b FROM t_ids); r TEXT;
BEGIN
  INSERT INTO public.daily_streaks (student_id, streak_date, challenges_completed, xp_correct_count)
  VALUES (a, current_date - 3, 1, 150) ON CONFLICT DO NOTHING;   -- seeded as postgres

  PERFORM pg_temp.chk('authenticated can SELECT own daily_streaks', 'allowed:1',
    pg_temp.as_role('authenticated', a,
      format('SELECT 1 FROM public.daily_streaks WHERE student_id = %L AND streak_date = current_date - 3', a)));

  r := pg_temp.as_role('authenticated', a,
         format('UPDATE public.daily_streaks SET xp_correct_count = 0 WHERE student_id = %L', a));
  PERFORM pg_temp.chk('authenticated cannot reset xp_correct_count (0 rows)', 'allowed:0', r);
  PERFORM pg_temp.chk('...cap counter untouched', '150',
    (SELECT xp_correct_count FROM public.daily_streaks WHERE student_id = a AND streak_date = current_date - 3)::TEXT);

  r := pg_temp.as_role('authenticated', a,
         format('INSERT INTO public.daily_streaks (student_id, streak_date, challenges_completed) VALUES (%L, current_date - 9, 99)', a));
  PERFORM pg_temp.chk('authenticated cannot INSERT a forged streak row', 'blocked:42501', r);

  r := pg_temp.as_role('authenticated', a,
         format('DELETE FROM public.daily_streaks WHERE student_id = %L', a));
  PERFORM pg_temp.chk('authenticated cannot DELETE streak rows (0 rows)', 'allowed:0', r);
  PERFORM pg_temp.chk('...row still there', '1',
    (SELECT count(*) FROM public.daily_streaks WHERE student_id = a AND streak_date = current_date - 3)::TEXT);

  PERFORM pg_temp.chk('authenticated cannot read another student''s streaks', 'allowed:0',
    pg_temp.as_role('authenticated', b,
      format('SELECT 1 FROM public.daily_streaks WHERE student_id = %L', a)));

  PERFORM pg_temp.chk('service_role CAN write daily_streaks', 'allowed:1',
    pg_temp.as_role('service_role', NULL,
      format('INSERT INTO public.daily_streaks (student_id, streak_date, challenges_completed) VALUES (%L, current_date - 20, 1)', a)));
END $$;

-- ---------------------------------------------------------------------
-- 6. get_leaderboard_top is server-only now
-- ---------------------------------------------------------------------
SELECT pg_temp.chk('anon cannot EXECUTE get_leaderboard_top', 'false',
  has_function_privilege('anon', 'public.get_leaderboard_top(integer)', 'EXECUTE')::TEXT);
SELECT pg_temp.chk('authenticated cannot EXECUTE get_leaderboard_top', 'false',
  has_function_privilege('authenticated', 'public.get_leaderboard_top(integer)', 'EXECUTE')::TEXT);
SELECT pg_temp.chk('service_role CAN EXECUTE get_leaderboard_top', 'true',
  has_function_privilege('service_role', 'public.get_leaderboard_top(integer)', 'EXECUTE')::TEXT);
-- to_regprocedure() so a missing function is a failed check, not a crash.
SELECT pg_temp.chk('the allow-list function exists and is not callable through the API', 'false',
  CASE WHEN to_regprocedure('public.protect_profile_columns()') IS NULL THEN 'function missing'
       ELSE (has_function_privilege('anon', 'public.protect_profile_columns()', 'EXECUTE')
             OR has_function_privilege('authenticated', 'public.protect_profile_columns()', 'EXECUTE'))::TEXT
  END);

-- ---------------------------------------------------------------------
-- Verdict
-- ---------------------------------------------------------------------
DO $$
DECLARE bad INT; total INT;
BEGIN
  SELECT count(*) FILTER (WHERE NOT ok), count(*) INTO bad, total FROM t_results;
  IF bad > 0 THEN
    RAISE EXCEPTION '031: % of % checks FAILED: %', bad, total, (
      SELECT string_agg(name || ' (expected ' || coalesce(expected, 'NULL')
                        || ', got ' || coalesce(actual, 'NULL') || ')', '; ' ORDER BY n)
      FROM t_results WHERE NOT ok);
  END IF;
  RAISE NOTICE '031: all % checks passed', total;
END $$;

ROLLBACK;
