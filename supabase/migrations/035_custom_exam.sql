-- =============================================================
-- MedZ · 035_custom_exam.sql
-- =============================================================
-- Server-side home for the Custom Exam feature: a mixed exam drawn
-- from several chapters (and subjects) of one module.
--
-- The chapter quiz is keyed to ONE chapter at every layer
-- (chapter_quiz_progress UNIQUE(student, chapter), quiz_sessions
-- .chapter_id). A custom exam spans chapters, so it gets its own
-- in-flight table and its own marker on quiz_sessions. Everything is
-- ADDITIVE: no existing column, constraint or policy changes, and code
-- that inserts into quiz_sessions without the new columns keeps working
-- — so this can be applied to production before the app code ships.
--
-- 1) custom_exam_progress — the student's single UNFINISHED exam:
--    the question ids drawn at start (ordered, fixed — so Continue shows
--    the same questions in the same order), the answers so far and the
--    position. Written on every answered question and on Save & Exit,
--    deleted by the submit route when the exam is completed (the
--    completed exam then lives in quiz_sessions — nothing is counted
--    twice). UNIQUE(student_id): one unfinished exam at a time; starting
--    a new one replaces it (the UI asks first).
--
-- 2) quiz_sessions.exam_id (+ exam_module_code, exam_chapter_ids) —
--    a completed exam is ONE quiz_sessions row with chapter_id NULL and
--    subject_id 'custom-exam'. exam_id IS NOT NULL is the second marker
--    (next to chapter_id IS NOT NULL, migration 026) for "this row's
--    `answers` keys are real questions.id values", which the Focus Areas
--    / mistakes rollups (lib/server/chapter-mistakes.ts) rely on; each
--    answer is credited to the question's own chapter there.
--
-- Writes to custom_exam_progress go through the service-role API routes
-- only. Students get a read-only policy on their own row; there is
-- deliberately no INSERT/UPDATE/DELETE policy (same as 032).
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS custom_exam_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
  -- The chapters the student picked (for display and "Solve again").
  chapter_ids UUID[] NOT NULL DEFAULT '{}',
  -- questions.id values, in exam order, fixed when the exam is created.
  question_ids INTEGER[] NOT NULL,
  -- questions.id (as a string key) -> chosen choice id.
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_question_index INTEGER NOT NULL DEFAULT 0
    CHECK (current_question_index >= 0),
  total_questions INTEGER NOT NULL
    CHECK (total_questions > 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id)
);

ALTER TABLE custom_exam_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students_read_own_custom_exam_progress" ON custom_exam_progress;
CREATE POLICY "students_read_own_custom_exam_progress" ON custom_exam_progress
  FOR SELECT USING (student_id = auth.uid());

REVOKE ALL ON custom_exam_progress FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON custom_exam_progress FROM authenticated;

ALTER TABLE quiz_sessions
  ADD COLUMN IF NOT EXISTS exam_id UUID,
  ADD COLUMN IF NOT EXISTS exam_module_code TEXT,
  ADD COLUMN IF NOT EXISTS exam_chapter_ids UUID[];

-- UNIQUE on purpose: the submit route inserts the session FIRST and only
-- then credits XP, so a double submit (double click, retry, two tabs)
-- fails atomically here with 23505 and is rejected before any XP/streak
-- is credited — an exam can be recorded exactly once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_sessions_exam_id
  ON quiz_sessions(exam_id) WHERE exam_id IS NOT NULL;

COMMIT;
