-- =============================================================
-- MedZ · 003_student_personalization.sql
-- =============================================================
-- Per-student personalization layer:
--   - quiz_sessions      (every attempted block)
--   - daily_streaks      (one row per active day)
--   - bookmarks          (flagged questions)
--   - notes              (per-question free text)
--   - student_subject_stats   (materialized view, refreshed on
--                              every quiz_session insert)
--   - get_student_streak()    (DB-side streak computation
--                              matching lib/streak-utils.ts)
--
-- Run order note:
--   002_performance_indexes.sql references several of these
--   tables — apply 003 BEFORE 002 on a fresh project, or apply
--   them as a single SQL session.
-- =============================================================


-- =============================================================
-- TABLE: quiz_sessions  (ensure this shape exists)
-- =============================================================
-- Drop and recreate cleanly if it exists
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id)
    ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  accuracy DECIMAL(5,2) NOT NULL DEFAULT 0,
  violations_count INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qs_student
  ON quiz_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_qs_subject
  ON quiz_sessions(subject_id);
CREATE INDEX IF NOT EXISTS idx_qs_student_subject
  ON quiz_sessions(student_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_qs_completed
  ON quiz_sessions(completed_at DESC);

ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students_own_sessions" ON quiz_sessions
  FOR ALL USING (student_id = auth.uid());

-- Professors can see sessions for analytics
-- but only read, never modify
CREATE POLICY "professors_read_sessions" ON quiz_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'professor'
    )
  );

-- Admin full access via service role only
-- (no policy needed — service role bypasses RLS)


-- =============================================================
-- TABLE: daily_streaks
-- =============================================================
CREATE TABLE IF NOT EXISTS daily_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id)
    ON DELETE CASCADE,
  streak_date DATE NOT NULL,
  challenges_completed INTEGER NOT NULL DEFAULT 0,
  UNIQUE(student_id, streak_date)
);

CREATE INDEX IF NOT EXISTS idx_streaks_student
  ON daily_streaks(student_id);
CREATE INDEX IF NOT EXISTS idx_streaks_date
  ON daily_streaks(student_id, streak_date DESC);

ALTER TABLE daily_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students_own_streaks" ON daily_streaks
  FOR ALL USING (student_id = auth.uid());


-- =============================================================
-- TABLE: bookmarks  (ensure correct shape)
-- =============================================================
CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id)
    ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  subject_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, question_id)
);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students_own_bookmarks" ON bookmarks
  FOR ALL USING (student_id = auth.uid());


-- =============================================================
-- TABLE: notes
-- =============================================================
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id)
    ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  subject_id TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, question_id)
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students_own_notes" ON notes
  FOR ALL USING (student_id = auth.uid());


-- =============================================================
-- MATERIALIZED VIEW: student_subject_stats
-- =============================================================
-- Pre-computed per-student per-subject stats
-- Refreshed after every quiz submission
CREATE MATERIALIZED VIEW IF NOT EXISTS
  student_subject_stats AS
SELECT
  student_id,
  subject_id,
  COUNT(*)                    AS total_sessions,
  SUM(score)                  AS total_correct,
  SUM(total_questions)        AS total_answered,
  ROUND(AVG(accuracy), 2)     AS avg_accuracy,
  MAX(accuracy)               AS best_accuracy,
  MAX(completed_at)           AS last_attempted
FROM quiz_sessions
GROUP BY student_id, subject_id;

-- Required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS
  idx_sss_student_subject
  ON student_subject_stats(student_id, subject_id);


-- =============================================================
-- FUNCTION: refresh_student_stats()
-- =============================================================
-- Called after every quiz submission
CREATE OR REPLACE FUNCTION refresh_student_stats()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY
    student_subject_stats;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS after_quiz_session_insert ON quiz_sessions;
CREATE TRIGGER after_quiz_session_insert
  AFTER INSERT ON quiz_sessions
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_student_stats();


-- =============================================================
-- FUNCTION: get_student_streak(p_student_id UUID)
-- =============================================================
CREATE OR REPLACE FUNCTION
  get_student_streak(p_student_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_streak INTEGER := 0;
  v_check_date DATE := CURRENT_DATE;
  v_has_today BOOLEAN;
BEGIN
  -- Check if student completed anything today
  SELECT EXISTS(
    SELECT 1 FROM daily_streaks
    WHERE student_id = p_student_id
      AND streak_date = CURRENT_DATE
      AND challenges_completed > 0
  ) INTO v_has_today;

  -- If no activity today, start from yesterday
  IF NOT v_has_today THEN
    v_check_date := CURRENT_DATE - INTERVAL '1 day';
  END IF;

  -- Walk backwards counting consecutive days
  LOOP
    IF EXISTS(
      SELECT 1 FROM daily_streaks
      WHERE student_id = p_student_id
        AND streak_date = v_check_date
        AND challenges_completed > 0
    ) THEN
      v_streak := v_streak + 1;
      v_check_date := v_check_date - INTERVAL '1 day';
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN v_streak;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
