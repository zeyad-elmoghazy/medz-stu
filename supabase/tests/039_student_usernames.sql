-- =====================================================================
-- Migration 039 verification — student usernames.
--
-- Run AFTER migrations 001-039 AND supabase/seed.sql (the seed grants the
-- API roles table privileges, which hosted projects have by default),
-- against a NON-PRODUCTION database:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/039_student_usernames.sql
--
-- Everything runs in one transaction that is ROLLED BACK, so no fixture
-- users/rows remain. Each case impersonates a role the way PostgREST does
-- (SET LOCAL ROLE + request.jwt.claims). The final DO block RAISES listing
-- every failed check; on success it prints "039: all N checks passed".
--
-- Covers the LENIENT signup trigger from 039. The strict one is 040's
-- (supabase/tests/040_require_username_on_signup.sql).
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
CREATE FUNCTION pg_temp.mk_user(p_email TEXT, p_meta JSONB) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE new_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    p_email, '', now(), now(), now(),
    '{"provider":"email","providers":["email"]}', p_meta, false,
    '', '', '', ''
  );
  RETURN new_id;
END $$;

-- Run ONE statement as an API role and report the outcome:
--   'allowed:<rows>' | 'blocked:<sqlstate>' ; zero rows on a write is
--   'allowed:0' (RLS hides rows instead of erroring).
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

-- Same, but returns the error text the API would surface: 'MESSAGE|DETAIL',
-- or 'ok'.
CREATE FUNCTION pg_temp.as_role_err(p_role TEXT, p_uid UUID, p_sql TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE res TEXT; det TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', p_role, 'sub', p_uid)::text, true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql;
    res := 'ok';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS det = PG_EXCEPTION_DETAIL;
    res := SQLERRM || '|' || coalesce(det, '');
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  RETURN res;
END $$;

-- ---------------------------------------------------------------------
-- 1. is_reserved_username()
-- ---------------------------------------------------------------------
SELECT pg_temp.chk('reserved: admin',           'true',  public.is_reserved_username('admin')::TEXT);
SELECT pg_temp.chk('reserved: ADMIN (case)',    'true',  public.is_reserved_username('ADMIN')::TEXT);
SELECT pg_temp.chk('reserved: admin1 (digits)', 'true',  public.is_reserved_username('admin1')::TEXT);
SELECT pg_temp.chk('reserved: support_ (underscore)', 'true', public.is_reserved_username('support_')::TEXT);
SELECT pg_temp.chk('reserved: medizee_2024',    'true',  public.is_reserved_username('medizee_2024')::TEXT);
SELECT pg_temp.chk('reserved: you',             'true',  public.is_reserved_username('you')::TEXT);
SELECT pg_temp.chk('not reserved: administrator_ahmed', 'false', public.is_reserved_username('administrator_ahmed')::TEXT);
SELECT pg_temp.chk('not reserved: my_admin',    'false', public.is_reserved_username('my_admin')::TEXT);
SELECT pg_temp.chk('not reserved: dryemads1',   'false', public.is_reserved_username('dryemads1')::TEXT);
SELECT pg_temp.chk('not reserved: 12345 (digits only)', 'false', public.is_reserved_username('12345')::TEXT);
SELECT pg_temp.chk('reserved: NULL is NULL, not true', NULL, public.is_reserved_username(NULL)::TEXT);

SELECT pg_temp.chk('authenticated may EXECUTE is_reserved_username (the CHECK runs as the writer)', 'true',
  has_function_privilege('authenticated', 'public.is_reserved_username(text)', 'EXECUTE')::TEXT);
SELECT pg_temp.chk('anon may NOT EXECUTE is_reserved_username', 'false',
  has_function_privilege('anon', 'public.is_reserved_username(text)', 'EXECUTE')::TEXT);
SELECT pg_temp.chk('service_role may EXECUTE is_reserved_username', 'true',
  has_function_privilege('service_role', 'public.is_reserved_username(text)', 'EXECUTE')::TEXT);

-- ---------------------------------------------------------------------
-- 2. Lenient signup trigger: stores a usable username, never fails signup
-- ---------------------------------------------------------------------
CREATE TEMP TABLE t_ids (k TEXT PRIMARY KEY, id UUID);

DO $$
DECLARE u UUID;
BEGIN
  u := pg_temp.mk_user('t039_valid@example.test',
    '{"full_name":"T Valid","academic_year":2,"username":"  Valid_Name "}');
  INSERT INTO t_ids VALUES ('valid', u);
  PERFORM pg_temp.chk('signup: username is trimmed and lowercased', 'valid_name',
    (SELECT username FROM public.profiles WHERE id = u));
  PERFORM pg_temp.chk('signup: a first username does not start the cooldown clock', 'true',
    (SELECT (username_changed_at IS NULL)::TEXT FROM public.profiles WHERE id = u));

  u := pg_temp.mk_user('t039_none@example.test', '{"full_name":"T None","academic_year":2}');
  INSERT INTO t_ids VALUES ('none', u);
  PERFORM pg_temp.chk('signup: no username -> profile created with NULL (lenient)', 'true',
    (SELECT (count(*) = 1 AND bool_and(username IS NULL))::TEXT FROM public.profiles WHERE id = u));

  u := pg_temp.mk_user('t039_short@example.test', '{"full_name":"T","username":"ab"}');
  PERFORM pg_temp.chk('signup: too-short username -> NULL, signup still works', 'true',
    (SELECT (count(*) = 1 AND bool_and(username IS NULL))::TEXT FROM public.profiles WHERE id = u));

  u := pg_temp.mk_user('t039_space@example.test', '{"full_name":"T","username":"has space"}');
  PERFORM pg_temp.chk('signup: username with a space -> NULL', 'true',
    (SELECT (count(*) = 1 AND bool_and(username IS NULL))::TEXT FROM public.profiles WHERE id = u));

  u := pg_temp.mk_user('t039_reserved@example.test', '{"full_name":"T","username":"Admin"}');
  PERFORM pg_temp.chk('signup: reserved username -> NULL', 'true',
    (SELECT (count(*) = 1 AND bool_and(username IS NULL))::TEXT FROM public.profiles WHERE id = u));

  u := pg_temp.mk_user('t039_dup@example.test', '{"full_name":"T","username":"VALID_name"}');
  PERFORM pg_temp.chk('signup: case-variant duplicate of a taken username -> NULL', 'true',
    (SELECT (count(*) = 1 AND bool_and(username IS NULL))::TEXT FROM public.profiles WHERE id = u));
  PERFORM pg_temp.chk('signup: the original owner kept the name', 'valid_name',
    (SELECT username FROM public.profiles WHERE id = (SELECT id FROM t_ids WHERE k = 'valid')));

  u := pg_temp.mk_user('t039_role@example.test',
    '{"full_name":"T","username":"forged_role","role":"admin"}');
  PERFORM pg_temp.chk('signup: forged role still ignored', 'student',
    (SELECT role FROM public.profiles WHERE id = u));
  PERFORM pg_temp.chk('signup: an absent academic year is still stored as NULL', 'true',
    (SELECT (academic_year IS NULL)::TEXT FROM public.profiles WHERE id = u));
  PERFORM pg_temp.chk('signup: a supplied academic year is still stored', '2',
    (SELECT academic_year::TEXT FROM public.profiles
     WHERE id = (SELECT id FROM t_ids WHERE k = 'valid')));
END
$$;

-- ---------------------------------------------------------------------
-- 3. Constraints
-- ---------------------------------------------------------------------
DO $$
DECLARE u UUID := (SELECT id FROM t_ids WHERE k = 'none'); r TEXT;
BEGIN
  r := 'allowed';
  BEGIN UPDATE public.profiles SET username = 'admin' WHERE id = u;
  EXCEPTION WHEN check_violation THEN r := 'check_violation'; END;
  PERFORM pg_temp.chk('constraint: reserved username rejected even for the SQL editor', 'check_violation', r);

  r := 'allowed';
  BEGIN UPDATE public.profiles SET username = 'Mixed_Case' WHERE id = u;
  EXCEPTION WHEN check_violation THEN r := 'check_violation'; END;
  PERFORM pg_temp.chk('constraint: uppercase username rejected (keeps uniqueness case-insensitive)', 'check_violation', r);

  r := 'allowed';
  BEGIN UPDATE public.profiles SET username = 'valid_name' WHERE id = u;
  EXCEPTION WHEN unique_violation THEN r := 'unique_violation'; END;
  PERFORM pg_temp.chk('constraint: duplicate username rejected', 'unique_violation', r);
END
$$;

SELECT pg_temp.chk('unique constraint profiles_username_key still exists', '1',
  (SELECT count(*)::TEXT FROM pg_constraint
   WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_username_key' AND contype = 'u'));

-- ---------------------------------------------------------------------
-- 4. Change cooldown, as a student (authenticated) going through the API
--    path. 'none' has no username yet.
-- ---------------------------------------------------------------------
SELECT pg_temp.chk('trigger order: allow-list runs before the username trigger', 'true',
  ('enforce_profile_allowlist' < 'enforce_username_rules' COLLATE "C")::TEXT);

DO $$
DECLARE a UUID := (SELECT id FROM t_ids WHERE k = 'none');
        b UUID := (SELECT id FROM t_ids WHERE k = 'valid');
        r TEXT;
BEGIN
  -- First choice is free.
  r := pg_temp.as_role('authenticated', a, format('UPDATE public.profiles SET username = %L WHERE id = %L', 'first_pick', a));
  PERFORM pg_temp.chk('cooldown: first choice (NULL -> name) is allowed', 'allowed:1', r);
  PERFORM pg_temp.chk('cooldown: ...and does not start the clock', 'true',
    (SELECT (username_changed_at IS NULL)::TEXT FROM public.profiles WHERE id = a));

  -- One immediate change is allowed and starts the clock.
  r := pg_temp.as_role('authenticated', a, format('UPDATE public.profiles SET username = %L WHERE id = %L', 'second_pick', a));
  PERFORM pg_temp.chk('cooldown: the first real change is allowed immediately', 'allowed:1', r);
  PERFORM pg_temp.chk('cooldown: ...and stamps username_changed_at', 'true',
    (SELECT (username_changed_at IS NOT NULL AND username_changed_at > now() - interval '1 minute')::TEXT
     FROM public.profiles WHERE id = a));

  -- A second change inside 30 days is refused, with the unlock time.
  r := pg_temp.as_role('authenticated', a, format('UPDATE public.profiles SET username = %L WHERE id = %L', 'third_pick', a));
  PERFORM pg_temp.chk('cooldown: a second change within 30 days is blocked (P0001)', 'blocked:P0001', r);
  PERFORM pg_temp.chk('cooldown: ...the username did not change', 'second_pick',
    (SELECT username FROM public.profiles WHERE id = a));
  r := pg_temp.as_role_err('authenticated', a, format('UPDATE public.profiles SET username = %L WHERE id = %L', 'third_pick', a));
  PERFORM pg_temp.chk('cooldown: error message is username_cooldown', 'username_cooldown',
    split_part(r, '|', 1));
  PERFORM pg_temp.chk('cooldown: error detail is the unlock instant, 30 days after the change', 'true',
    (to_timestamp(split_part(r, '|', 2), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')::TIMESTAMPTZ
       BETWEEN (SELECT username_changed_at FROM public.profiles WHERE id = a) + interval '30 days' - interval '2 seconds'
           AND (SELECT username_changed_at FROM public.profiles WHERE id = a) + interval '30 days' + interval '2 seconds')::TEXT);

  -- Re-saving the same username is not a change.
  r := pg_temp.as_role('authenticated', a, format('UPDATE public.profiles SET username = %L WHERE id = %L', 'second_pick', a));
  PERFORM pg_temp.chk('cooldown: saving the same username is allowed during the cooldown', 'allowed:1', r);

  -- Just inside the window: still blocked. Just outside: allowed.
  UPDATE public.profiles SET username_changed_at = now() - interval '29 days 23 hours' WHERE id = a;
  r := pg_temp.as_role('authenticated', a, format('UPDATE public.profiles SET username = %L WHERE id = %L', 'third_pick', a));
  PERFORM pg_temp.chk('cooldown: 29d23h after the last change is still blocked', 'blocked:P0001', r);

  UPDATE public.profiles SET username_changed_at = now() - interval '30 days 1 minute' WHERE id = a;
  r := pg_temp.as_role('authenticated', a, format('UPDATE public.profiles SET username = %L WHERE id = %L', 'third_pick', a));
  PERFORM pg_temp.chk('cooldown: just over 30 days after the last change is allowed', 'allowed:1', r);
  PERFORM pg_temp.chk('cooldown: ...and restarts the clock', 'true',
    (SELECT (username_changed_at > now() - interval '1 minute')::TEXT FROM public.profiles WHERE id = a));

  -- The clock cannot be reset or edited from the client.
  r := pg_temp.as_role('authenticated', a, format('UPDATE public.profiles SET username_changed_at = NULL WHERE id = %L', a));
  PERFORM pg_temp.chk('cooldown: a student cannot reset username_changed_at (allow-list)', 'blocked:42501', r);
  r := pg_temp.as_role('authenticated', a,
         format('UPDATE public.profiles SET username = %L, username_changed_at = NULL WHERE id = %L', 'fourth_pick', a));
  PERFORM pg_temp.chk('cooldown: ...nor smuggle it in with a username change', 'blocked:42501', r);

  -- A username cannot be cleared through the API.
  UPDATE public.profiles SET username_changed_at = NULL WHERE id = a;
  r := pg_temp.as_role('authenticated', a, format('UPDATE public.profiles SET username = NULL WHERE id = %L', a));
  PERFORM pg_temp.chk('a student cannot clear their username (23502)', 'blocked:23502', r);

  -- Uniqueness / format / reserved still apply through the API role.
  r := pg_temp.as_role('authenticated', a, format('UPDATE public.profiles SET username = %L WHERE id = %L', 'valid_name', a));
  PERFORM pg_temp.chk('API: taking another student''s username is blocked (23505)', 'blocked:23505', r);
  r := pg_temp.as_role('authenticated', a, format('UPDATE public.profiles SET username = %L WHERE id = %L', 'VALID_NAME', a));
  PERFORM pg_temp.chk('API: case-variant of a taken username is blocked (format CHECK, 23514)', 'blocked:23514', r);
  r := pg_temp.as_role('authenticated', a, format('UPDATE public.profiles SET username = %L WHERE id = %L', 'moderator9', a));
  PERFORM pg_temp.chk('API: reserved username is blocked (23514)', 'blocked:23514', r);
  PERFORM pg_temp.chk('...a rejected change did not stamp the clock', 'true',
    (SELECT (username_changed_at IS NULL)::TEXT FROM public.profiles WHERE id = a));

  -- RLS: a student cannot touch somebody else's username.
  r := pg_temp.as_role('authenticated', a, format('UPDATE public.profiles SET username = %L WHERE id = %L', 'hijacked', b));
  PERFORM pg_temp.chk('API: changing another student''s username affects 0 rows', 'allowed:0', r);
  PERFORM pg_temp.chk('...and it is unchanged', 'valid_name',
    (SELECT username FROM public.profiles WHERE id = b));

  -- anon cannot write at all.
  r := pg_temp.as_role('anon', NULL, format('UPDATE public.profiles SET username = %L WHERE id = %L', 'anon_pick', b));
  PERFORM pg_temp.chk('anon cannot change a username', 'true', (r IN ('allowed:0') OR r LIKE 'blocked:%')::TEXT);
  PERFORM pg_temp.chk('...and it is unchanged (anon)', 'valid_name',
    (SELECT username FROM public.profiles WHERE id = b));
END
$$;

-- ---------------------------------------------------------------------
-- 5. Admin paths bypass the cooldown and leave the student's clock alone
-- ---------------------------------------------------------------------
DO $$
DECLARE b UUID := (SELECT id FROM t_ids WHERE k = 'valid'); r TEXT; stamp TIMESTAMPTZ;
BEGIN
  UPDATE public.profiles SET username_changed_at = now() WHERE id = b;
  stamp := (SELECT username_changed_at FROM public.profiles WHERE id = b);

  r := pg_temp.as_role('service_role', NULL, format('UPDATE public.profiles SET username = %L WHERE id = %L', 'admin_renamed', b));
  PERFORM pg_temp.chk('service_role can rename inside the cooldown', 'allowed:1', r);
  PERFORM pg_temp.chk('...and the student''s clock is untouched', 'true',
    (SELECT (username_changed_at = stamp)::TEXT FROM public.profiles WHERE id = b));

  -- Plain SQL (no JWT: the dashboard SQL editor / a migration).
  UPDATE public.profiles SET username = 'editor_renamed' WHERE id = b;
  PERFORM pg_temp.chk('the SQL editor can rename inside the cooldown', 'editor_renamed',
    (SELECT username FROM public.profiles WHERE id = b));
  PERFORM pg_temp.chk('...and still does not touch the clock', 'true',
    (SELECT (username_changed_at = stamp)::TEXT FROM public.profiles WHERE id = b));
END
$$;

-- ---------------------------------------------------------------------
-- 6. Leaderboard RPCs: usernames only, nameless students excluded
-- ---------------------------------------------------------------------
DO $$
DECLARE u1 UUID; u2 UUID; u3 UUID; top_row RECORD; rank_row RECORD;
BEGIN
  u1 := pg_temp.mk_user('t039_lb1@example.test', '{"full_name":"Real Name One","username":"lb_one"}');
  u2 := pg_temp.mk_user('t039_lb2@example.test', '{"full_name":"Real Name Two","username":"lb_two"}');
  u3 := pg_temp.mk_user('t039_lb3@example.test', '{"full_name":"Real Name Three"}');
  -- Far above anything else in the table so the assertions are stable.
  UPDATE public.profiles SET total_xp = 900000 WHERE id = u3;
  UPDATE public.profiles SET total_xp = 800000 WHERE id = u1;
  UPDATE public.profiles SET total_xp = 700000 WHERE id = u2;

  PERFORM pg_temp.chk('leaderboard: a student without a username is not listed', '0',
    (SELECT count(*)::TEXT FROM public.get_leaderboard_top(1000) WHERE id = u3));
  PERFORM pg_temp.chk('leaderboard: students with usernames are listed, in XP order', 'lb_one,lb_two',
    (SELECT string_agg(username, ',' ORDER BY rank) FROM public.get_leaderboard_top(1000) WHERE id IN (u1, u2)));
  PERFORM pg_temp.chk('leaderboard: top-1 is lb_one although the nameless student has more XP', 'lb_one',
    (SELECT username FROM public.get_leaderboard_top(1)));

  SELECT * INTO top_row FROM public.get_leaderboard_top(1);
  PERFORM pg_temp.chk('leaderboard: the row has no full_name key', 'false',
    (to_jsonb(top_row) ? 'full_name')::TEXT);
  PERFORM pg_temp.chk('leaderboard: the row has no email key', 'false',
    (to_jsonb(top_row) ? 'email')::TEXT);
  PERFORM pg_temp.chk('leaderboard: no real name appears anywhere in the output', 'false',
    (to_jsonb(top_row)::TEXT ILIKE '%real name%')::TEXT);

  SELECT * INTO rank_row FROM public.get_student_rank(u1);
  PERFORM pg_temp.chk('rank: lb_one is rank 1 (the nameless 900000 student is not counted)', '1', rank_row.rank::TEXT);
  PERFORM pg_temp.chk('rank: the row has no full_name key', 'false', (to_jsonb(rank_row) ? 'full_name')::TEXT);
  PERFORM pg_temp.chk('rank: lb_two is rank 2', '2', (SELECT rank::TEXT FROM public.get_student_rank(u2)));
  PERFORM pg_temp.chk('rank: a student without a username has no rank row', '0',
    (SELECT count(*)::TEXT FROM public.get_student_rank(u3)));
END
$$;

SELECT pg_temp.chk('anon cannot EXECUTE get_leaderboard_top', 'false',
  has_function_privilege('anon', 'public.get_leaderboard_top(integer)', 'EXECUTE')::TEXT);
SELECT pg_temp.chk('authenticated cannot EXECUTE get_leaderboard_top', 'false',
  has_function_privilege('authenticated', 'public.get_leaderboard_top(integer)', 'EXECUTE')::TEXT);
SELECT pg_temp.chk('service_role CAN EXECUTE get_leaderboard_top', 'true',
  has_function_privilege('service_role', 'public.get_leaderboard_top(integer)', 'EXECUTE')::TEXT);
SELECT pg_temp.chk('anon cannot EXECUTE get_student_rank', 'false',
  has_function_privilege('anon', 'public.get_student_rank(uuid)', 'EXECUTE')::TEXT);
SELECT pg_temp.chk('authenticated cannot EXECUTE get_student_rank', 'false',
  has_function_privilege('authenticated', 'public.get_student_rank(uuid)', 'EXECUTE')::TEXT);
SELECT pg_temp.chk('service_role CAN EXECUTE get_student_rank', 'true',
  has_function_privilege('service_role', 'public.get_student_rank(uuid)', 'EXECUTE')::TEXT);
SELECT pg_temp.chk('the RPCs are still SECURITY DEFINER with a pinned search_path', '2',
  (SELECT count(*)::TEXT FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('get_leaderboard_top', 'get_student_rank')
     AND prosecdef AND proconfig @> ARRAY['search_path=public']));
SELECT pg_temp.chk('the cooldown trigger function is not callable through the REST API', 'false',
  (has_function_privilege('anon', 'public.enforce_username_rules()', 'EXECUTE')
   OR has_function_privilege('authenticated', 'public.enforce_username_rules()', 'EXECUTE'))::TEXT);
SELECT pg_temp.chk('handle_new_auth_user is still not callable through the REST API', 'false',
  (has_function_privilege('anon', 'public.handle_new_auth_user()', 'EXECUTE')
   OR has_function_privilege('authenticated', 'public.handle_new_auth_user()', 'EXECUTE'))::TEXT);

-- ---------------------------------------------------------------------
-- Verdict
-- ---------------------------------------------------------------------
DO $$
DECLARE bad INT; total INT;
BEGIN
  SELECT count(*) FILTER (WHERE NOT ok), count(*) INTO bad, total FROM t_results;
  IF bad > 0 THEN
    RAISE EXCEPTION '039: % of % checks FAILED: %', bad, total, (
      SELECT string_agg(name || ' (expected ' || coalesce(expected, 'NULL')
                        || ', got ' || coalesce(actual, 'NULL') || ')', '; ' ORDER BY n)
      FROM t_results WHERE NOT ok);
  END IF;
  RAISE NOTICE '039: all % checks passed', total;
END $$;

ROLLBACK;
