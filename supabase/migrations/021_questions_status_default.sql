-- =============================================================
-- MediZee · 021_questions_status_default.sql
-- =============================================================
-- questions.status has defaulted to 'published' since it was added
-- (007_professor_authoring.sql) — every real write path (manual
-- entry, PDF extraction, JSON import) has always explicitly
-- overridden it to 'under_review', so this has been a silent trap
-- rather than an active bug: any future insert that forgets to set
-- status would land published, visible to students, with no review
-- step. Flipping the column default closes that gap at the schema
-- level instead of relying on every write path remembering to set
-- it explicitly.
-- =============================================================

BEGIN;

ALTER TABLE questions
  ALTER COLUMN status SET DEFAULT 'under_review';

COMMIT;
