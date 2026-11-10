-- =====================================================================
-- Migration 049 verification — question_reveals and its backfill.
--
-- Run AFTER all migrations AND supabase/seed.sql, against a NON-PRODUCTION
-- database:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/049_question_reveals.sql
--
-- One transaction, ROLLED BACK. The final DO block RAISES listing every
-- failed check; on success it prints "049: all N checks passed".
--
-- The three INSERT ... SELECT statements in section 4 are the backfill from
-- migration 049 section 2. Keep them in sync with the migration.
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

-- Same fixture user as 048: a real auth.users row -> signup trigger -> profile.
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
-- 1. Fixture: two students, one chapter with six published questions
-- ---------------------------------------------------------------------
DO $$
DECLARE
  s1 UUID := pg_temp.mk_user('rev049a@test.local');
  s2 UUID := pg_temp.mk_user('rev049b@test.local');
  ch RECORD;
  slug TEXT;
BEGIN
  SELECT c.id, c.subject_id, c.module_code INTO ch FROM chapters c LIMIT 1;
  SELECT subjects.slug INTO slug FROM subjects WHERE id = ch.subject_id;

  INSERT INTO questions (subject_id, subject_bundle_id, question, choices, correct_answer, status, chapter_id)
  SELECT slug, 940000 + g, 'rev049 Q' || g,
         '[{"id":"a","text":"x"},{"id":"b","text":"y"}]', 'a', 'published', ch.id
  FROM generate_series(1, 6) g;

  INSERT INTO t_ctx VALUES ('s1', s1::TEXT), ('s2', s2::TEXT), ('chapter', ch.id::TEXT),
                           ('slug', slug), ('module', ch.module_code);
END $$;

CREATE FUNCTION pg_temp.qid(n INT) RETURNS BIGINT LANGUAGE sql AS $$
  SELECT id FROM questions WHERE question = 'rev049 Q' || n
$$;
CREATE FUNCTION pg_temp.s1() RETURNS UUID LANGUAGE sql AS $$ SELECT v::UUID FROM t_ctx WHERE k = 's1' $$;
CREATE FUNCTION pg_temp.s2() RETURNS UUID LANGUAGE sql AS $$ SELECT v::UUID FROM t_ctx WHERE k = 's2' $$;

-- ---------------------------------------------------------------------
-- 2. Old history to backfill from
-- ---------------------------------------------------------------------
-- Student 1: two finished sessions (Q2 answered in both, earliest wins), one
-- session with junk in `answers` (non-numeric key, unknown question id), one
-- whose answers is not an object, an unfinished chapter attempt (Q4), and a
-- bookmark on a question they never answered (Q6).
INSERT INTO quiz_sessions (student_id, subject_id, chapter_id, answers, score, total_questions, accuracy, violations_count, completed_at)
SELECT pg_temp.s1(), (SELECT v FROM t_ctx WHERE k = 'slug'), (SELECT v::UUID FROM t_ctx WHERE k = 'chapter'),
       a.answers, 0, 1, 0, 0, a.at
FROM (VALUES
  (jsonb_build_object(pg_temp.qid(1)::TEXT, 'a', pg_temp.qid(2)::TEXT, 'b'), now() - interval '2 days'),
  (jsonb_build_object(pg_temp.qid(2)::TEXT, 'a', pg_temp.qid(3)::TEXT, 'a'), now() - interval '1 day'),
  (jsonb_build_object('abc', 'a', '999999999', 'a'), now() - interval '1 day'),
  ('[]'::jsonb, now() - interval '1 day')
) AS a(answers, at);

INSERT INTO chapter_quiz_progress (student_id, chapter_id, subject_id, answers, current_question_index, total_questions)
VALUES (pg_temp.s1(), (SELECT v::UUID FROM t_ctx WHERE k = 'chapter'), (SELECT v FROM t_ctx WHERE k = 'slug'),
        jsonb_build_object(pg_temp.qid(4)::TEXT, 'a'), 0, 6);

INSERT INTO bookmarks (student_id, question_id, subject_id)
VALUES (pg_temp.s1(), pg_temp.qid(6), (SELECT v FROM t_ctx WHERE k = 'slug'));

-- Student 2: an unfinished custom exam with Q5 answered.
INSERT INTO custom_exam_progress (student_id, module_code, chapter_ids, question_ids, answers, total_questions)
VALUES (pg_temp.s2(), (SELECT v FROM t_ctx WHERE k = 'module'), ARRAY[(SELECT v::UUID FROM t_ctx WHERE k = 'chapter')],
        ARRAY[pg_temp.qid(5)::INTEGER, pg_temp.qid(6)::INTEGER], jsonb_build_object(pg_temp.qid(5)::TEXT, 'a'), 2);

-- ---------------------------------------------------------------------
-- 3. Nothing is revealed before the backfill
-- ---------------------------------------------------------------------
SELECT pg_temp.chk('no reveals exist for the fixture students before the backfill', '0',
  (SELECT count(*) FROM question_reveals WHERE student_id IN (pg_temp.s1(), pg_temp.s2()))::TEXT);

-- ---------------------------------------------------------------------
-- 4. The backfill (migration 049 section 2): run it twice
-- ---------------------------------------------------------------------
CREATE FUNCTION pg_temp.backfill() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.question_reveals (student_id, question_id, revealed_at)
  SELECT qs.student_id, q.id, MIN(qs.completed_at)
  FROM public.quiz_sessions qs
  CROSS JOIN LATERAL jsonb_each_text(qs.answers) a(qid, choice)
  JOIN public.questions q
    ON a.qid ~ '^[0-9]+$' AND q.id = a.qid::BIGINT
  WHERE jsonb_typeof(qs.answers) = 'object'
  GROUP BY qs.student_id, q.id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.question_reveals (student_id, question_id, revealed_at)
  SELECT p.student_id, q.id, MIN(p.updated_at)
  FROM public.chapter_quiz_progress p
  CROSS JOIN LATERAL jsonb_each_text(p.answers) a(qid, choice)
  JOIN public.questions q
    ON a.qid ~ '^[0-9]+$' AND q.id = a.qid::BIGINT
  WHERE jsonb_typeof(p.answers) = 'object'
  GROUP BY p.student_id, q.id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.question_reveals (student_id, question_id, revealed_at)
  SELECT p.student_id, q.id, MIN(p.updated_at)
  FROM public.custom_exam_progress p
  CROSS JOIN LATERAL jsonb_each_text(p.answers) a(qid, choice)
  JOIN public.questions q
    ON a.qid ~ '^[0-9]+$' AND q.id = a.qid::BIGINT
  WHERE jsonb_typeof(p.answers) = 'object'
  GROUP BY p.student_id, q.id
  ON CONFLICT DO NOTHING;
END $$;

SELECT pg_temp.backfill();

CREATE FUNCTION pg_temp.revealed(p_student UUID) RETURNS TEXT LANGUAGE sql AS $$
  SELECT coalesce(string_agg('Q' || substr(q.question, 9), ',' ORDER BY q.question), '')
  FROM question_reveals r JOIN questions q ON q.id = r.question_id
  WHERE r.student_id = p_student
$$;

SELECT pg_temp.chk('student 1: finished sessions + unfinished attempt reveal Q1-Q4',
  'Q1,Q2,Q3,Q4', pg_temp.revealed(pg_temp.s1()));
SELECT pg_temp.chk('a bookmark never reveals an answer (Q6 stays hidden)', 'false',
  EXISTS (SELECT 1 FROM question_reveals WHERE student_id = pg_temp.s1() AND question_id = pg_temp.qid(6))::TEXT);
SELECT pg_temp.chk('student 2: the unfinished exam reveals only the answered Q5',
  'Q5', pg_temp.revealed(pg_temp.s2()));
SELECT pg_temp.chk('revealed_at is the EARLIEST time the question was answered', 'true',
  ((SELECT revealed_at FROM question_reveals WHERE student_id = pg_temp.s1() AND question_id = pg_temp.qid(2))
    < now() - interval '47 hours')::TEXT);
SELECT pg_temp.chk('junk keys and unknown question ids were skipped (no extra rows)', '5',
  (SELECT count(*) FROM question_reveals WHERE student_id IN (pg_temp.s1(), pg_temp.s2()))::TEXT);

-- Re-running (the post-deploy catch-up) changes nothing.
SELECT pg_temp.backfill();
SELECT pg_temp.chk('the backfill is safe to re-run', '5',
  (SELECT count(*) FROM question_reveals WHERE student_id IN (pg_temp.s1(), pg_temp.s2()))::TEXT);

-- ---------------------------------------------------------------------
-- 5. Integrity and lockdown
-- ---------------------------------------------------------------------
DELETE FROM questions WHERE id = pg_temp.qid(1);
SELECT pg_temp.chk('deleting a question removes its reveals (FK cascade)',
  'Q2,Q3,Q4', pg_temp.revealed(pg_temp.s1()));

-- Checked through RLS, not grants: the local seed re-grants table
-- privileges to the API roles, while hosted projects do it by default.
SELECT set_config('request.jwt.claims', json_build_object('sub', pg_temp.s1()::TEXT, 'role', 'authenticated')::TEXT, true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE t_seen AS SELECT count(*) AS n FROM public.question_reveals;
RESET ROLE;
SELECT pg_temp.chk('a student sees 0 rows of question_reveals, even their own', '0', (SELECT n FROM t_seen)::TEXT);

SELECT pg_temp.chk('RLS is enabled on question_reveals', 'true',
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.question_reveals'::regclass)::TEXT);

-- ---------------------------------------------------------------------
-- Verdict
-- ---------------------------------------------------------------------
DO $$
DECLARE bad INT; total INT;
BEGIN
  SELECT count(*) FILTER (WHERE NOT ok), count(*) INTO bad, total FROM t_results;
  IF bad > 0 THEN
    RAISE EXCEPTION '049: % of % checks FAILED: %', bad, total, (
      SELECT string_agg(name || ' (expected ' || coalesce(expected, 'NULL')
                        || ', got ' || coalesce(actual, 'NULL') || ')', '; ' ORDER BY n)
      FROM t_results WHERE NOT ok);
  END IF;
  RAISE NOTICE '049: all % checks passed', total;
END $$;

ROLLBACK;
