-- =============================================================
-- MedZ · 032_chapter_quiz_progress.sql
-- =============================================================
-- Server-side home for an UNFINISHED chapter-quiz attempt.
--
-- Until now a chapter quiz only touched the database when the last
-- question was submitted (quiz_sessions row + record_quiz_result).
-- "Save & Exit" wrote localStorage only, so coming back started the
-- chapter over, and answers given in a half-finished chapter never
-- reached the Progress dashboard.
--
-- This table holds one row per (student, chapter): the answers so far,
-- where the student was, and the question subset if it is a "Practice
-- mistakes" run. It is written on every answered question and on
-- Save & Exit, read to resume ("Continue" on the catalogue), read by
-- the Progress dashboard, and deleted by the chapter submit route
-- when the attempt is completed (the completed attempt then lives in
-- quiz_sessions exactly as before — nothing is counted twice).
--
-- quiz_sessions keeps meaning "completed attempt": the
-- student_subject_stats matview, record_quiz_result (XP / streak /
-- profile counters) and the leaderboard are untouched.
--
-- Writes go through the service-role API route only. Students get a
-- read-only policy on their own row; there is deliberately no
-- INSERT/UPDATE/DELETE policy, so nobody can write straight through
-- PostgREST.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS chapter_quiz_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  -- Subject slug, same convention as quiz_sessions.subject_id.
  subject_id TEXT NOT NULL,
  -- questions.id (as a string key) -> chosen choice id.
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- NULL = the whole chapter; set for a "Practice mistakes" subset.
  question_ids INTEGER[],
  current_question_index INTEGER NOT NULL DEFAULT 0
    CHECK (current_question_index >= 0),
  -- Number of questions in this attempt (subset size, or the
  -- chapter's published count).
  total_questions INTEGER NOT NULL DEFAULT 0
    CHECK (total_questions >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, chapter_id)
);

CREATE INDEX IF NOT EXISTS idx_cqp_student_updated
  ON chapter_quiz_progress(student_id, updated_at DESC);

ALTER TABLE chapter_quiz_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students_read_own_chapter_progress" ON chapter_quiz_progress;
CREATE POLICY "students_read_own_chapter_progress" ON chapter_quiz_progress
  FOR SELECT USING (student_id = auth.uid());

REVOKE ALL ON chapter_quiz_progress FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON chapter_quiz_progress FROM authenticated;

COMMIT;
