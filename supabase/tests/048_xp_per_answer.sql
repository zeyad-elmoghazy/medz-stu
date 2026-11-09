-- =====================================================================
-- Migration 048 verification — XP on every answer, no daily cap.
--
-- Run AFTER all migrations AND supabase/seed.sql, against a NON-PRODUCTION
-- database:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/048_xp_per_answer.sql
--
-- One transaction, ROLLED BACK. The final DO block RAISES listing every
-- failed check; on success it prints "048: all N checks passed".
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

-- Same fixture user as 031: a real auth.users row -> signup trigger -> profile.
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

DO $$
DECLARE
  s UUID := pg_temp.mk_user('xp048@test.local');
  ch RECORD;
BEGIN
  SELECT id, subject_id INTO ch FROM chapters LIMIT 1;
  -- 200 published questions (correct = 'a') + 1 unpublished.
  INSERT INTO questions (subject_id, subject_bundle_id, question, choices, correct_answer, status, chapter_id)
  SELECT ch.subject_id, 900000 + g, 'xp048 Q' || g,
         '[{"id":"a","text":"x"},{"id":"b","text":"y"}]', 'a',
         CASE WHEN g = 201 THEN 'under_review' ELSE 'published' END, ch.id
  FROM generate_series(1, 201) g;
  INSERT INTO t_ctx VALUES ('s', s::TEXT);
END $$;

CREATE FUNCTION pg_temp.qid(n INT) RETURNS BIGINT LANGUAGE sql AS $$
  SELECT id FROM questions WHERE question = 'xp048 Q' || n
$$;
CREATE FUNCTION pg_temp.s() RETURNS UUID LANGUAGE sql AS $$ SELECT v::UUID FROM t_ctx WHERE k = 's' $$;
CREATE FUNCTION pg_temp.xp() RETURNS INT LANGUAGE sql AS $$ SELECT total_xp FROM profiles WHERE id = pg_temp.s() $$;

-- ---- award_answers_xp ----
SELECT pg_temp.chk('first correct answer earns 10',
  '10', award_answers_xp(pg_temp.s(), ARRAY[pg_temp.qid(1)], ARRAY['a'])::TEXT);
SELECT pg_temp.chk('same question again earns 0',
  '0', award_answers_xp(pg_temp.s(), ARRAY[pg_temp.qid(1)], ARRAY['a'])::TEXT);
SELECT pg_temp.chk('wrong answer earns 0',
  '0', award_answers_xp(pg_temp.s(), ARRAY[pg_temp.qid(2)], ARRAY['b'])::TEXT);
SELECT pg_temp.chk('unpublished question earns 0',
  '0', award_answers_xp(pg_temp.s(), ARRAY[pg_temp.qid(201)], ARRAY['a'])::TEXT);
SELECT pg_temp.chk('wrong then right on a retake still earns 10 once',
  '10', award_answers_xp(pg_temp.s(), ARRAY[pg_temp.qid(2)], ARRAY['a'])::TEXT);
SELECT pg_temp.chk('profile total_xp = 20 so far', '20', pg_temp.xp()::TEXT);

-- ---- no daily cap: 180 more correct answers in one day all count ----
SELECT pg_temp.chk('180 correct in one batch earn 1800 (no 150 cap)',
  '1800', award_answers_xp(pg_temp.s(),
    ARRAY(SELECT pg_temp.qid(g) FROM generate_series(3, 182) g),
    ARRAY(SELECT 'a' FROM generate_series(3, 182)))::TEXT);
SELECT pg_temp.chk('profile total_xp = 1820', '1820', pg_temp.xp()::TEXT);

-- ---- finish_attempt_xp ----
-- Attempt: Q183..Q192 plus Q1 (paid long ago). Q183..Q187 credited live,
-- Q188..Q191 missed their live save, Q192 wrong. Accuracy 91.
UPDATE xp_awards SET awarded_at = now() - interval '1 day' WHERE student_id = pg_temp.s();
-- now() is fixed for the whole test transaction, so new awards land exactly at it.
INSERT INTO t_ctx VALUES ('since', now()::TEXT);
SELECT award_answers_xp(pg_temp.s(),
  ARRAY(SELECT pg_temp.qid(g) FROM generate_series(183, 187) g),
  ARRAY(SELECT 'a' FROM generate_series(183, 187)));
SELECT pg_temp.chk('finish: 9 new this attempt (5 live + 4 caught up) = 90, +50% = 135',
  '135', finish_attempt_xp(pg_temp.s(),
    ARRAY(SELECT pg_temp.qid(g) FROM generate_series(183, 192) g) || pg_temp.qid(1),
    ARRAY(SELECT CASE WHEN g = 192 THEN 'b' ELSE 'a' END FROM generate_series(183, 192) g) || 'a'::TEXT,
    (SELECT v::TIMESTAMPTZ FROM t_ctx WHERE k = 'since'), 91)::TEXT);
-- 1820 + 50 (live) + 40 (caught up) + 45 (bonus)
SELECT pg_temp.chk('profile total_xp = 1955 after the attempt', '1955', pg_temp.xp()::TEXT);
SELECT pg_temp.chk('finishing the same attempt again (double submit) earns 0',
  '0', finish_attempt_xp(pg_temp.s(),
    ARRAY(SELECT pg_temp.qid(g) FROM generate_series(183, 192) g) || pg_temp.qid(1),
    ARRAY(SELECT CASE WHEN g = 192 THEN 'b' ELSE 'a' END FROM generate_series(183, 192) g) || 'a'::TEXT,
    (SELECT v::TIMESTAMPTZ FROM t_ctx WHERE k = 'since'), 91)::TEXT);
SELECT pg_temp.chk('double submit paid nothing extra', '1955', pg_temp.xp()::TEXT);
SELECT pg_temp.chk('finish below 90% accuracy: no bonus, repeats earn 0',
  '0', finish_attempt_xp(pg_temp.s(),
    ARRAY[pg_temp.qid(1), pg_temp.qid(3)], ARRAY['a', 'a'], now(), 50)::TEXT);

-- ---- record_quiz_stats: counters + streak, never XP ----
SELECT record_quiz_stats(pg_temp.s(), 7, 10, current_date);
SELECT record_quiz_stats(pg_temp.s(), 3, 5, current_date);
SELECT pg_temp.chk('record_quiz_stats does not touch XP', '1955', pg_temp.xp()::TEXT);
SELECT pg_temp.chk('record_quiz_stats counts challenges',
  '2', (SELECT challenges_completed FROM daily_streaks WHERE student_id = pg_temp.s() AND streak_date = current_date)::TEXT);

-- ---- lockdown ----
SELECT pg_temp.chk('authenticated cannot execute award_answers_xp', 'false',
  has_function_privilege('authenticated', 'public.award_answers_xp(uuid,bigint[],text[])', 'EXECUTE')::TEXT);
SELECT pg_temp.chk('anon cannot execute finish_attempt_xp', 'false',
  has_function_privilege('anon', 'public.finish_attempt_xp(uuid,bigint[],text[],timestamptz,numeric)', 'EXECUTE')::TEXT);
-- (Checked through RLS, not grants: the local seed re-grants table
-- privileges to the API roles, while hosted projects do it by default.)
SELECT set_config('request.jwt.claims', json_build_object('sub', pg_temp.s()::TEXT, 'role', 'authenticated')::TEXT, true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE t_seen AS SELECT count(*) AS n FROM public.xp_awards;
RESET ROLE;
SELECT pg_temp.chk('a student sees 0 rows of xp_awards, even their own', '0', (SELECT n FROM t_seen)::TEXT);

-- ---------------------------------------------------------------------
-- Verdict
-- ---------------------------------------------------------------------
DO $$
DECLARE bad INT; total INT;
BEGIN
  SELECT count(*) FILTER (WHERE NOT ok), count(*) INTO bad, total FROM t_results;
  IF bad > 0 THEN
    RAISE EXCEPTION '048: % of % checks FAILED: %', bad, total, (
      SELECT string_agg(name || ' (expected ' || coalesce(expected, 'NULL')
                        || ', got ' || coalesce(actual, 'NULL') || ')', '; ' ORDER BY n)
      FROM t_results WHERE NOT ok);
  END IF;
  RAISE NOTICE '048: all % checks passed', total;
END $$;

ROLLBACK;
