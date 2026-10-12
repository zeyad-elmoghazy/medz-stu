-- =====================================================================
-- Migration 030 verification — academic year, signup trigger, constraints.
--
-- Run AFTER migrations 001-030, against a NON-PRODUCTION database:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/030_academic_year.sql
--
-- Everything runs inside one transaction. On success it is rolled back,
-- so no fixture users or profiles are left behind. On any failed check
-- the final DO block raises, listing every failure (non-zero exit under
-- ON_ERROR_STOP, and the aborted transaction leaves nothing behind
-- either). On success it prints "030: all N checks passed".
-- =====================================================================

BEGIN;

CREATE TEMP TABLE t_results (
  n        SERIAL PRIMARY KEY,
  name     TEXT NOT NULL,
  expected TEXT,
  actual   TEXT,
  ok       BOOLEAN NOT NULL
);

CREATE FUNCTION pg_temp.chk(p_name TEXT, p_expected TEXT, p_actual TEXT)
RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO t_results (name, expected, actual, ok)
  VALUES (p_name, p_expected, p_actual, p_expected IS NOT DISTINCT FROM p_actual);
$$;

-- Insert a real auth.users row (fires the real on_auth_user_created trigger).
CREATE FUNCTION pg_temp.mk_user(p_email TEXT, p_meta JSONB)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  new_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    p_email, '', now(), now(), now(),
    '{"provider":"email","providers":["email"]}', p_meta, false,
    '', '', '', ''
  );
  RETURN new_id;
END
$$;

-- ---------------------------------------------------------------------
-- 1. academic_session(): sessions start 1 Sep, Africa/Cairo (UTC+3 in
--    summer, so 1 Sep 00:00 Cairo = 31 Aug 21:00 UTC).
-- ---------------------------------------------------------------------
SELECT pg_temp.chk('session: 31 Aug 20:59:59Z is still the previous session',
  '2025', public.academic_session('2026-08-31 20:59:59+00')::TEXT);
SELECT pg_temp.chk('session: 31 Aug 21:00:00Z (= 1 Sep Cairo) starts the new session',
  '2026', public.academic_session('2026-08-31 21:00:00+00')::TEXT);
SELECT pg_temp.chk('session: mid-year (Jan) belongs to the session that started the previous Sep',
  '2026', public.academic_session('2027-01-15 12:00:00+00')::TEXT);
SELECT pg_temp.chk('session: June belongs to the session that started the previous Sep',
  '2026', public.academic_session('2027-06-30 12:00:00+00')::TEXT);
SELECT pg_temp.chk('session: December belongs to the session that just started',
  '2026', public.academic_session('2026-12-31 12:00:00+00')::TEXT);
SELECT pg_temp.chk('session: default argument is now()',
  public.academic_session(now())::TEXT, public.academic_session()::TEXT);

-- ---------------------------------------------------------------------
-- 2. Signup trigger: year validation and the role fix.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  u UUID;
  p RECORD;
BEGIN
  -- Valid year + a forged admin role.
  u := pg_temp.mk_user('t030_valid@example.test',
    '{"full_name":"T Valid","academic_year":3,"role":"admin"}');
  SELECT * INTO p FROM public.profiles WHERE id = u;
  PERFORM pg_temp.chk('trigger: forged role=admin in metadata is ignored', 'student', p.role);
  PERFORM pg_temp.chk('trigger: valid year is stored', '3', p.academic_year::TEXT);
  PERFORM pg_temp.chk('trigger: session is stamped from the signup date',
    public.academic_session(now())::TEXT, p.academic_year_session::TEXT);
  PERFORM pg_temp.chk('trigger: name is stored', 'T Valid', p.full_name);
  PERFORM pg_temp.chk('trigger: notification prefs default to on',
    'true/true', p.notify_email::TEXT || '/' || p.notify_reminders::TEXT);

  -- The year arriving as a JSON string is still accepted.
  u := pg_temp.mk_user('t030_string@example.test', '{"full_name":"T","academic_year":"4"}');
  SELECT * INTO p FROM public.profiles WHERE id = u;
  PERFORM pg_temp.chk('trigger: year sent as a string "4" is accepted', '4', p.academic_year::TEXT);

  -- Boundaries of the accepted range.
  u := pg_temp.mk_user('t030_min@example.test', '{"academic_year":1}');
  SELECT * INTO p FROM public.profiles WHERE id = u;
  PERFORM pg_temp.chk('trigger: year 1 is accepted', '1', p.academic_year::TEXT);
  u := pg_temp.mk_user('t030_max@example.test', '{"academic_year":5}');
  SELECT * INTO p FROM public.profiles WHERE id = u;
  PERFORM pg_temp.chk('trigger: year 5 is accepted', '5', p.academic_year::TEXT);

  -- Anything invalid is stored as "not chosen" (year AND session null).
  u := pg_temp.mk_user('t030_six@example.test', '{"academic_year":6}');
  SELECT * INTO p FROM public.profiles WHERE id = u;
  PERFORM pg_temp.chk('trigger: year 6 is rejected to null/null',
    'NULL/NULL', coalesce(p.academic_year::TEXT, 'NULL') || '/' || coalesce(p.academic_year_session::TEXT, 'NULL'));

  u := pg_temp.mk_user('t030_zero@example.test', '{"academic_year":0}');
  SELECT * INTO p FROM public.profiles WHERE id = u;
  PERFORM pg_temp.chk('trigger: year 0 is rejected to null/null',
    'NULL/NULL', coalesce(p.academic_year::TEXT, 'NULL') || '/' || coalesce(p.academic_year_session::TEXT, 'NULL'));

  u := pg_temp.mk_user('t030_junk@example.test', '{"academic_year":"abc"}');
  SELECT * INTO p FROM public.profiles WHERE id = u;
  PERFORM pg_temp.chk('trigger: non-numeric year is rejected to null/null',
    'NULL/NULL', coalesce(p.academic_year::TEXT, 'NULL') || '/' || coalesce(p.academic_year_session::TEXT, 'NULL'));

  u := pg_temp.mk_user('t030_frac@example.test', '{"academic_year":2.5}');
  SELECT * INTO p FROM public.profiles WHERE id = u;
  PERFORM pg_temp.chk('trigger: fractional year is rejected to null/null',
    'NULL/NULL', coalesce(p.academic_year::TEXT, 'NULL') || '/' || coalesce(p.academic_year_session::TEXT, 'NULL'));

  -- Existing-style signup with no year at all (what old clients send).
  u := pg_temp.mk_user('t030_none@example.test', '{"full_name":"Old Client","role":"student"}');
  SELECT * INTO p FROM public.profiles WHERE id = u;
  PERFORM pg_temp.chk('trigger: signup without a year still works',
    'student/NULL/NULL', p.role || '/' || coalesce(p.academic_year::TEXT, 'NULL') || '/' || coalesce(p.academic_year_session::TEXT, 'NULL'));
END
$$;

-- ---------------------------------------------------------------------
-- 3. Table constraints.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  u UUID;
  r TEXT;
BEGIN
  u := pg_temp.mk_user('t030_constraints@example.test', '{"full_name":"C"}');

  r := 'allowed';
  BEGIN
    UPDATE public.profiles SET academic_year = 2 WHERE id = u;  -- session left null
  EXCEPTION WHEN check_violation THEN r := 'check_violation'; END;
  PERFORM pg_temp.chk('constraint: a year without a session is rejected', 'check_violation', r);

  r := 'allowed';
  BEGIN
    UPDATE public.profiles SET academic_year_session = 2026 WHERE id = u;  -- year left null
  EXCEPTION WHEN check_violation THEN r := 'check_violation'; END;
  PERFORM pg_temp.chk('constraint: a session without a year is rejected', 'check_violation', r);

  r := 'allowed';
  BEGIN
    UPDATE public.profiles SET academic_year = 6, academic_year_session = 2026 WHERE id = u;
  EXCEPTION WHEN check_violation THEN r := 'check_violation'; END;
  PERFORM pg_temp.chk('constraint: year 6 is rejected', 'check_violation', r);

  r := 'allowed';
  BEGIN
    UPDATE public.profiles SET academic_year = 0, academic_year_session = 2026 WHERE id = u;
  EXCEPTION WHEN check_violation THEN r := 'check_violation'; END;
  PERFORM pg_temp.chk('constraint: year 0 is rejected', 'check_violation', r);

  r := 'allowed';
  BEGIN
    UPDATE public.profiles SET academic_year = 5, academic_year_session = 2026 WHERE id = u;
  EXCEPTION WHEN check_violation THEN r := 'check_violation'; END;
  PERFORM pg_temp.chk('constraint: a valid year/session pair is accepted', 'allowed', r);

  r := 'allowed';
  BEGIN
    UPDATE public.profiles SET username = 'Bad Name' WHERE id = u;
  EXCEPTION WHEN check_violation THEN r := 'check_violation'; END;
  PERFORM pg_temp.chk('constraint: username with a space/uppercase is rejected', 'check_violation', r);

  r := 'allowed';
  BEGIN
    UPDATE public.profiles SET username = 'ab' WHERE id = u;
  EXCEPTION WHEN check_violation THEN r := 'check_violation'; END;
  PERFORM pg_temp.chk('constraint: 2-char username is rejected', 'check_violation', r);

  r := 'allowed';
  BEGIN
    UPDATE public.profiles SET username = 'ok_name_1' WHERE id = u;
  EXCEPTION WHEN check_violation THEN r := 'check_violation'; END;
  PERFORM pg_temp.chk('constraint: a valid username is accepted', 'allowed', r);

  -- Usernames are unique (the PATCH route maps this to HTTP 409).
  r := 'allowed';
  BEGIN
    UPDATE public.profiles SET username = 'ok_name_1'
    WHERE id = (SELECT id FROM public.profiles WHERE email = 't030_valid@example.test');
  EXCEPTION WHEN unique_violation THEN r := 'unique_violation'; END;
  PERFORM pg_temp.chk('constraint: duplicate username is rejected', 'unique_violation', r);
END
$$;

-- ---------------------------------------------------------------------
-- 4. Account deletion cascades from auth.users through profiles to every
--    student-owned table (the DELETE /api/student/profile route relies
--    on this).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  u UUID;
  left_over INT;
BEGIN
  u := pg_temp.mk_user('t030_delete@example.test', '{"full_name":"Del","academic_year":2}');
  INSERT INTO public.bookmarks (student_id, question_id, subject_id) VALUES (u, 1, 'anatomy');
  INSERT INTO public.notes (student_id, question_id, subject_id, content) VALUES (u, 1, 'anatomy', 'n');
  INSERT INTO public.daily_streaks (student_id, streak_date) VALUES (u, CURRENT_DATE);
  INSERT INTO public.badges (student_id, badge_type) VALUES (u, 'streak_7');

  DELETE FROM auth.users WHERE id = u;

  SELECT (SELECT count(*) FROM public.profiles      WHERE id = u)
       + (SELECT count(*) FROM public.bookmarks     WHERE student_id = u)
       + (SELECT count(*) FROM public.notes         WHERE student_id = u)
       + (SELECT count(*) FROM public.daily_streaks WHERE student_id = u)
       + (SELECT count(*) FROM public.badges        WHERE student_id = u)
  INTO left_over;
  PERFORM pg_temp.chk('cascade: deleting the auth user removes the profile and its data', '0', left_over::TEXT);
END
$$;

-- ---------------------------------------------------------------------
-- Verdict
-- ---------------------------------------------------------------------
DO $$
DECLARE
  bad INT;
  total INT;
BEGIN
  SELECT count(*) FILTER (WHERE NOT ok), count(*) INTO bad, total FROM t_results;
  IF bad > 0 THEN
    RAISE EXCEPTION '030: % of % checks FAILED: %', bad, total, (
      SELECT string_agg(name || ' (expected ' || coalesce(expected, 'NULL')
                        || ', got ' || coalesce(actual, 'NULL') || ')', '; ' ORDER BY n)
      FROM t_results WHERE NOT ok
    );
  END IF;
  RAISE NOTICE '030: all % checks passed', total;
END
$$;

ROLLBACK;
