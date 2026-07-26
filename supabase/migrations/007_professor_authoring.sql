-- =============================================================
-- MedZ · 007_professor_authoring.sql
-- =============================================================
-- Professor authoring layer.
--
-- Adds:
--   modules        — HIST 101, HIST 103, … per subject
--   chapters       — one row per chapter inside a module,
--                    tracks published / question counts (the
--                    numbers the student dashboard reads)
--   upload_jobs    — professor content upload job tracker
--   question_flags — student-reported ambiguity flag
--
-- Extends `questions` with:
--   chapter_id     — FK to chapters
--   professor_id   — owner (nullable for legacy seeded rows)
--   status         — 'draft' | 'under_review' | 'published'
--                    | 'archived' (legacy rows are backfilled
--                    to 'published' so /api/quiz keeps working)
--   flag_count     — cheap counter, kept in sync by trigger
--
-- Triggers keep chapters.question_count /
-- chapters.published_count accurate — the student dashboard
-- reads those columns directly, so professor publishes update
-- student-visible numbers with no application-layer plumbing.
-- =============================================================


-- =============================================================
-- TABLE: modules
-- =============================================================
CREATE TABLE IF NOT EXISTS modules (
  code           TEXT PRIMARY KEY,          -- e.g. '101', '103', '205'
  subject_id     TEXT NOT NULL,             -- 'histology' | future subjects
  name           TEXT NOT NULL,
  year_num       TEXT NOT NULL DEFAULT '1',
  year_label     TEXT NOT NULL DEFAULT '',
  professor_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_modules_subject
  ON modules(subject_id);
CREATE INDEX IF NOT EXISTS idx_modules_prof
  ON modules(professor_id);

ALTER TABLE modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "modules_public_read" ON modules
  FOR SELECT USING (true);

CREATE POLICY "modules_professor_write" ON modules
  FOR ALL USING (
    professor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );


-- =============================================================
-- TABLE: chapters
-- =============================================================
-- The counters (question_count, published_count) are maintained
-- by trigger — see update_chapter_counts() below. Students read
-- chapters.published_count via /api/student/stats and see fresh
-- numbers immediately after a professor publishes.
CREATE TABLE IF NOT EXISTS chapters (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_code      TEXT NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
  slug             TEXT NOT NULL,
  name             TEXT NOT NULL,
  ordinal          INTEGER NOT NULL DEFAULT 0,
  question_count   INTEGER NOT NULL DEFAULT 0,
  published_count  INTEGER NOT NULL DEFAULT 0,
  flagged_count    INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (module_code, slug)
);

CREATE INDEX IF NOT EXISTS idx_chapters_module
  ON chapters(module_code);

ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chapters_public_read" ON chapters
  FOR SELECT USING (true);

CREATE POLICY "chapters_professor_write" ON chapters
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM modules m
      WHERE m.code = chapters.module_code
        AND (m.professor_id = auth.uid()
             OR EXISTS (SELECT 1 FROM profiles p
                        WHERE p.id = auth.uid() AND p.role = 'admin'))
    )
  );


-- =============================================================
-- Extend `questions`
-- =============================================================
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS chapter_id      UUID REFERENCES chapters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS professor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'published'
                                           CHECK (status IN ('draft','under_review','published','archived')),
  ADD COLUMN IF NOT EXISTS flag_count      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difficulty      TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS source          TEXT DEFAULT 'manual'
                                           CHECK (source IN ('manual','ai','seed')),
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_questions_chapter
  ON questions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_questions_prof
  ON questions(professor_id);
CREATE INDEX IF NOT EXISTS idx_questions_status
  ON questions(status);

-- Widen RLS: professors can also see + mutate their own drafts.
-- Students still only see published (via the existing
-- questions_authenticated_read policy which we replace here so
-- draft/archived leak nowhere).
DROP POLICY IF EXISTS "questions_authenticated_read" ON questions;

CREATE POLICY "questions_read_published" ON questions
  FOR SELECT USING (
    status = 'published'
    OR professor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p
               WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "questions_professor_write" ON questions
  FOR ALL USING (
    professor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p
               WHERE p.id = auth.uid() AND p.role = 'admin')
  );


-- =============================================================
-- TABLE: upload_jobs
-- =============================================================
-- Distinct from the generic `jobs` table in 004 — that one is
-- the QStash worker's log; this one is a professor-facing upload
-- record with content-authoring context (module/chapter, counts
-- of extracted questions).
CREATE TABLE IF NOT EXISTS upload_jobs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module_code              TEXT REFERENCES modules(code) ON DELETE SET NULL,
  chapter_id               UUID REFERENCES chapters(id) ON DELETE SET NULL,
  method                   TEXT NOT NULL DEFAULT 'ai'
                           CHECK (method IN ('ai','manual','import')),
  notes_file_name          TEXT,
  questions_file_name      TEXT,
  status                   TEXT NOT NULL DEFAULT 'queued'
                           CHECK (status IN ('queued','processing','completed','failed')),
  questions_extracted      INTEGER NOT NULL DEFAULT 0,
  questions_published      INTEGER NOT NULL DEFAULT 0,
  questions_under_review   INTEGER NOT NULL DEFAULT 0,
  error_message            TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_upload_jobs_prof
  ON upload_jobs(professor_id, created_at DESC);

ALTER TABLE upload_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "upload_jobs_prof_own" ON upload_jobs
  FOR ALL USING (professor_id = auth.uid());

-- Admin dashboard reads every upload job for its "Recent
-- uploads" panel. Separate policy so we don't widen the
-- professor write policy above.
CREATE POLICY "upload_jobs_admin_read" ON upload_jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );


-- =============================================================
-- TABLE: question_flags
-- =============================================================
-- Student-side "this question is confusing/ambiguous" report.
-- Feeds the "Needs your attention" list on the professor
-- overview. Trigger below keeps questions.flag_count in sync.
CREATE TABLE IF NOT EXISTS question_flags (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id    BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason         TEXT NOT NULL DEFAULT 'ambiguous',
  detail         TEXT,
  resolved       BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_flags_question
  ON question_flags(question_id);
CREATE INDEX IF NOT EXISTS idx_flags_open
  ON question_flags(resolved) WHERE resolved = false;

ALTER TABLE question_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flags_student_insert" ON question_flags
  FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "flags_student_read_own" ON question_flags
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "flags_professor_manage" ON question_flags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM questions q
      WHERE q.id = question_flags.question_id
        AND q.professor_id = auth.uid()
    )
  );


-- =============================================================
-- TRIGGER: keep chapters counters accurate
-- =============================================================
CREATE OR REPLACE FUNCTION update_chapter_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_chapter UUID;
BEGIN
  -- Affected chapter — union of NEW and OLD, since UPDATE can
  -- move a question between chapters.
  IF (TG_OP = 'DELETE') THEN
    target_chapter := OLD.chapter_id;
  ELSE
    target_chapter := NEW.chapter_id;
  END IF;

  IF target_chapter IS NOT NULL THEN
    UPDATE chapters SET
      question_count  = (SELECT COUNT(*) FROM questions
                          WHERE chapter_id = target_chapter),
      published_count = (SELECT COUNT(*) FROM questions
                          WHERE chapter_id = target_chapter
                            AND status = 'published'),
      flagged_count   = (SELECT COALESCE(SUM(flag_count),0)
                          FROM questions
                          WHERE chapter_id = target_chapter)
    WHERE id = target_chapter;
  END IF;

  -- Also update the "from" chapter on UPDATE when chapter changed.
  IF (TG_OP = 'UPDATE'
      AND OLD.chapter_id IS NOT NULL
      AND OLD.chapter_id IS DISTINCT FROM NEW.chapter_id) THEN
    UPDATE chapters SET
      question_count  = (SELECT COUNT(*) FROM questions
                          WHERE chapter_id = OLD.chapter_id),
      published_count = (SELECT COUNT(*) FROM questions
                          WHERE chapter_id = OLD.chapter_id
                            AND status = 'published'),
      flagged_count   = (SELECT COALESCE(SUM(flag_count),0)
                          FROM questions
                          WHERE chapter_id = OLD.chapter_id)
    WHERE id = OLD.chapter_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS on_question_change ON questions;
CREATE TRIGGER on_question_change
  AFTER INSERT OR UPDATE OR DELETE ON questions
  FOR EACH ROW EXECUTE FUNCTION update_chapter_counts();


-- =============================================================
-- TRIGGER: keep questions.flag_count in sync from question_flags
-- =============================================================
CREATE OR REPLACE FUNCTION update_question_flag_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_q BIGINT;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    target_q := OLD.question_id;
  ELSE
    target_q := NEW.question_id;
  END IF;

  UPDATE questions SET
    flag_count = (SELECT COUNT(*) FROM question_flags
                   WHERE question_id = target_q
                     AND resolved = false)
  WHERE id = target_q;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS on_flag_change ON question_flags;
CREATE TRIGGER on_flag_change
  AFTER INSERT OR UPDATE OR DELETE ON question_flags
  FOR EACH ROW EXECUTE FUNCTION update_question_flag_count();


-- =============================================================
-- FUNCTION: get_professor_stats(uuid)
-- =============================================================
-- Returns the full overview payload in one round-trip.
-- Nothing in here is hardcoded — every number is the current
-- COUNT/AVG at query time.
CREATE OR REPLACE FUNCTION get_professor_stats(p_professor_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'my_students', (
      -- distinct students who have completed at least one session
      -- in any subject this professor owns a module for
      SELECT COUNT(DISTINCT qs.student_id)
      FROM quiz_sessions qs
      WHERE qs.subject_id IN (
        SELECT subject_id FROM modules WHERE professor_id = p_professor_id
      )
    ),
    'total_students', (SELECT COUNT(*) FROM profiles WHERE role = 'student'),
    'total_questions', (
      SELECT COUNT(*) FROM questions
      WHERE professor_id = p_professor_id
    ),
    'published_questions', (
      SELECT COUNT(*) FROM questions
      WHERE professor_id = p_professor_id AND status = 'published'
    ),
    'draft_questions', (
      SELECT COUNT(*) FROM questions
      WHERE professor_id = p_professor_id AND status = 'draft'
    ),
    'under_review', (
      SELECT COUNT(*) FROM questions
      WHERE professor_id = p_professor_id AND status = 'under_review'
    ),
    'flagged_questions', (
      SELECT COUNT(*) FROM questions
      WHERE professor_id = p_professor_id AND flag_count > 0
    ),
    'total_attempts', (
      SELECT COUNT(*) FROM quiz_sessions
      WHERE subject_id IN (
        SELECT subject_id FROM modules WHERE professor_id = p_professor_id
      )
    ),
    'sessions_this_week', (
      SELECT COUNT(*) FROM quiz_sessions
      WHERE subject_id IN (
        SELECT subject_id FROM modules WHERE professor_id = p_professor_id
      )
      AND completed_at >= (NOW() - INTERVAL '7 days')
    ),
    'avg_accuracy', (
      SELECT COALESCE(ROUND(AVG(accuracy)::numeric, 1), 0)
      FROM quiz_sessions
      WHERE subject_id IN (
        SELECT subject_id FROM modules WHERE professor_id = p_professor_id
      )
    ),
    'modules', (
      SELECT COALESCE(json_agg(row_to_json(m_row) ORDER BY m_row.code), '[]'::json)
      FROM (
        SELECT
          m.code,
          m.name,
          m.subject_id,
          m.year_num,
          m.year_label,
          m.is_active,
          (SELECT COUNT(*) FROM chapters c WHERE c.module_code = m.code) AS chapter_count,
          (SELECT COALESCE(SUM(c.question_count),0) FROM chapters c WHERE c.module_code = m.code) AS question_count,
          (SELECT COALESCE(SUM(c.published_count),0) FROM chapters c WHERE c.module_code = m.code) AS published_count
        FROM modules m
        WHERE m.professor_id = p_professor_id OR p_professor_id IS NULL
      ) AS m_row
    ),
    'chapter_performance', (
      SELECT COALESCE(json_agg(row_to_json(cp) ORDER BY cp.avg_accuracy ASC NULLS LAST), '[]'::json)
      FROM (
        SELECT
          c.id,
          c.name,
          c.module_code,
          c.published_count,
          -- accuracy across all quiz_sessions that touched a
          -- question in this chapter — approximated using
          -- sessions whose subject matches the chapter's module
          COALESCE(ROUND(AVG(qs.accuracy)::numeric, 0), 0) AS avg_accuracy
        FROM chapters c
        JOIN modules m ON m.code = c.module_code
        LEFT JOIN quiz_sessions qs ON qs.subject_id = m.subject_id
        WHERE m.professor_id = p_professor_id
        GROUP BY c.id, c.name, c.module_code, c.published_count
      ) AS cp
    ),
    'recent_activity', (
      SELECT COALESCE(json_agg(row_to_json(a) ORDER BY a.at DESC), '[]'::json)
      FROM (
        SELECT
          'session'::text AS kind,
          qs.completed_at AS at,
          p.full_name AS actor,
          qs.subject_id AS subject,
          qs.accuracy AS accuracy
        FROM quiz_sessions qs
        JOIN profiles p ON p.id = qs.student_id
        WHERE qs.subject_id IN (
          SELECT subject_id FROM modules WHERE professor_id = p_professor_id
        )
        ORDER BY qs.completed_at DESC
        LIMIT 8
      ) AS a
    ),
    'recent_uploads', (
      SELECT COALESCE(json_agg(row_to_json(u) ORDER BY u.created_at DESC), '[]'::json)
      FROM (
        SELECT id, module_code, chapter_id, method, status,
               questions_extracted, questions_published, created_at
        FROM upload_jobs
        WHERE professor_id = p_professor_id
        ORDER BY created_at DESC
        LIMIT 5
      ) AS u
    )
  ) INTO result;

  RETURN result;
END;
$$;


-- =============================================================
-- SEED: Histology modules + chapters
-- =============================================================
-- Ports the static catalog in data/histology-catalog.ts into
-- the DB so professors can immediately author against real
-- rows. Idempotent — safe to re-run.
INSERT INTO modules (code, subject_id, name, year_num, year_label, is_active)
VALUES
  ('101', 'histology', 'General Histology & The Cell',      '1', 'Preclinical · Foundations', true),
  ('103', 'histology', 'Epithelial & Connective Tissue',    '1', 'Preclinical · Foundations', true),
  ('104', 'histology', 'Blood & Muscle Tissue',             '1', 'Preclinical · Foundations', true),
  ('205', 'histology', 'Nervous & Cardiovascular Systems',  '2', 'Preclinical · Systems',     true),
  ('206', 'histology', 'Lymphoid & Endocrine Systems',      '2', 'Preclinical · Systems',     true),
  ('207', 'histology', 'Respiratory & Digestive Systems',   '2', 'Preclinical · Systems',     true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO chapters (module_code, slug, name, ordinal)
VALUES
  -- HIST 101
  ('101', 'cytology',                             'Cytology',                           1),
  ('101', 'connective-tissue',                     'Connective Tissue',                  2),
  ('101', 'epithelium',                            'Epithelium',                         3),
  ('101', 'blood',                                 'Blood',                              4),
  -- HIST 103
  ('103', 'cartilage',                            'Cartilage',                          1),
  ('103', 'bone',                                 'Bone',                               2),
  ('103', 'muscle',                               'Muscle',                             3),
  ('103', 'skin',                                 'Skin',                               4),
  -- HIST 104
  ('104', 'lymphatics',                           'Lymphatics',                         1),
  ('104', 'vascular',                             'Vascular',                           2),
  ('104', 'respiratory',                          'Respiratory',                        3),
  ('104', 'cytogenetics',                         'Cytogenetics',                       4),
  -- HIST 205
  ('205', 'nervous-tissue',                       'Nervous Tissue',                     1),
  ('205', 'central-nervous-system',                'Central Nervous System',            2),
  ('205', 'eye',                                  'Eye',                                3),
  ('205', 'ear',                                  'Ear',                                4),
  -- HIST 206
  ('206', 'digestive-tract',                      'Digestive Tract',                    1),
  ('206', 'digestive-glands',                     'Digestive Glands',                   2),
  ('206', 'urinary-system',                       'Urinary System',                     3),
  -- HIST 207
  ('207', 'endocrine-system',                     'Endocrine System',                   1),
  ('207', 'male-reproductive-system',             'Male Reproductive System',           2),
  ('207', 'female-reproductive-system',           'Female Reproductive System',         3)
ON CONFLICT (module_code, slug) DO NOTHING;


-- =============================================================
-- Backfill: attach seeded histology questions to the Cartilage
-- chapter so numbers aren't stranded. (The 11 seeded
-- questions in data/histology-questions.ts have no natural
-- chapter home — attach them all to the first published chapter
-- of HIST 103 so professors see them under a real destination.)
-- =============================================================
DO $$
DECLARE
  target_chapter UUID;
BEGIN
  SELECT id INTO target_chapter
  FROM chapters
  WHERE module_code = '103' AND slug = 'cartilage'
  LIMIT 1;

  IF target_chapter IS NOT NULL THEN
    UPDATE questions
    SET chapter_id = target_chapter,
        status     = 'published',
        source     = 'seed'
    WHERE subject_id = 'histology'
      AND chapter_id IS NULL;
  END IF;
END $$;


-- =============================================================
-- Assign Dr. Zahra as the histology professor.
-- Run once after the professor account exists:
--
--   UPDATE modules
--   SET professor_id = (SELECT id FROM profiles WHERE email = 'zahra@...')
--   WHERE subject_id = 'histology';
-- =============================================================
