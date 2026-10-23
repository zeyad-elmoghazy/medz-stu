-- 036_perf_hygiene.sql
-- Performance hygiene flagged by the Supabase performance advisor (prod, 2026-10-22):
--   1. auth_rls_initplan (28 policies): auth.uid() was re-evaluated for every row.
--      Wrapping it as (select auth.uid()) makes Postgres evaluate it once per query.
--      Policy semantics are unchanged — only the evaluation strategy.
--   2. duplicate_index (4 pairs on quiz_sessions): drop the older idx_qs_* copies.
--   3. Missing indexes on columns the app filters/sorts by.
--
-- Deliberately NOT here: the per-insert REFRESH MATERIALIZED VIEW trigger on
-- quiz_sessions (cheap while the table is small — revisit when it reaches ~10k rows),
-- and splitting the *_admin_write ALL policies (multiple_permissive_policies) —
-- with the initplan fix the extra admin EXISTS check is evaluated once, not per row.

-- ---------------------------------------------------------------------------
-- 1. RLS: wrap auth.uid() in (select ...)
-- ---------------------------------------------------------------------------

-- Admin-only tables (ALL policies: USING only, as before).
ALTER POLICY chapters_admin_write ON chapters
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'));
ALTER POLICY module_subjects_admin_write ON module_subjects
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'));
ALTER POLICY modules_admin_write ON modules
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'));
ALTER POLICY subjects_admin_write ON subjects
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'));
ALTER POLICY questions_admin_write ON questions
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'));
ALTER POLICY reference_books_admin_write ON reference_books
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'));
ALTER POLICY reference_pages_admin_write ON reference_pages
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'));

ALTER POLICY questions_read_published ON questions
  USING (
    status = 'published'
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')
  );

ALTER POLICY activity_log_admin_read ON activity_log
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'));
ALTER POLICY activity_log_admin_insert ON activity_log
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'));

ALTER POLICY flags_admin_select ON question_flags
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'));
ALTER POLICY flags_admin_update ON question_flags
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin'));

-- Student-owned rows.
ALTER POLICY students_own_bookmarks ON bookmarks
  USING (student_id = (select auth.uid()));
ALTER POLICY students_own_notes ON notes
  USING (student_id = (select auth.uid()));
ALTER POLICY students_own_sessions ON quiz_sessions
  USING (student_id = (select auth.uid()));
ALTER POLICY students_read_own_chapter_progress ON chapter_quiz_progress
  USING (student_id = (select auth.uid()));
ALTER POLICY students_read_own_custom_exam_progress ON custom_exam_progress
  USING (student_id = (select auth.uid()));
ALTER POLICY students_read_own_streaks ON daily_streaks
  USING (student_id = (select auth.uid()));
ALTER POLICY flags_student_read_own ON question_flags
  USING (student_id = (select auth.uid()));
ALTER POLICY flags_student_insert ON question_flags
  WITH CHECK (student_id = (select auth.uid()));
ALTER POLICY violations_student_insert ON violations
  WITH CHECK (student_id = (select auth.uid()));

ALTER POLICY profiles_owner_select ON profiles
  USING ((select auth.uid()) = id);
ALTER POLICY profiles_owner_update ON profiles
  USING ((select auth.uid()) = id);

-- Friends / streaks.
ALTER POLICY friends_insert_own ON friends
  WITH CHECK (requester_id = (select auth.uid()));
ALTER POLICY friends_read_own ON friends
  USING ((select auth.uid()) = requester_id OR (select auth.uid()) = addressee_id);
ALTER POLICY friends_update_addressee ON friends
  USING (addressee_id = (select auth.uid()));
ALTER POLICY friend_streaks_read_own ON friend_streaks
  USING (EXISTS (
    SELECT 1 FROM friends f
    WHERE f.id = friend_streaks.friend_pair_id
      AND ((select auth.uid()) = f.requester_id OR (select auth.uid()) = f.addressee_id)
  ));
ALTER POLICY streak_commitments_read_own ON streak_commitments
  USING (
    student_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM friend_streaks fs
      JOIN friends f ON f.id = fs.friend_pair_id
      WHERE fs.id = streak_commitments.friend_streak_id
        AND ((select auth.uid()) = f.requester_id OR (select auth.uid()) = f.addressee_id)
    )
  );

-- Fallback for tables that exist only on a fresh replay (prod doesn't have them): the
-- unused quiz_sessions_partitioned / quiz_sessions_2026_* tables from migration 005 each
-- carry their own students_own_sessions policy. Rewrite any straggler the same way.
-- No-op on prod, where the 28 policies above are the complete set.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check FROM pg_policies
    WHERE schemaname = 'public'
      AND regexp_count(coalesce(qual, '') || ' ' || coalesce(with_check, ''), 'auth\.uid\(\)')
        > regexp_count(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '(?i)select auth\.uid\(\)')
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I %s %s', r.policyname, r.tablename,
      CASE WHEN r.qual IS NOT NULL
           THEN 'USING (' || replace(r.qual, 'auth.uid()', '(select auth.uid())') || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL
           THEN 'WITH CHECK (' || replace(r.with_check, 'auth.uid()', '(select auth.uid())') || ')' ELSE '' END);
  END LOOP;
END $$;

-- Self-check: abort the whole migration if any public policy still has a bare auth.uid().
DO $$
DECLARE bare text;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO bare
  FROM pg_policies
  WHERE schemaname = 'public'
    AND regexp_count(coalesce(qual, '') || ' ' || coalesce(with_check, ''), 'auth\.uid\(\)')
      > regexp_count(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '(?i)select auth\.uid\(\)');
  IF bare IS NOT NULL THEN
    RAISE EXCEPTION 'policies still using bare auth.uid(): %', bare;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Duplicate indexes on quiz_sessions (identical to the idx_quiz_sessions_* set)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_qs_completed;
DROP INDEX IF EXISTS idx_qs_student;
DROP INDEX IF EXISTS idx_qs_student_subject;
DROP INDEX IF EXISTS idx_qs_subject;

-- ---------------------------------------------------------------------------
-- 3. Indexes for real access paths
-- ---------------------------------------------------------------------------
-- stats route: a student's most recent sessions / 30-day progress, sorted by completed_at.
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student_completed
  ON quiz_sessions (student_id, completed_at DESC);
-- chapters-by-subject / chapter-mistakes: a student's sessions for a set of chapters.
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student_chapter
  ON quiz_sessions (student_id, chapter_id) WHERE chapter_id IS NOT NULL;
-- catalogue: chapters filtered by subject_id (FK was unindexed).
CREATE INDEX IF NOT EXISTS idx_chapters_subject ON chapters (subject_id);
CREATE INDEX IF NOT EXISTS idx_module_subjects_subject ON module_subjects (subject_id);
-- FK used for cascade/delete lookups when an admin removes a chapter.
CREATE INDEX IF NOT EXISTS idx_cqp_chapter ON chapter_quiz_progress (chapter_id);
