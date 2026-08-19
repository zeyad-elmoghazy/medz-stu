-- =============================================================
-- MedZ · 015_b2c_pivot_rebuild.sql
-- =============================================================
-- B2C pivot (2026-08-04 through 2026-08-08). Replaces the
-- professor-owned authoring model entirely:
--   - subjects become a global catalog, many-to-many with modules
--     (a module can have Anatomy + Histology + Biochemistry +
--     Physiology at once — the old schema hard-capped one subject
--     per module via modules.subject_id)
--   - chapters gain their own subject_id (a module's Histology
--     chapters and Anatomy chapters are different rows)
--   - professor_id ownership is removed from modules/questions;
--     writes become Admin-only (Zoz + Ammar), no Reviewer role
--     either — the two graduate-student reviewers work offline
--     and never get a platform account
--   - adds the full B2C feature set: usernames, friends, friend
--     streaks, streak goals/badges, a global XP leaderboard, and
--     the book+page reference-lookup system
--
-- Run after 001, 003, 004, 005, 006, 007, 008, 009, 010, 011,
-- 012, 013, 014. Idempotent where practical (ON CONFLICT / IF NOT
-- EXISTS) but this is a one-way pivot, not meant to be rolled back.
-- =============================================================

BEGIN;

-- =============================================================
-- 1. SUBJECTS — global catalog, not owned by any module
-- =============================================================
CREATE TABLE IF NOT EXISTS subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,   -- 'anatomy', 'histology', ...
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subjects_public_read" ON subjects
  FOR SELECT USING (true);

CREATE POLICY "subjects_admin_write" ON subjects
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

INSERT INTO subjects (slug, name) VALUES
  ('anatomy',      'Anatomy'),
  ('histology',    'Histology'),
  ('physiology',   'Physiology'),
  ('biochemistry', 'Biochemistry'),
  ('pathology',    'Pathology'),
  ('pharmacology', 'Pharmacology')
ON CONFLICT (slug) DO NOTHING;

-- =============================================================
-- 2. MODULE_SUBJECTS — many-to-many. A subject repeats across
--    modules (Anatomy is in 101, 103, 104, 205, 206, 207); a
--    module holds several subjects at once (103 has all four).
-- =============================================================
CREATE TABLE IF NOT EXISTS module_subjects (
  module_code  TEXT NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
  subject_id   UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (module_code, subject_id)
);

ALTER TABLE module_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_subjects_public_read" ON module_subjects
  FOR SELECT USING (true);

CREATE POLICY "module_subjects_admin_write" ON module_subjects
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Insert any Year-1/Year-2 modules that don't exist yet (only
-- histology modules were seeded in 007). Names are placeholders
-- where the founders haven't named them — safe to rename later,
-- code is the stable key everything else joins on.
INSERT INTO modules (code, subject_id, name, year_num, year_label, is_active)
VALUES
  ('102', 'multi', 'Module 102', '1', 'Preclinical · Foundations', true),
  ('108', 'multi', 'Module 108', '1', 'Preclinical · Foundations', true),
  ('208', 'multi', 'Module 208', '2', 'Preclinical · Systems',     true)
ON CONFLICT (code) DO NOTHING;

-- modules.subject_id is legacy (single-subject assumption) and is
-- superseded by module_subjects below. Left in place rather than
-- dropped to avoid breaking any code that still reads it during
-- the app-layer rebuild (task: remove professor architecture) —
-- drop it in a follow-up migration once nothing references it.
COMMENT ON COLUMN modules.subject_id IS
  'LEGACY — superseded by module_subjects. Do not add new reads against this column.';

-- Full confirmed Year 1 + Year 2 taxonomy (founder-confirmed 2026-08-07/08).
INSERT INTO module_subjects (module_code, subject_id)
SELECT m.code, s.id FROM (VALUES
  ('101','anatomy'), ('101','histology'),
  ('102','physiology'), ('102','biochemistry'),
  ('103','anatomy'), ('103','histology'), ('103','biochemistry'), ('103','physiology'),
  ('104','anatomy'), ('104','histology'), ('104','physiology'),
  ('108','pharmacology'), ('108','pathology'),
  ('205','anatomy'), ('205','physiology'), ('205','histology'),
  ('206','anatomy'), ('206','physiology'), ('206','histology'), ('206','biochemistry'),
  ('207','anatomy'), ('207','histology'), ('207','physiology'),
  ('208','pathology'), ('208','pharmacology')
) AS t(module_code, subject_slug)
JOIN modules m ON m.code = t.module_code
JOIN subjects s ON s.slug = t.subject_slug
ON CONFLICT DO NOTHING;

-- =============================================================
-- 3. CHAPTERS — add subject_id (a chapter belongs to one Module
--    AND one Subject, never shared). Backfill existing rows to
--    Histology (the only subject that had chapters before this
--    migration), then widen the uniqueness constraint.
-- =============================================================
ALTER TABLE chapters
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id);

UPDATE chapters
SET subject_id = (SELECT id FROM subjects WHERE slug = 'histology')
WHERE subject_id IS NULL;

ALTER TABLE chapters ALTER COLUMN subject_id SET NOT NULL;

ALTER TABLE chapters DROP CONSTRAINT IF EXISTS chapters_module_code_slug_key;
ALTER TABLE chapters ADD CONSTRAINT chapters_module_subject_slug_key
  UNIQUE (module_code, subject_id, slug);

CREATE INDEX IF NOT EXISTS idx_chapters_module_subject
  ON chapters(module_code, subject_id);

-- Rewrite chapters RLS: was professor-owned via modules.professor_id,
-- now Admin-only.
DROP POLICY IF EXISTS "chapters_professor_write" ON chapters;
CREATE POLICY "chapters_admin_write" ON chapters
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Placeholder chapters (Chapter 1/2/3) for every (module, subject)
-- pair that doesn't have real chapters yet, per founder instruction
-- to rename later rather than block launch on naming everything now.
DO $$
DECLARE
  ms RECORD;
  existing_count INT;
BEGIN
  FOR ms IN SELECT module_code, subject_id FROM module_subjects LOOP
    SELECT COUNT(*) INTO existing_count
    FROM chapters WHERE module_code = ms.module_code AND subject_id = ms.subject_id;

    IF existing_count = 0 THEN
      INSERT INTO chapters (module_code, subject_id, slug, name, ordinal)
      VALUES
        (ms.module_code, ms.subject_id, 'chapter-1', 'Chapter 1', 1),
        (ms.module_code, ms.subject_id, 'chapter-2', 'Chapter 2', 2),
        (ms.module_code, ms.subject_id, 'chapter-3', 'Chapter 3', 3)
      ON CONFLICT (module_code, subject_id, slug) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Real, founder-given chapters for the (module, subject) pairs that
-- have them but weren't in the DB yet (205/206/207's Anatomy and
-- Physiology chapters — only their Histology chapters existed pre-pivot).
INSERT INTO chapters (module_code, subject_id, slug, name, ordinal)
SELECT t.module_code, s.id, t.slug, t.name, t.ordinal
FROM (VALUES
  ('205','anatomy','neuroanatomy','Neuroanatomy',1),
  ('205','anatomy','head','Head',2),
  ('205','anatomy','neck','Neck',3),
  ('205','physiology','sensory-nervous-system','Sensory Nervous System',1),
  ('205','physiology','motor-nervous-system','Motor Nervous System',2),
  ('205','physiology','special-senses','Special Senses',3),
  ('206','anatomy','digestive-tract','Digestive Tract',1),
  ('206','anatomy','digestive-glands','Digestive Glands',2),
  ('206','anatomy','urinary-system','Urinary System',3),
  ('206','physiology','digestive-tract','Digestive Tract',1),
  ('206','physiology','digestive-glands','Digestive Glands',2),
  ('206','physiology','urinary-system','Urinary System',3)
) AS t(module_code, subject_slug, slug, name, ordinal)
JOIN subjects s ON s.slug = t.subject_slug
ON CONFLICT (module_code, subject_id, slug) DO NOTHING;

-- The above inserted real chapters into what were placeholder slots;
-- remove the now-redundant Chapter 1/2/3 placeholders for those
-- specific (module, subject) pairs.
DELETE FROM chapters
WHERE (module_code, subject_id) IN (
  SELECT '205', id FROM subjects WHERE slug IN ('anatomy','physiology')
  UNION ALL
  SELECT '206', id FROM subjects WHERE slug IN ('anatomy','physiology')
)
AND slug IN ('chapter-1','chapter-2','chapter-3');

-- =============================================================
-- 4. Fix misplaced seed questions — the 11 histology questions
--    (reproductive/endocrine/pineal content) were attached to
--    Module 103's Cartilage chapter by migration 007's fallback
--    logic. Module 207 has the chapters that actually match this
--    content. Reattach by topic (confirmed against
--    data/histology-questions.ts topic field 2026-08-08).
-- =============================================================
DO $$
DECLARE
  hist_id UUID;
  ch_male UUID;
  ch_female UUID;
  ch_endo UUID;
BEGIN
  SELECT id INTO hist_id FROM subjects WHERE slug = 'histology';

  SELECT id INTO ch_male FROM chapters
    WHERE module_code = '207' AND subject_id = hist_id AND slug = 'male-reproductive-system';
  SELECT id INTO ch_female FROM chapters
    WHERE module_code = '207' AND subject_id = hist_id AND slug = 'female-reproductive-system';
  SELECT id INTO ch_endo FROM chapters
    WHERE module_code = '207' AND subject_id = hist_id AND slug = 'endocrine-system';

  IF ch_male IS NOT NULL AND ch_female IS NOT NULL AND ch_endo IS NOT NULL THEN
    UPDATE questions SET chapter_id = ch_male   WHERE subject_id = 'histology' AND subject_bundle_id IN (1, 6, 10, 11);
    UPDATE questions SET chapter_id = ch_female WHERE subject_id = 'histology' AND subject_bundle_id IN (2, 5, 8);
    UPDATE questions SET chapter_id = ch_endo   WHERE subject_id = 'histology' AND subject_bundle_id IN (3, 4, 7, 9);
  END IF;
END $$;

-- =============================================================
-- 5. Remove professor ownership from modules / questions RLS.
--    professor_id columns are left in place (nullable, unused)
--    rather than dropped here — dropping them is an app-layer-
--    coordinated change (see: remove professor architecture task)
--    so API routes referencing them don't break mid-migration.
-- =============================================================
DROP POLICY IF EXISTS "modules_professor_write" ON modules;
CREATE POLICY "modules_admin_write" ON modules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "questions_professor_write" ON questions;
CREATE POLICY "questions_admin_write" ON questions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "questions_read_published" ON questions;
CREATE POLICY "questions_read_published" ON questions
  FOR SELECT USING (
    status = 'published'
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Demote any existing 'professor' rows before tightening the CHECK
-- constraint. No production users yet (pre-launch demo data only) —
-- safe to force this rather than requiring a manual reassignment.
UPDATE profiles SET role = 'admin' WHERE role = 'professor';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('student', 'admin'));

-- =============================================================
-- 6. Usernames + XP (leaderboard basis)
-- =============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS total_xp INTEGER NOT NULL DEFAULT 0;

-- =============================================================
-- 7. Friends, friend streaks, streak goal commitments, badges
-- =============================================================
CREATE TABLE IF NOT EXISTS friends (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id)
);

ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friends_read_own" ON friends
  FOR SELECT USING (auth.uid() IN (requester_id, addressee_id));

CREATE POLICY "friends_insert_own" ON friends
  FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY "friends_update_addressee" ON friends
  FOR UPDATE USING (addressee_id = auth.uid());

CREATE TABLE IF NOT EXISTS friend_streaks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  friend_pair_id          UUID NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  streak_count            INTEGER NOT NULL DEFAULT 0,
  last_both_active_date   DATE
);

ALTER TABLE friend_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friend_streaks_read_own" ON friend_streaks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM friends f WHERE f.id = friend_pair_id
            AND auth.uid() IN (f.requester_id, f.addressee_id))
  );

CREATE TABLE IF NOT EXISTS streak_commitments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID REFERENCES profiles(id) ON DELETE CASCADE,
  friend_streak_id  UUID REFERENCES friend_streaks(id) ON DELETE CASCADE,
  target_days       INTEGER NOT NULL DEFAULT 7,
  started_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','failed')),
  completed_at      TIMESTAMPTZ,
  CHECK ((student_id IS NOT NULL) <> (friend_streak_id IS NOT NULL))
);

ALTER TABLE streak_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "streak_commitments_read_own" ON streak_commitments
  FOR SELECT USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM friend_streaks fs JOIN friends f ON f.id = fs.friend_pair_id
      WHERE fs.id = friend_streak_id AND auth.uid() IN (f.requester_id, f.addressee_id)
    )
  );

CREATE TABLE IF NOT EXISTS badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_type  TEXT NOT NULL,  -- 'streak_7' | 'streak_14' | 'streak_30' — flair only
  earned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "badges_public_read" ON badges
  FOR SELECT USING (true);  -- visible on profile/leaderboard to other students

-- =============================================================
-- 8. Reference books + pre-digitized pages (book+page lookup)
-- =============================================================
CREATE TABLE IF NOT EXISTS reference_books (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  author       TEXT,
  total_pages  INTEGER
);

ALTER TABLE reference_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reference_books_public_read" ON reference_books
  FOR SELECT USING (true);

CREATE POLICY "reference_books_admin_write" ON reference_books
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE TABLE IF NOT EXISTS reference_pages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id        UUID NOT NULL REFERENCES reference_books(id) ON DELETE CASCADE,
  page_number    INTEGER NOT NULL,  -- the page number as PRINTED in the book
  image_url      TEXT NOT NULL,
  UNIQUE (book_id, page_number)
);

ALTER TABLE reference_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reference_pages_public_read" ON reference_pages
  FOR SELECT USING (true);

CREATE POLICY "reference_pages_admin_write" ON reference_pages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- questions/chapters already have reference/notes columns from
-- earlier migrations (011's notes_storage_prefix/reference_page).
-- Add the book_id link so references can point at reference_pages
-- instead of the old professor-PDF-crop mechanism.
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS reference_book_id UUID REFERENCES reference_books(id);

ALTER TABLE chapters
  ADD COLUMN IF NOT EXISTS default_book_id UUID REFERENCES reference_books(id),
  ADD COLUMN IF NOT EXISTS default_page_start INTEGER;

COMMIT;
