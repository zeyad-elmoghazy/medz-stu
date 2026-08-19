-- =============================================================
-- MedZ · 016_admin_activity_log.sql
-- =============================================================
-- Backs two things the Admin Dashboard spec requires that nothing
-- in the schema captured yet (Part 2.4, 2026-08-08):
--   1. Overview's unified Activity Log — a real feed (signups,
--      publishes/edits, suspensions, violations, streak
--      milestones), not just a DAU chart.
--   2. Content Library's per-question edit history — "what
--      changed, when, by whom" for every edit to a question,
--      including already-published ones.
--
-- One generic table serves both: the Overview feed is just
-- `SELECT * ORDER BY created_at DESC LIMIT n` unfiltered, and a
-- question's edit history is the same table filtered to
-- entity_type = 'question' AND entity_id = :id.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS activity_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,   -- 'question_published' | 'question_edited' | 'question_archived' |
                                 -- 'question_created' | 'user_suspended' | 'user_removed' |
                                 -- 'user_signed_up' | 'violation_logged' | 'streak_milestone' |
                                 -- 'module_created' | 'subject_created' | 'chapter_created' | ...
  entity_type  TEXT NOT NULL,   -- 'question' | 'user' | 'module' | 'subject' | 'chapter' | 'violation' | 'badge'
  entity_id    TEXT,            -- kept as TEXT since entity_id types vary (UUID vs module code TEXT)
  summary      TEXT NOT NULL,   -- short human-readable line for the feed, e.g. "Published Q123 in Module 207 · Endocrine System"
  diff         JSONB,           -- { field: { before, after } } for edits — null for non-edit actions
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log (entity_type, entity_id);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Admin-only — this is an internal operations feed, not a
-- student-facing table (unlike badges, which students can see on
-- each other's profiles).
CREATE POLICY "activity_log_admin_read" ON activity_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "activity_log_admin_insert" ON activity_log
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Questions: soft-delete via status='archived' rather than a hard
-- DELETE, so the Content Library's bulk-archive action and edit
-- history stay meaningful (an archived question's history is
-- still worth keeping). No schema change needed — 'archived' was
-- already a valid `questions.status` value per the original
-- 007_professor_authoring.sql check constraint.

COMMIT;
