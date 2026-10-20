-- =============================================================
-- MedZ · 033_question_flag_admin.sql
-- =============================================================
-- Admin side of "student reports a question".
--
-- question_flags (007) and its trigger, which keeps
-- questions.flag_count = number of UNRESOLVED flags, have existed
-- since the professor surface, but nothing ever wrote to the table
-- and 022 dropped the only policy that let anyone other than the
-- reporting student read it. This migration:
--
--   * adds resolved_at / resolved_by so the admin dashboard can show
--     who closed a report and when;
--   * pins the reason vocabulary and caps the free-text detail, so a
--     student can't park an unbounded blob in the table;
--   * gives admins SELECT + UPDATE on every flag (the "Reports" tab
--     on /admin/content reads and resolves them through the
--     request-scoped client, never a service-role one).
--
-- Students keep exactly what they had: INSERT their own row and
-- SELECT their own rows. There is still no student UPDATE/DELETE,
-- so a report can't be edited or withdrawn after it is sent, and a
-- student can't flip `resolved` on their own report.
--
-- The table is empty on the live project (0 rows at the time of
-- writing), so the CHECK constraints can be added validated.
-- =============================================================

BEGIN;

ALTER TABLE question_flags
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE question_flags DROP CONSTRAINT IF EXISTS question_flags_reason_check;
ALTER TABLE question_flags
  ADD CONSTRAINT question_flags_reason_check
  CHECK (reason IN ('wrong_answer', 'ambiguous', 'typo', 'wrong_reference', 'other'));

ALTER TABLE question_flags DROP CONSTRAINT IF EXISTS question_flags_detail_len_check;
ALTER TABLE question_flags
  ADD CONSTRAINT question_flags_detail_len_check
  CHECK (detail IS NULL OR char_length(detail) <= 1000);

-- Newest-first listing in the admin Reports tab.
CREATE INDEX IF NOT EXISTS idx_flags_created
  ON question_flags(created_at DESC);

DROP POLICY IF EXISTS "flags_admin_select" ON question_flags;
CREATE POLICY "flags_admin_select" ON question_flags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "flags_admin_update" ON question_flags;
CREATE POLICY "flags_admin_update" ON question_flags
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

COMMIT;
