-- =====================================================================
-- Migration 033 verification — student question reports (question_flags).
--
-- Run AFTER migrations 001-033 AND supabase/seed.sql (the seed grants the
-- API roles table privileges, which hosted projects have by default),
-- against a NON-PRODUCTION database:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/033_question_flags.sql
--
-- Everything runs in one transaction that is ROLLED BACK, so no fixture
-- users/rows remain. Each case impersonates a role the way PostgREST
-- does (SET LOCAL ROLE + request.jwt.claims). The final DO block RAISES
-- listing every failed check (non-zero exit under ON_ERROR_STOP);
-- on success it prints "033: all N checks passed".
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
-- Fixtures: two students, one admin, one published question
-- ---------------------------------------------------------------------
CREATE TEMP TABLE t_ids AS
  SELECT pg_temp.mk_user('t033_a@example.test') AS a,
         pg_temp.mk_user('t033_b@example.test') AS b,
         pg_temp.mk_user('t033_admin@example.test') AS adm;

-- prevent_role_elevation() only lets service_role change a role, so
-- promote the admin the way the real service does, then drop the claim.
SELECT set_config('request.jwt.claim.role', 'service_role', true);
UPDATE public.profiles SET role = 'admin' WHERE id = (SELECT adm FROM t_ids);
SELECT set_config('request.jwt.claim.role', '', true);

CREATE TEMP TABLE t_q AS
  WITH ins AS (
    INSERT INTO public.questions
      (subject_id, subject_bundle_id, question, choices, correct_answer, topic, status)
    VALUES
      ('t033-subject', 1, 'Flag test question',
       '[{"id":"a","text":"Right"},{"id":"b","text":"Wrong"}]'::jsonb, 'a', 't033', 'published')
    RETURNING id
  )
  SELECT id FROM ins;

-- ---------------------------------------------------------------------
-- 1. Students: insert as yourself, read your own, nothing else
-- ---------------------------------------------------------------------
DO $$
DECLARE a UUID := (SELECT a FROM t_ids); b UUID := (SELECT b FROM t_ids);
        q BIGINT := (SELECT id FROM t_q); r TEXT;
BEGIN
  r := pg_temp.as_role('authenticated', a,
         format('INSERT INTO public.question_flags (question_id, student_id, reason, detail) VALUES (%s, %L, ''wrong_answer'', ''key is wrong'')', q, a));
  PERFORM pg_temp.chk('student CAN report a question as themselves', 'allowed:1', r);
  PERFORM pg_temp.chk('...trigger raised questions.flag_count to 1', '1',
    (SELECT flag_count FROM public.questions WHERE id = q)::TEXT);

  r := pg_temp.as_role('authenticated', a,
         format('INSERT INTO public.question_flags (question_id, student_id, reason) VALUES (%s, %L, ''typo'')', q, b));
  PERFORM pg_temp.chk('student cannot report AS another student', 'blocked:42501', r);

  r := pg_temp.as_role('authenticated', a,
         format('INSERT INTO public.question_flags (question_id, student_id, reason) VALUES (%s, %L, ''typo'')', q, a));
  PERFORM pg_temp.chk('a second report on the same question is a unique violation', 'blocked:23505', r);

  PERFORM pg_temp.chk('student CAN read their own report', 'allowed:1',
    pg_temp.as_role('authenticated', a,
      format('SELECT 1 FROM public.question_flags WHERE student_id = %L', a)));
  PERFORM pg_temp.chk('another student cannot read it', 'allowed:0',
    pg_temp.as_role('authenticated', b,
      format('SELECT 1 FROM public.question_flags WHERE student_id = %L', a)));
END $$;

-- ---------------------------------------------------------------------
-- 2. Students can NOT edit, resolve or delete a report
-- ---------------------------------------------------------------------
DO $$
DECLARE a UUID := (SELECT a FROM t_ids); b UUID := (SELECT b FROM t_ids);
        q BIGINT := (SELECT id FROM t_q); r TEXT;
BEGIN
  r := pg_temp.as_role('authenticated', a,
         format('UPDATE public.question_flags SET resolved = true WHERE question_id = %s', q));
  PERFORM pg_temp.chk('reporter cannot resolve their own report', 'allowed:0', r);
  PERFORM pg_temp.chk('...it is still open', 'false',
    (SELECT resolved FROM public.question_flags WHERE question_id = q)::TEXT);

  r := pg_temp.as_role('authenticated', a,
         format('UPDATE public.question_flags SET detail = ''edited'' WHERE question_id = %s', q));
  PERFORM pg_temp.chk('reporter cannot edit their report', 'allowed:0', r);

  r := pg_temp.as_role('authenticated', a,
         format('DELETE FROM public.question_flags WHERE question_id = %s', q));
  PERFORM pg_temp.chk('reporter cannot delete their report', 'allowed:0', r);

  r := pg_temp.as_role('authenticated', b,
         format('UPDATE public.question_flags SET resolved = true WHERE question_id = %s', q));
  PERFORM pg_temp.chk('another student cannot resolve it either', 'allowed:0', r);
  PERFORM pg_temp.chk('...the report and the counter are intact', '1',
    (SELECT flag_count FROM public.questions WHERE id = q)::TEXT);
END $$;

-- ---------------------------------------------------------------------
-- 3. Value constraints (reason vocabulary, detail length)
-- ---------------------------------------------------------------------
DO $$
DECLARE b UUID := (SELECT b FROM t_ids); q BIGINT := (SELECT id FROM t_q); r TEXT;
BEGIN
  r := pg_temp.as_role('authenticated', b,
         format('INSERT INTO public.question_flags (question_id, student_id, reason) VALUES (%s, %L, ''spam'')', q, b));
  PERFORM pg_temp.chk('unknown reason is rejected', 'blocked:23514', r);

  r := pg_temp.as_role('authenticated', b,
         format('INSERT INTO public.question_flags (question_id, student_id, reason, detail) VALUES (%s, %L, ''other'', repeat(''x'', 1001))', q, b));
  PERFORM pg_temp.chk('a detail over 1000 characters is rejected', 'blocked:23514', r);

  r := pg_temp.as_role('authenticated', b,
         format('INSERT INTO public.question_flags (question_id, student_id, reason, detail) VALUES (%s, %L, ''other'', repeat(''x'', 1000))', q, b));
  PERFORM pg_temp.chk('a detail of exactly 1000 characters is accepted', 'allowed:1', r);
  PERFORM pg_temp.chk('...two open reports now count against the question', '2',
    (SELECT flag_count FROM public.questions WHERE id = q)::TEXT);
END $$;

-- ---------------------------------------------------------------------
-- 4. Anonymous callers
-- ---------------------------------------------------------------------
DO $$
DECLARE a UUID := (SELECT a FROM t_ids); q BIGINT := (SELECT id FROM t_q); r TEXT;
BEGIN
  r := pg_temp.as_role('anon', NULL,
         format('INSERT INTO public.question_flags (question_id, student_id, reason) VALUES (%s, %L, ''typo'')', q, a));
  PERFORM pg_temp.chk('anon cannot report', 'blocked:42501', r);
  PERFORM pg_temp.chk('anon cannot read reports', 'allowed:0',
    pg_temp.as_role('anon', NULL, 'SELECT 1 FROM public.question_flags'));
END $$;

-- ---------------------------------------------------------------------
-- 5. Admins: read every report, resolve/reopen, counter follows
-- ---------------------------------------------------------------------
DO $$
DECLARE adm UUID := (SELECT adm FROM t_ids); a UUID := (SELECT a FROM t_ids);
        q BIGINT := (SELECT id FROM t_q); r TEXT;
BEGIN
  PERFORM pg_temp.chk('admin CAN read every student''s reports', 'allowed:2',
    pg_temp.as_role('authenticated', adm,
      format('SELECT 1 FROM public.question_flags WHERE question_id = %s', q)));

  r := pg_temp.as_role('authenticated', adm,
         format('UPDATE public.question_flags SET resolved = true, resolved_at = now(), resolved_by = %L WHERE student_id = %L', adm, a));
  PERFORM pg_temp.chk('admin CAN resolve a report', 'allowed:1', r);
  PERFORM pg_temp.chk('...resolved_by / resolved_at were recorded', 'true',
    (SELECT (resolved_by = adm AND resolved_at IS NOT NULL)
       FROM public.question_flags WHERE student_id = a)::TEXT);
  PERFORM pg_temp.chk('...flag_count now counts only the unresolved one', '1',
    (SELECT flag_count FROM public.questions WHERE id = q)::TEXT);

  r := pg_temp.as_role('authenticated', adm,
         format('UPDATE public.question_flags SET resolved = false, resolved_at = NULL, resolved_by = NULL WHERE student_id = %L', a));
  PERFORM pg_temp.chk('admin CAN reopen it', 'allowed:1', r);
  PERFORM pg_temp.chk('...flag_count is back to 2', '2',
    (SELECT flag_count FROM public.questions WHERE id = q)::TEXT);
END $$;

-- ---------------------------------------------------------------------
-- Verdict
-- ---------------------------------------------------------------------
DO $$
DECLARE bad INT; total INT;
BEGIN
  SELECT count(*) FILTER (WHERE NOT ok), count(*) INTO bad, total FROM t_results;
  IF bad > 0 THEN
    RAISE EXCEPTION '033: % of % checks FAILED: %', bad, total, (
      SELECT string_agg(name || ' (expected ' || coalesce(expected, 'NULL')
                        || ', got ' || coalesce(actual, 'NULL') || ')', '; ' ORDER BY n)
      FROM t_results WHERE NOT ok);
  END IF;
  RAISE NOTICE '033: all % checks passed', total;
END $$;

ROLLBACK;
