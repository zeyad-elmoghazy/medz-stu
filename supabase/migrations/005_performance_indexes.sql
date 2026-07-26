-- =============================================
-- MedZ · 005_performance_indexes.sql
-- =============================================
-- Production-scale tuning for the MedZ Supabase project.
-- Runs LAST so every table it indexes has been created:
--   001 → 003 → 004 → 005.
--
-- Indexes here are plain (not CONCURRENTLY). CONCURRENTLY is
-- valuable on a live table (avoids locking writers) but forbidden
-- inside a transaction/pipeline, and the Supabase CLI applies
-- each migration file inside an implicit pipeline. On a fresh
-- database with no rows there are no writers to protect, so
-- plain CREATE INDEX is correct.
--
-- If you later add indexes to a table with live traffic, put
-- them in a NEW migration and apply them via the SQL editor
-- with "Run in transaction" UNCHECKED so CONCURRENTLY is legal.
--
-- ---------------------------------------------------------------
-- Scale targets (read this before tuning further)
-- ---------------------------------------------------------------
--   PgBouncer transaction pooling
--     → unlocks 500-2,000 concurrent app sessions on a Pro-tier
--       instance with only ~15 real Postgres connections.
--     → required as soon as you cross ~50 concurrent users; without
--       it Postgres serial-forks and CPU hits 100% under burst load.
--
--   B-tree indexes on profiles / quiz_sessions / bookmarks / notes
--     → keep p50 row lookup <2 ms past 10K rows; past 100K, the
--       difference between indexed and seq-scan is 10-50x.
--     → composite (student_id, subject_id) collapses the hottest
--       student-history query into a single index range scan.
--
--   profiles.email + violations.occurred_at indexes
--     → admin search-by-email and time-windowed audit queries stay
--       sub-100 ms up to ~1M rows.
--
--   student_analytics materialized view (refreshed hourly)
--     → swaps a per-load aggregation of N quiz_sessions rows for an
--       O(1) lookup. Pays off at ~1K students × ~50 sessions each
--       (50K rows) and scales linearly past that.
--     → REFRESH CONCURRENTLY keeps dashboards readable during the
--       hourly cron pass.
--
--   quiz_sessions monthly range partitioning
--     → designed for the >1M row regime (~10K active students × 10
--       sessions/month × 12 months). Partition pruning + smaller
--       per-partition indexes keep "last 90 days" queries fast and
--       lets you DROP old partitions instead of paying for VACUUM.
-- =============================================


-- =============================================
-- CONNECTION POOLING
-- =============================================
-- Note: Add this comment block for the developer:
-- In Supabase dashboard → Settings → Database:
-- Enable PgBouncer connection pooler
-- Mode: Transaction (not Session)
-- This multiplexes hundreds of app connections
-- into a small number of real DB connections
-- Set pool size to 15 for Pro tier
--
-- Connection string to use in NEXT_PUBLIC_SUPABASE_URL clients:
--   postgres://...@<project>.pooler.supabase.com:6543/postgres
-- (port 6543 = pooler, port 5432 = direct — keep 5432 reserved
-- for migrations and long-running jobs only.)


-- =============================================
-- INDEXES FOR ALL HIGH-TRAFFIC QUERIES
-- =============================================

-- profiles: most queried by auth.uid() and role.
-- Postgres auto-creates a unique btree on the PK (id), so no
-- explicit idx_profiles_id is needed.
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON profiles(email);

-- quiz_sessions: students query their own history
-- frequently, and admins filter by subject
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student
  ON quiz_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_subject
  ON quiz_sessions(subject_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_completed
  ON quiz_sessions(completed_at DESC);

-- Composite index for the most common query:
-- "get this student's sessions for this subject"
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student_subject
  ON quiz_sessions(student_id, subject_id);

-- bookmarks: student retrieves all their bookmarks
CREATE INDEX IF NOT EXISTS idx_bookmarks_student
  ON bookmarks(student_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_question
  ON bookmarks(student_id, question_id);

-- notes: same pattern as bookmarks
CREATE INDEX IF NOT EXISTS idx_notes_student
  ON notes(student_id);
CREATE INDEX IF NOT EXISTS idx_notes_question
  ON notes(student_id, question_id);

-- violations: admin queries by student and time
CREATE INDEX IF NOT EXISTS idx_violations_student
  ON violations(student_id);
CREATE INDEX IF NOT EXISTS idx_violations_time
  ON violations(occurred_at DESC);


-- =============================================
-- MATERIALIZED VIEW FOR ANALYTICS
-- =============================================
-- Instead of computing accuracy on every
-- dashboard load, pre-compute it:

CREATE MATERIALIZED VIEW student_analytics AS
SELECT
  student_id,
  subject_id,
  COUNT(*)            AS total_sessions,
  AVG(accuracy)       AS avg_accuracy,
  MAX(accuracy)       AS best_accuracy,
  SUM(score)          AS total_correct,
  MAX(completed_at)   AS last_active
FROM quiz_sessions
GROUP BY student_id, subject_id;

-- Required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX ON student_analytics(student_id, subject_id);

-- Refresh this view every hour via pg_cron. Enable the extension
-- here so the schedule call below succeeds without a manual
-- Dashboard toggle. Supabase permits CREATE EXTENSION pg_cron on
-- the default database.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'refresh-analytics',
  '0 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY student_analytics'
);


-- =============================================
-- PARTITIONING FOR quiz_sessions
-- =============================================
-- When quiz_sessions exceeds 1M rows,
-- queries slow down. Partition by month:
--
-- Note for developer: Run this BEFORE the table
-- has data. If you already have data, create
-- quiz_sessions_partitioned alongside, copy rows,
-- swap names in a transaction, then drop the old
-- table. Application reads/writes target the
-- parent table — partition routing is automatic.

CREATE TABLE quiz_sessions_partitioned (
  id                UUID        DEFAULT gen_random_uuid(),
  student_id        UUID        REFERENCES profiles(id),
  subject_id        TEXT,
  answers           JSONB,
  score             INTEGER,
  accuracy          DECIMAL,
  violations_count  INTEGER     DEFAULT 0,
  completed_at      TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (completed_at);

-- Indexes on the parent propagate to every partition,
-- so the per-student/per-subject hot path stays fast.
CREATE INDEX ON quiz_sessions_partitioned (student_id);
CREATE INDEX ON quiz_sessions_partitioned (subject_id);
CREATE INDEX ON quiz_sessions_partitioned (student_id, subject_id);
CREATE INDEX ON quiz_sessions_partitioned (completed_at DESC);

-- Create partitions for the next 12 months.
-- Each month is its own physical table — Postgres
-- prunes them at planning time when queries filter
-- by completed_at.
CREATE TABLE quiz_sessions_2026_01
  PARTITION OF quiz_sessions_partitioned
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE quiz_sessions_2026_02
  PARTITION OF quiz_sessions_partitioned
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE quiz_sessions_2026_03
  PARTITION OF quiz_sessions_partitioned
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE quiz_sessions_2026_04
  PARTITION OF quiz_sessions_partitioned
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE quiz_sessions_2026_05
  PARTITION OF quiz_sessions_partitioned
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE quiz_sessions_2026_06
  PARTITION OF quiz_sessions_partitioned
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE quiz_sessions_2026_07
  PARTITION OF quiz_sessions_partitioned
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE quiz_sessions_2026_08
  PARTITION OF quiz_sessions_partitioned
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE quiz_sessions_2026_09
  PARTITION OF quiz_sessions_partitioned
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE quiz_sessions_2026_10
  PARTITION OF quiz_sessions_partitioned
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE quiz_sessions_2026_11
  PARTITION OF quiz_sessions_partitioned
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE quiz_sessions_2026_12
  PARTITION OF quiz_sessions_partitioned
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- A catch-all partition for inserts that drift past
-- the last pre-created month. Without this, an INSERT
-- whose completed_at lands outside every range will
-- error out. Treat traffic landing here as a signal
-- that the cron below has fallen behind.
CREATE TABLE quiz_sessions_default
  PARTITION OF quiz_sessions_partitioned DEFAULT;

-- =============================================
-- AUTOMATED PARTITION MAINTENANCE
-- =============================================
-- Manually pre-creating 12 partitions per year is brittle.
-- Automate it with pg_partman, which Supabase exposes as
-- an extension. Run once during the cutover:
--
--   CREATE EXTENSION IF NOT EXISTS pg_partman;
--   SELECT partman.create_parent(
--     p_parent_table     => 'public.quiz_sessions_partitioned',
--     p_control          => 'completed_at',
--     p_type             => 'native',
--     p_interval         => 'monthly',
--     p_premake          => 6           -- always keep 6 future months ready
--   );
--
-- Then schedule pg_partman's housekeeper hourly so it
-- pre-creates upcoming partitions and (optionally) drops
-- partitions older than your retention window:
--
--   SELECT cron.schedule(
--     'partman-maintenance',
--     '0 * * * *',
--     'CALL partman.run_maintenance_proc()'
--   );
--
-- Retention policy (set on the parent's partman config row):
--   UPDATE partman.part_config
--     SET retention            = '24 months',
--         retention_keep_table = false
--     WHERE parent_table = 'public.quiz_sessions_partitioned';
