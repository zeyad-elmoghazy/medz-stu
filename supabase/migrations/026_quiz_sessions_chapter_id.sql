-- =============================================================
-- MediZee · 026_quiz_sessions_chapter_id.sql
-- =============================================================
-- Chapter-quiz completions (app/api/student/chapters/[chapterId]/
-- submit/route.ts) have never written to quiz_sessions — that
-- table was deliberately scoped to the old proctored subject-quiz
-- flow (app/api/quiz/submit/route.ts). Since quiz_sessions is what
-- backs the student Analytics view's "Recent Challenges", "Accuracy
-- Trend", and per-subject numbers, and the chapter-quiz flow is now
-- the app's real/primary quiz surface, that view has been blind to
-- almost all real student activity (quiz_sessions has 0 rows in
-- production as of this migration).
--
-- This adds a nullable chapter_id so the chapter-quiz submit route
-- can start inserting a row per attempt (see that route's updated
-- header comment) while keeping the column optional for the legacy
-- flow's rows (which have no chapter concept — their `answers` keys
-- are questions.subject_bundle_id, not questions.id). chapter_id
-- IS NOT NULL is therefore the reliable marker for "this row's
-- `answers` keys are real questions.id values", which the Focus
-- Areas / mistakes rollups (app/api/student/stats/route.ts,
-- lib/server/chapter-mistakes.ts) depend on.
-- =============================================================

BEGIN;

ALTER TABLE quiz_sessions
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_chapter
  ON quiz_sessions(chapter_id) WHERE chapter_id IS NOT NULL;

COMMIT;
