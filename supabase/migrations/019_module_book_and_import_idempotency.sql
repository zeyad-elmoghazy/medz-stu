-- =============================================================
-- MedZ · 019_module_book_and_import_idempotency.sql
-- =============================================================
-- Book references replace notes references going forward — this
-- is a retirement of the per-question notes-page mechanism in
-- favor of a single book per module, not an additive feature.
-- Confirmed zero real content depends on notes_storage_prefix on
-- MedZ-Stu at the time of this migration (queried directly before
-- writing this file) — nothing existing breaks from this shift.
--
-- Two columns:
--   modules.book_id      — one book per module. The module owns
--                           its book; individual questions/chapters
--                           no longer need their own book pointer.
--   questions.external_id — holds the source JSON's question_id
--                           (e.g. "VIS_Q001") so a re-run of the
--                           JSON import route can UPSERT via
--                           ON CONFLICT instead of duplicating rows.
--
-- Existing but now-unused columns are left in place, not dropped:
-- questions.reference_book_id, chapters.default_book_id,
-- chapters.default_page_start, notes_storage_prefix. Consistent
-- with this cycle's convention of keeping dead columns rather than
-- dropping something that might turn out to still be wanted.
-- =============================================================

BEGIN;

ALTER TABLE modules
  ADD COLUMN IF NOT EXISTS book_id UUID REFERENCES reference_books(id);

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS external_id TEXT;

DO $$
BEGIN
  ALTER TABLE questions ADD CONSTRAINT questions_external_id_key UNIQUE (external_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

COMMIT;
