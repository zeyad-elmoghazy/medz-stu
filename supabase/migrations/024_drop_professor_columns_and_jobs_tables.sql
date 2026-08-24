-- =============================================================
-- MediZee · 024_drop_professor_columns_and_jobs_tables.sql
-- =============================================================
-- Final piece of the professor-surface removal
-- (022_drop_professor_surface.sql, 023_rename_upload_jobs_admin_
-- policy.sql). Confirmed via information_schema before writing this
-- migration: zero FK constraints (formal or informal/column-level),
-- zero views, zero triggers reference jobs.id or upload_jobs.id
-- from any other table — both tables were empty (0 rows) at time of
-- writing, and questions/modules.professor_id are always NULL
-- (confirmed earlier in this session's professor-surface audit).
--
-- questions.professor_id and modules.professor_id are dropped as
-- always-NULL columns, not as data loss — questions' 27 real rows
-- (Spinal Cord import) are otherwise untouched by this migration.
-- =============================================================

BEGIN;

ALTER TABLE modules DROP COLUMN IF EXISTS professor_id;
ALTER TABLE questions DROP COLUMN IF EXISTS professor_id;

DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS upload_jobs;

COMMIT;
