-- =============================================================
-- MediZee · 020_chapters_topic.sql
-- =============================================================
-- Adds the topic grouping the curriculum seed JSON always carried
-- but had nowhere to land — scripts/seed/seed-curriculum.ts
-- intentionally dropped it at seed time ("no schema home for it
-- currently") and the Catalogue's chapter list has been rendering
-- flat ever since as a result. This column gives it a home; a
-- follow-up backfill (not part of this migration) populates it from
-- the same seed JSON, matched by (module_code, subject_id, slug).
--
-- Nullable, no default: most chapters have no topic in the source
-- data (single-topic subjects within a module were never given one),
-- and that's correct, not a gap to fill in later.
-- =============================================================

BEGIN;

ALTER TABLE chapters
  ADD COLUMN IF NOT EXISTS topic TEXT;

COMMIT;
