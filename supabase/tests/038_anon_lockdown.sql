-- =====================================================================
-- Migration 038 verification — anonymous access lockdown.
--
-- Run AFTER migrations 001-038 AND supabase/seed.sql, against a
-- NON-PRODUCTION database:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/038_anon_lockdown.sql
--
-- One transaction, ROLLED BACK. Each case impersonates a role the way
-- PostgREST does (SET LOCAL ROLE + request.jwt.claims). The final DO
-- block RAISES listing every failed check; on success it prints
-- "038: all N checks passed".
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

-- 'val:<first column as text>' | 'blocked:<sqlstate>'
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

CREATE TEMP TABLE t_ids AS SELECT pg_temp.mk_user('t038_a@example.test') AS a;

-- ---------------------------------------------------------------------
-- 1. anon is shut out of every private table (42501 = permission denied)
-- ---------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'questions', 'reference_pages', 'reference_books', 'subjects',
    'module_subjects', 'badges', 'profiles', 'notes', 'bookmarks',
    'quiz_sessions', 'daily_streaks', 'question_flags', 'activity_log',
    'violations', 'friends'
  ] LOOP
    PERFORM pg_temp.chk('anon cannot SELECT public.' || t, 'blocked:42501',
      pg_temp.as_role_val('anon', NULL, format('SELECT count(*) FROM public.%I', t)));
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2. anon CAN still do what the landing page needs — and only that
-- ---------------------------------------------------------------------
SELECT pg_temp.chk('anon can count modules (landing page)', 'val:' || (SELECT count(*) FROM public.modules),
  pg_temp.as_role_val('anon', NULL, 'SELECT count(*) FROM public.modules'));
SELECT pg_temp.chk('anon can sum chapters.published_count (landing page)', 'true',
  CASE WHEN pg_temp.as_role_val('anon', NULL,
    'SELECT coalesce(sum(published_count),0) FROM public.chapters') LIKE 'val:%'
  THEN 'true' ELSE 'false' END);
SELECT pg_temp.chk('anon can read landing module columns', 'true',
  CASE WHEN pg_temp.as_role_val('anon', NULL,
    'SELECT count(code) + count(name) + count(year_num) FROM public.modules') LIKE 'val:%'
  THEN 'true' ELSE 'false' END);

-- ... but not the internal columns, and not SELECT *
SELECT pg_temp.chk('anon cannot read chapters.flagged_count', 'blocked:42501',
  pg_temp.as_role_val('anon', NULL, 'SELECT count(flagged_count) FROM public.chapters'));
SELECT pg_temp.chk('anon cannot read chapters.question_count', 'blocked:42501',
  pg_temp.as_role_val('anon', NULL, 'SELECT count(question_count) FROM public.chapters'));
SELECT pg_temp.chk('anon cannot read modules.book_id', 'blocked:42501',
  pg_temp.as_role_val('anon', NULL, 'SELECT count(book_id) FROM public.modules'));
SELECT pg_temp.chk('anon cannot SELECT * from modules', 'blocked:42501',
  pg_temp.as_role_val('anon', NULL, 'SELECT count(*) FROM (SELECT * FROM public.modules) m'));

-- ---------------------------------------------------------------------
-- 3. anon has no write/DDL-ish privilege anywhere in public
-- ---------------------------------------------------------------------
SELECT pg_temp.chk('anon holds no INSERT/UPDATE/DELETE/TRUNCATE on any public table', '0',
  (SELECT count(*) FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee = 'anon'
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))::TEXT);
SELECT pg_temp.chk('anon cannot INSERT into modules', 'blocked:42501',
  pg_temp.as_role_val('anon', NULL,
    $q$INSERT INTO public.modules (code, name) VALUES ('X', 'x') RETURNING code$q$));
SELECT pg_temp.chk('anon holds no sequence privileges', '0',
  (SELECT count(*) FROM information_schema.role_usage_grants
   WHERE object_schema = 'public' AND object_type = 'SEQUENCE' AND grantee = 'anon')::TEXT);

-- ---------------------------------------------------------------------
-- 4. signed-in students are unaffected
-- ---------------------------------------------------------------------
DO $$
DECLARE a UUID := (SELECT a FROM t_ids);
BEGIN
  PERFORM pg_temp.chk('student still reads published questions',
    'val:' || (SELECT count(*) FROM public.questions WHERE status = 'published'),
    pg_temp.as_role_val('authenticated', a,
      $q$SELECT count(*) FROM public.questions WHERE status = 'published'$q$));
  PERFORM pg_temp.chk('student still reads reference_books',
    'val:' || (SELECT count(*) FROM public.reference_books),
    pg_temp.as_role_val('authenticated', a, 'SELECT count(*) FROM public.reference_books'));
  PERFORM pg_temp.chk('student still reads subjects',
    'val:' || (SELECT count(*) FROM public.subjects),
    pg_temp.as_role_val('authenticated', a, 'SELECT count(*) FROM public.subjects'));
  PERFORM pg_temp.chk('student still reads full chapters row (all columns)', 'true',
    CASE WHEN pg_temp.as_role_val('authenticated', a,
      'SELECT count(flagged_count) FROM public.chapters') LIKE 'val:%'
    THEN 'true' ELSE 'false' END);
  PERFORM pg_temp.chk('student still sees only their own profile', 'val:1',
    pg_temp.as_role_val('authenticated', a, 'SELECT count(*) FROM public.profiles'));
END $$;

-- authenticated lost the RLS-bypassing / unused privileges
SELECT pg_temp.chk('authenticated has no TRUNCATE on notes', 'false',
  has_table_privilege('authenticated', 'public.notes', 'TRUNCATE')::TEXT);
SELECT pg_temp.chk('authenticated has no TRIGGER on notes', 'false',
  has_table_privilege('authenticated', 'public.notes', 'TRIGGER')::TEXT);
SELECT pg_temp.chk('authenticated keeps DML on notes (RLS gates the rows)', 'true',
  (has_table_privilege('authenticated', 'public.notes', 'INSERT')
   AND has_table_privilege('authenticated', 'public.notes', 'UPDATE'))::TEXT);

-- ---------------------------------------------------------------------
-- 5. policies: the sensitive reads are authenticated-only
-- ---------------------------------------------------------------------
DO $$
DECLARE p TEXT[];
BEGIN
  FOREACH p SLICE 1 IN ARRAY ARRAY[
    ['questions', 'questions_read_published'],
    ['subjects', 'subjects_public_read'],
    ['module_subjects', 'module_subjects_public_read'],
    ['reference_books', 'reference_books_public_read'],
    ['reference_pages', 'reference_pages_public_read'],
    ['badges', 'badges_public_read']
  ] LOOP
    PERFORM pg_temp.chk('policy ' || p[2] || ' is TO authenticated only', '{authenticated}',
      (SELECT roles::text FROM pg_policies
       WHERE schemaname = 'public' AND tablename = p[1] AND policyname = p[2]));
  END LOOP;
END $$;

-- Tables created by `postgres` (every migration) don't auto-grant to anon.
-- (supabase_admin's own default ACL is Supabase-internal, only governs
-- tables that role creates, and postgres can't alter it.)
SELECT pg_temp.chk('postgres default privileges no longer grant anon on new tables/sequences', '0',
  (SELECT count(*) FROM pg_default_acl d
   WHERE d.defaclnamespace = 'public'::regnamespace
     AND pg_get_userbyid(d.defaclrole) = 'postgres'
     AND d.defaclobjtype IN ('r', 'S')
     AND d.defaclacl::text LIKE '%anon=%')::TEXT);

-- ---------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------
DO $$
DECLARE bad TEXT; total INT;
BEGIN
  SELECT count(*) INTO total FROM t_results;
  SELECT string_agg(format('  #%s %s  (expected %s, got %s)', n, name, expected, actual), E'\n')
    INTO bad FROM t_results WHERE NOT ok;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION E'038: failed checks:\n%', bad;
  END IF;
  RAISE NOTICE '038: all % checks passed', total;
END $$;

ROLLBACK;
