-- =====================================================================
-- Migration 050 verification — public.admin_retention_series.
--
-- Run AFTER all migrations AND supabase/seed.sql, against a NON-PRODUCTION
-- database:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/050_admin_retention_series.sql
--
-- One transaction, ROLLED BACK. The final DO block RAISES listing every
-- failed check; on success it prints "050: all N checks passed".
--
-- Fixture dates are in January 2020 (Cairo = UTC+2, no DST), long before any
-- seeded or real student exists, so the expected counts are exact.
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

-- A real auth.users row -> signup trigger -> profile (same helper as 048/049).
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
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', 'T', 'academic_year', 2, 'username', 'u_' || substr(replace(new_id::text, '-', ''), 1, 12)), false,
    '', '', '', ''
  );
  RETURN new_id;
END $$;

CREATE TEMP TABLE t_ctx (k TEXT PRIMARY KEY, v TEXT);

-- ---------------------------------------------------------------------
-- 1. Fixture. Cairo is UTC+2 in January, so 21:30Z is 23:30 Cairo and
--    22:30Z is 00:30 the NEXT Cairo day.
--
--   A  signs up 10 Jan 10:00Z, confirmed. Finishes at 10 Jan 21:30Z
--      (Cairo 10 Jan), 10 Jan 22:30Z (Cairo 11 Jan), 12 Jan 08:00Z
--      (Cairo 12 Jan)  -> 2nd finish and 2nd Cairo day at 22:30Z, 3rd day on 12 Jan
--   B  signs up 10 Jan 10:00Z, never confirms, no activity
--   C  signs up 11 Jan 10:00Z, confirmed. Started a chapter (answers saved)
--      at 11 Jan 12:00Z, never finished
--   D  signs up 11 Jan 10:00Z, confirmed. Two finishes the SAME Cairo day
--      (11 Jan 10:00Z and 11:00Z) -> 2 finishes but only 1 day
--   X  an admin who signs up 10 Jan: must never be counted
-- ---------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.mk_user('ret050a@test.local');
  sb UUID := pg_temp.mk_user('ret050b@test.local');
  sc UUID := pg_temp.mk_user('ret050c@test.local');
  sd UUID := pg_temp.mk_user('ret050d@test.local');
  sx UUID := pg_temp.mk_user('ret050x@test.local');
  ch RECORD;
  slug TEXT;
BEGIN
  SELECT c.id, c.subject_id INTO ch FROM chapters c LIMIT 1;
  SELECT subjects.slug INTO slug FROM subjects WHERE id = ch.subject_id;

  UPDATE public.profiles SET created_at = '2020-01-10T10:00:00Z' WHERE id IN (sa, sb, sx);
  UPDATE public.profiles SET created_at = '2020-01-11T10:00:00Z' WHERE id IN (sc, sd);
  -- prevent_role_elevation() only lets the service role change a role.
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  UPDATE public.profiles SET role = 'admin' WHERE id = sx;
  PERFORM set_config('request.jwt.claim.role', '', true);

  UPDATE auth.users SET email_confirmed_at = '2020-01-10T10:05:00Z' WHERE id IN (sa, sx);
  UPDATE auth.users SET email_confirmed_at = NULL WHERE id = sb;
  UPDATE auth.users SET email_confirmed_at = '2020-01-11T10:05:00Z' WHERE id IN (sc, sd);

  INSERT INTO quiz_sessions (student_id, subject_id, chapter_id, answers, score, total_questions, accuracy, violations_count, completed_at)
  VALUES
    (sa, slug, ch.id, '{}'::jsonb, 0, 1, 0, 0, '2020-01-10T21:30:00Z'),
    (sa, slug, ch.id, '{}'::jsonb, 0, 1, 0, 0, '2020-01-10T22:30:00Z'),
    (sa, slug, ch.id, '{}'::jsonb, 0, 1, 0, 0, '2020-01-12T08:00:00Z'),
    (sd, slug, ch.id, '{}'::jsonb, 0, 1, 0, 0, '2020-01-11T10:00:00Z'),
    (sd, slug, ch.id, '{}'::jsonb, 0, 1, 0, 0, '2020-01-11T11:00:00Z'),
    (sx, slug, ch.id, '{}'::jsonb, 0, 1, 0, 0, '2020-01-10T12:00:00Z');

  INSERT INTO chapter_quiz_progress (student_id, chapter_id, subject_id, answers, current_question_index, total_questions, started_at, updated_at)
  VALUES (sc, ch.id, slug, '{"1":"a"}'::jsonb, 0, 5, '2020-01-11T12:00:00Z', '2020-01-11T12:00:00Z');

  INSERT INTO t_ctx VALUES ('a', sa::TEXT), ('b', sb::TEXT), ('adm', sx::TEXT);
END $$;

-- Calls the function as a given role, returns 'ok' or the SQLSTATE it raised.
CREATE FUNCTION pg_temp.try_call(p_uid UUID, p_role TEXT, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_step TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE st TEXT := 'ok';
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid::TEXT, 'role', p_role)::TEXT, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    PERFORM 1 FROM public.admin_retention_series(p_from, p_to, p_step) LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    st := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN st;
END $$;

-- ---------------------------------------------------------------------
-- 2. Series as the admin (daily and hourly), through the real API role
-- ---------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT v FROM t_ctx WHERE k = 'adm'), 'role', 'authenticated')::TEXT, true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE t_day  AS SELECT * FROM public.admin_retention_series('2020-01-10T12:00:00Z', '2020-01-12T12:00:00Z', 'day');
CREATE TEMP TABLE t_hour AS SELECT * FROM public.admin_retention_series('2020-01-10T21:10:00Z', '2020-01-10T23:10:00Z', 'hour');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

CREATE FUNCTION pg_temp.fmt(tbl TEXT, p_t TIMESTAMPTZ) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE r TEXT;
BEGIN
  EXECUTE format(
    'SELECT signed_up || '','' || confirmed || '','' || started || '','' || finished_1 || '','' || finished_2 || '','' || days_2 || '','' || days_3 FROM %I WHERE t = $1',
    tbl) INTO r USING p_t;
  RETURN r;
END $$;

SELECT pg_temp.chk('day: one point per Cairo day', '3', (SELECT count(*) FROM t_day)::TEXT);
SELECT pg_temp.chk('day: first point is the END of that Cairo day (22:00Z in winter)', '2020-01-10T22:00',
  (SELECT to_char(min(t) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') FROM t_day));
-- A: 1 finish; B unconfirmed; the 22:30Z finish is already Cairo 11 Jan, so NOT counted yet.
SELECT pg_temp.chk('day: end of 10 Jan', '2,1,1,1,0,0,0', pg_temp.fmt('t_day', '2020-01-10T22:00:00Z'));
-- C started (progress), D 2 finishes on ONE day (so days_2 stays 1 = only A).
SELECT pg_temp.chk('day: end of 11 Jan', '4,3,3,2,2,1,0', pg_temp.fmt('t_day', '2020-01-11T22:00:00Z'));
SELECT pg_temp.chk('day: end of 12 Jan (A reaches a 3rd day)', '4,3,3,2,2,1,1', pg_temp.fmt('t_day', '2020-01-12T22:00:00Z'));

SELECT pg_temp.chk('hour: three points (end of 21:00, 22:00, 23:00 hours)', '3', (SELECT count(*) FROM t_hour)::TEXT);
SELECT pg_temp.chk('hour: at 22:00Z, 2nd finish (22:30Z) not reached', '0,0', (SELECT finished_2 || ',' || days_2 FROM t_hour WHERE t = '2020-01-10T22:00:00Z'));
SELECT pg_temp.chk('hour: at 23:00Z, 2nd finish and 2nd day reached', '1,1', (SELECT finished_2 || ',' || days_2 FROM t_hour WHERE t = '2020-01-10T23:00:00Z'));
SELECT pg_temp.chk('hour: signups at 23:00Z (A and B only, not the admin)', '2', (SELECT signed_up::TEXT FROM t_hour WHERE t = '2020-01-10T23:00:00Z'));

-- ---------------------------------------------------------------------
-- 3. Guards
-- ---------------------------------------------------------------------
SELECT pg_temp.chk('admin: a valid call succeeds', 'ok',
  pg_temp.try_call((SELECT v::UUID FROM t_ctx WHERE k = 'adm'), 'authenticated', '2020-01-10T12:00:00Z', '2020-01-11T12:00:00Z', 'day'));
SELECT pg_temp.chk('a student is refused (admin_only)', '42501',
  pg_temp.try_call((SELECT v::UUID FROM t_ctx WHERE k = 'a'), 'authenticated', '2020-01-10T12:00:00Z', '2020-01-11T12:00:00Z', 'day'));
SELECT pg_temp.chk('anon cannot execute it', '42501',
  pg_temp.try_call(NULL, 'anon', '2020-01-10T12:00:00Z', '2020-01-11T12:00:00Z', 'day'));
SELECT pg_temp.chk('admin: unknown step is rejected', '22023',
  pg_temp.try_call((SELECT v::UUID FROM t_ctx WHERE k = 'adm'), 'authenticated', '2020-01-10T12:00:00Z', '2020-01-11T12:00:00Z', 'week'));
SELECT pg_temp.chk('admin: to before from is rejected', '22023',
  pg_temp.try_call((SELECT v::UUID FROM t_ctx WHERE k = 'adm'), 'authenticated', '2020-01-11T12:00:00Z', '2020-01-10T12:00:00Z', 'day'));
SELECT pg_temp.chk('admin: more than 100 points is rejected', '22023',
  pg_temp.try_call((SELECT v::UUID FROM t_ctx WHERE k = 'adm'), 'authenticated', '2019-01-01T00:00:00Z', '2020-01-01T00:00:00Z', 'day'));

SELECT pg_temp.chk('the function is not executable by anon or PUBLIC', 'false,false',
  has_function_privilege('anon', 'public.admin_retention_series(timestamptz, timestamptz, text)', 'EXECUTE')::TEXT || ',' ||
  has_function_privilege('public', 'public.admin_retention_series(timestamptz, timestamptz, text)', 'EXECUTE')::TEXT);

-- ---------------------------------------------------------------------
-- Verdict
-- ---------------------------------------------------------------------
DO $$
DECLARE bad INT; total INT;
BEGIN
  SELECT count(*) FILTER (WHERE NOT ok), count(*) INTO bad, total FROM t_results;
  IF bad > 0 THEN
    RAISE EXCEPTION '050: % of % checks FAILED: %', bad, total, (
      SELECT string_agg(name || ' (expected ' || coalesce(expected, 'NULL')
                        || ', got ' || coalesce(actual, 'NULL') || ')', '; ' ORDER BY n)
      FROM t_results WHERE NOT ok);
  END IF;
  RAISE NOTICE '050: all % checks passed', total;
END $$;

ROLLBACK;
