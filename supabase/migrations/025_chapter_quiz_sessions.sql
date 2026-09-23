-- =============================================================
-- MedZ · 025_chapter_quiz_sessions.sql
-- =============================================================
-- Attempt history for the chapter-catalogue quiz
-- (/student/quiz/chapter/[chapterId]), submitted via
-- POST /api/student/chapters/[chapterId]/submit.
--
-- Deliberately NOT written into `quiz_sessions`: that table's
-- `subject_id` is implicitly scoped to the custom-exam's fixed
-- SUBJECTS_CONFIG id list (lib/dashboard-data.ts), and the
-- student_subject_stats materialized view + its refresh trigger +
-- the subject leaderboard cache all key off that same taxonomy.
-- Chapters belong to a different, real content model (modules →
-- chapters → questions, UUID chapter ids) — writing chapter
-- attempts into quiz_sessions would fight that taxonomy or corrupt
-- subject-level analytics that were never designed to see
-- chapter-shaped data. This table is a parallel, chapter-scoped
-- equivalent; daily_streaks is still reused as-is since it's
-- generic (keyed by student + date only, not subject).
-- =============================================================

CREATE TABLE IF NOT EXISTS chapter_quiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id)
    ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES chapters(id)
    ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  accuracy DECIMAL(5,2) NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cqs_student
  ON chapter_quiz_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_cqs_chapter
  ON chapter_quiz_sessions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_cqs_student_chapter
  ON chapter_quiz_sessions(student_id, chapter_id);
CREATE INDEX IF NOT EXISTS idx_cqs_completed
  ON chapter_quiz_sessions(completed_at DESC);

ALTER TABLE chapter_quiz_sessions ENABLE ROW LEVEL SECURITY;

-- Same pattern as quiz_sessions.students_own_sessions — a student
-- can read/write only their own attempt rows.
CREATE POLICY "students_own_chapter_sessions" ON chapter_quiz_sessions
  FOR ALL USING (student_id = auth.uid());

-- Professors can read (analytics), never modify — mirrors
-- quiz_sessions.professors_read_sessions.
CREATE POLICY "professors_read_chapter_sessions" ON chapter_quiz_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'professor'
    )
  );
