-- =============================================================
-- MediZee · 023_rename_upload_jobs_admin_policy.sql
-- =============================================================
-- upload_jobs_prof_own predates the B2C pivot and reads as
-- professor-scoped, but it's actually what permits
-- app/api/admin/content/upload/route.ts's INSERT/UPDATE into
-- upload_jobs today — that route runs on the RLS-bound client
-- (requireAdmin(), not service-role) and sets professor_id: user.id
-- to the admin's own id, so this ownership-scoped policy is what's
-- actually load-bearing (confirmed while removing the rest of the
-- professor surface in 022_drop_professor_surface.sql — this one
-- policy was deliberately kept for exactly this reason).
--
-- Renaming only, via ALTER POLICY ... RENAME TO — not DROP+CREATE —
-- so the USING clause (professor_id = auth.uid()) is guaranteed
-- byte-identical, zero risk of the rename silently changing what it
-- protects.
-- =============================================================

BEGIN;

ALTER POLICY "upload_jobs_prof_own" ON upload_jobs
  RENAME TO "upload_jobs_admin_own";

COMMIT;
