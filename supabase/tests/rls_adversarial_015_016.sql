-- =====================================================================
-- Adversarial RLS test suite — MedZ-Stu (usiuoyvrphitqsyxwoty)
-- Run after migrations 001-016 (post professor-role removal pivot).
--
-- Uses real Supabase auth.uid()/auth.role() — not stubbed. Fixture
-- users are inserted directly into auth.users (firing the real
-- handle_new_auth_user() trigger from 006 to auto-provision their
-- profiles rows), then each test impersonates a specific user via
-- set_config('role', ...) + set_config('request.jwt.claims', ...),
-- exactly the GUCs PostgREST sets per-request in production. Every
-- assertion is captured into a results table and returned by the
-- final SELECT. Fixtures are deleted in a separate cleanup step
-- (rls_adversarial_cleanup.sql) so this project is left clean.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public._rls_adversarial_test_results (
  n INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  test_name TEXT NOT NULL,
  expected TEXT NOT NULL,
  actual TEXT NOT NULL,
  passed BOOLEAN NOT NULL
);
TRUNCATE public._rls_adversarial_test_results;

-- ---------------------------------------------------------------------
-- Fixtures: 3 real auth.users rows -> auto-provisions profiles via the
-- real 006 trigger. student_a / student_b are plain students; admin_u
-- starts as a student and is promoted below (fixture setup, not a
-- test). prof_u exists only to probe whether 'professor' can still be
-- assigned anywhere in the post-015 schema.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES
    ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-1111-1111-111111111111',
     'authenticated','authenticated','rlstest.student.a@example.com','x',
     now(), now(), now(), '{}', '{"role":"student","full_name":"RLS Test Student A"}', false,'','','',''),
    ('00000000-0000-0000-0000-000000000000', 'a2222222-2222-2222-2222-222222222222',
     'authenticated','authenticated','rlstest.student.b@example.com','x',
     now(), now(), now(), '{}', '{"role":"student","full_name":"RLS Test Student B"}', false,'','','',''),
    ('00000000-0000-0000-0000-000000000000', 'a3333333-3333-3333-3333-333333333333',
     'authenticated','authenticated','rlstest.admin@example.com','x',
     now(), now(), now(), '{}', '{"role":"student","full_name":"RLS Test Admin (pre-promotion)"}', false,'','','',''),
    ('00000000-0000-0000-0000-000000000000', 'a4444444-4444-4444-4444-444444444444',
     'authenticated','authenticated','rlstest.professor.attempt@example.com','x',
     now(), now(), now(), '{}', '{"role":"student","full_name":"RLS Test Professor Attempt"}', false,'','','','');

  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('FIXTURE: create 4 auth.users (triggers 006 profile auto-create)', 'succeeds', 'succeeded', true);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('FIXTURE: create 4 auth.users', 'succeeds', 'FAILED: ' || SQLERRM, false);
END $$;

-- Promote fixture 3 to admin via service_role (the only path the
-- immutability trigger permits) — fixture setup, not itself a test.
DO $$
BEGIN
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  UPDATE profiles SET role = 'admin' WHERE id = 'a3333333-3333-3333-3333-333333333333';

  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('FIXTURE: promote admin via service_role UPDATE', 'succeeds', 'succeeded', true);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('FIXTURE: promote admin via service_role UPDATE', 'succeeds', 'FAILED: ' || SQLERRM, false);
END $$;
SELECT set_config('role', 'postgres', true);

-- =======================================================================
-- GROUP 1 — professor role now structurally impossible
-- =======================================================================

-- T1: even service_role (the only role the immutability trigger lets
-- change .role at all) cannot set role='professor' post-015 — the
-- tightened CHECK constraint blocks it independently of the trigger.
DO $$
BEGIN
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  BEGIN
    UPDATE profiles SET role = 'professor' WHERE id = 'a4444444-4444-4444-4444-444444444444';
    INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
    VALUES ('T1: service_role sets role=professor', 'CHECK constraint violation (blocked)', 'UPDATE SUCCEEDED — NOT BLOCKED', false);
  EXCEPTION WHEN check_violation THEN
    INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
    VALUES ('T1: service_role sets role=professor', 'CHECK constraint violation (blocked)', 'blocked: ' || SQLERRM, true);
  WHEN OTHERS THEN
    INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
    VALUES ('T1: service_role sets role=professor', 'CHECK constraint violation (blocked)', 'blocked (other error): ' || SQLERRM, true);
  END;
END $$;
SELECT set_config('role', 'postgres', true);

-- T2: authenticated student attempts self-elevation to admin.
DO $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    UPDATE profiles SET role = 'admin' WHERE id = 'a1111111-1111-1111-1111-111111111111';
    INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
    VALUES ('T2: student self-elevates to admin', 'blocked (trigger: role change forbidden)', 'UPDATE SUCCEEDED — NOT BLOCKED', false);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
    VALUES ('T2: student self-elevates to admin', 'blocked (trigger: role change forbidden)', 'blocked: ' || SQLERRM, true);
  WHEN OTHERS THEN
    INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
    VALUES ('T2: student self-elevates to admin', 'blocked (trigger: role change forbidden)', 'blocked (other error): ' || SQLERRM, true);
  END;
END $$;
SELECT set_config('role', 'postgres', true);

-- T3: student_a attempts to change student_b's role (cross-user + elevation).
DO $$
DECLARE
  v_rows INT;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  UPDATE profiles SET role = 'admin' WHERE id = 'a2222222-2222-2222-2222-222222222222';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T3: student_a elevates student_b to admin', '0 rows affected (RLS: not own row)', v_rows || ' rows affected', v_rows = 0);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T3: student_a elevates student_b to admin', '0 rows affected (RLS: not own row)', 'blocked via exception: ' || SQLERRM, true);
END $$;
SELECT set_config('role', 'postgres', true);

-- T20: confirm 0 profiles rows carry role='professor' after 015+trigger.
DO $$
DECLARE
  v_count INT;
BEGIN
  PERFORM set_config('role', 'postgres', true);
  SELECT count(*) INTO v_count FROM profiles WHERE role = 'professor';
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T20: profiles rows with role=professor', '0', v_count::text, v_count = 0);
END $$;

-- =======================================================================
-- GROUP 2 — cross-user data isolation
-- =======================================================================

-- Fixture: student_a creates one quiz_sessions row and one notes row.
DO $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  INSERT INTO quiz_sessions (student_id, subject_id, score, total_questions, accuracy)
  VALUES ('a1111111-1111-1111-1111-111111111111', 'histology', 8, 10, 80.00);

  INSERT INTO notes (student_id, question_id, subject_id, content)
  VALUES ('a1111111-1111-1111-1111-111111111111', 1, 'histology', 'student A private note');

  INSERT INTO friends (requester_id, addressee_id, status)
  VALUES ('a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'pending');

  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('FIXTURE: student_a creates quiz_session/note/friend-request', 'succeeds (own rows)', 'succeeded', true);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('FIXTURE: student_a creates quiz_session/note/friend-request', 'succeeds (own rows)', 'FAILED: ' || SQLERRM, false);
END $$;
SELECT set_config('role', 'postgres', true);

-- T4: student_b tries to SELECT student_a's quiz_sessions.
DO $$
DECLARE v_count INT;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a2222222-2222-2222-2222-222222222222', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM quiz_sessions WHERE student_id = 'a1111111-1111-1111-1111-111111111111';
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T4: student_b SELECTs student_a quiz_sessions', '0 rows visible', v_count || ' rows visible', v_count = 0);
END $$;
SELECT set_config('role', 'postgres', true);

-- T5: student_b tries to UPDATE student_a's quiz_sessions.
DO $$
DECLARE v_rows INT;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a2222222-2222-2222-2222-222222222222', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  UPDATE quiz_sessions SET score = 999 WHERE student_id = 'a1111111-1111-1111-1111-111111111111';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T5: student_b UPDATEs student_a quiz_sessions', '0 rows affected', v_rows || ' rows affected', v_rows = 0);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T5: student_b UPDATEs student_a quiz_sessions', '0 rows affected', 'blocked via exception: ' || SQLERRM, true);
END $$;
SELECT set_config('role', 'postgres', true);

-- T6: student_b tries to DELETE student_a's quiz_sessions.
DO $$
DECLARE v_rows INT;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a2222222-2222-2222-2222-222222222222', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  DELETE FROM quiz_sessions WHERE student_id = 'a1111111-1111-1111-1111-111111111111';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T6: student_b DELETEs student_a quiz_sessions', '0 rows affected', v_rows || ' rows affected', v_rows = 0);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T6: student_b DELETEs student_a quiz_sessions', '0 rows affected', 'blocked via exception: ' || SQLERRM, true);
END $$;
SELECT set_config('role', 'postgres', true);

-- T7: student_b tries to SELECT student_a's private note.
DO $$
DECLARE v_count INT;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a2222222-2222-2222-2222-222222222222', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM notes WHERE student_id = 'a1111111-1111-1111-1111-111111111111';
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T7: student_b SELECTs student_a notes', '0 rows visible', v_count || ' rows visible', v_count = 0);
END $$;
SELECT set_config('role', 'postgres', true);

-- T8: an unrelated third student (admin fixture, pre-promotion identity
-- reused as a bystander via its own id) tries to SELECT the friends row
-- between student_a and student_b.
DO $$
DECLARE v_count INT;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a4444444-4444-4444-4444-444444444444', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM friends
  WHERE requester_id = 'a1111111-1111-1111-1111-111111111111'
    AND addressee_id = 'a2222222-2222-2222-2222-222222222222';
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T8: bystander SELECTs student_a/b friend request', '0 rows visible', v_count || ' rows visible', v_count = 0);
END $$;
SELECT set_config('role', 'postgres', true);

-- T9: student_b (the addressee) CAN see the friend request — positive control.
DO $$
DECLARE v_count INT;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a2222222-2222-2222-2222-222222222222', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM friends
  WHERE requester_id = 'a1111111-1111-1111-1111-111111111111'
    AND addressee_id = 'a2222222-2222-2222-2222-222222222222';
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T9 (positive control): addressee SELECTs own friend request', '1 row visible', v_count || ' rows visible', v_count = 1);
END $$;
SELECT set_config('role', 'postgres', true);

-- =======================================================================
-- GROUP 3 — modules_public_read / chapters_public_read: SELECT only
-- =======================================================================

-- T10: anon can SELECT modules.
DO $$
DECLARE v_count INT;
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  SELECT count(*) INTO v_count FROM modules;
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T10 (positive control): anon SELECTs modules', '> 0 rows visible', v_count || ' rows visible', v_count > 0);
END $$;
SELECT set_config('role', 'postgres', true);

-- T11: anon tries to INSERT into modules.
DO $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  BEGIN
    INSERT INTO modules (code, subject_id, name) VALUES ('RLS-ANON-TEST', 'histology', 'anon injected module');
    INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
    VALUES ('T11: anon INSERTs into modules', 'blocked (RLS policy violation)', 'INSERT SUCCEEDED — NOT BLOCKED', false);
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
    VALUES ('T11: anon INSERTs into modules', 'blocked (RLS policy violation)', 'blocked: ' || SQLERRM, true);
  END;
END $$;
SELECT set_config('role', 'postgres', true);

-- T12: authenticated non-admin student tries to UPDATE a module.
DO $$
DECLARE v_rows INT;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  UPDATE modules SET name = 'HACKED' WHERE code = '101';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T12: non-admin student UPDATEs modules', '0 rows affected', v_rows || ' rows affected', v_rows = 0);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T12: non-admin student UPDATEs modules', '0 rows affected', 'blocked via exception: ' || SQLERRM, true);
END $$;
SELECT set_config('role', 'postgres', true);

-- T13: authenticated non-admin student tries to DELETE a chapter.
DO $$
DECLARE v_rows INT;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  DELETE FROM chapters WHERE module_code = '101';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T13: non-admin student DELETEs chapters', '0 rows affected', v_rows || ' rows affected', v_rows = 0);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T13: non-admin student DELETEs chapters', '0 rows affected', 'blocked via exception: ' || SQLERRM, true);
END $$;
SELECT set_config('role', 'postgres', true);

-- T14 (positive control): authenticated non-admin CAN SELECT chapters.
DO $$
DECLARE v_count INT;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM chapters;
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T14 (positive control): non-admin student SELECTs chapters', '> 0 rows visible', v_count || ' rows visible', v_count > 0);
END $$;
SELECT set_config('role', 'postgres', true);

-- =======================================================================
-- GROUP 4 — activity_log (016): admin-only, plus positive admin path
-- =======================================================================

-- T15: non-admin student tries to SELECT activity_log.
DO $$
DECLARE v_count INT;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM activity_log;
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T15: non-admin student SELECTs activity_log', '0 rows visible', v_count || ' rows visible', v_count = 0);
END $$;
SELECT set_config('role', 'postgres', true);

-- T16: non-admin student tries to INSERT into activity_log.
DO $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    INSERT INTO activity_log (actor_id, action, entity_type, summary)
    VALUES ('a1111111-1111-1111-1111-111111111111', 'question_created', 'question', 'RLS test injected row');
    INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
    VALUES ('T16: non-admin student INSERTs into activity_log', 'blocked (RLS policy violation)', 'INSERT SUCCEEDED — NOT BLOCKED', false);
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
    VALUES ('T16: non-admin student INSERTs into activity_log', 'blocked (RLS policy violation)', 'blocked: ' || SQLERRM, true);
  END;
END $$;
SELECT set_config('role', 'postgres', true);

-- T17 (positive control): admin CAN INSERT into activity_log.
DO $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a3333333-3333-3333-3333-333333333333', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  INSERT INTO activity_log (actor_id, action, entity_type, summary)
  VALUES ('a3333333-3333-3333-3333-333333333333', 'question_created', 'question', 'RLS test admin-inserted row');

  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T17 (positive control): admin INSERTs into activity_log', 'succeeds', 'succeeded', true);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T17 (positive control): admin INSERTs into activity_log', 'succeeds', 'FAILED: ' || SQLERRM, false);
END $$;
SELECT set_config('role', 'postgres', true);

-- T18 (positive control): admin CAN SELECT activity_log (sees T17's row).
DO $$
DECLARE v_count INT;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a3333333-3333-3333-3333-333333333333', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM activity_log WHERE actor_id = 'a3333333-3333-3333-3333-333333333333';
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T18 (positive control): admin SELECTs activity_log', '>= 1 row visible', v_count || ' rows visible', v_count >= 1);
END $$;
SELECT set_config('role', 'postgres', true);

-- T19 (positive control): admin CAN UPDATE modules (admin_write policy works).
DO $$
DECLARE v_rows INT;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'a3333333-3333-3333-3333-333333333333', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  UPDATE modules SET name = name WHERE code = '101';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T19 (positive control): admin UPDATEs modules', '1 row affected', v_rows || ' rows affected', v_rows = 1);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public._rls_adversarial_test_results(test_name, expected, actual, passed)
  VALUES ('T19 (positive control): admin UPDATEs modules', '1 row affected', 'FAILED: ' || SQLERRM, false);
END $$;
SELECT set_config('role', 'postgres', true);

-- =======================================================================
-- Final report
-- =======================================================================
SELECT n, test_name, expected, actual, passed
FROM public._rls_adversarial_test_results
ORDER BY n;
