-- =============================================
-- MedZ · 003_jobs_table.sql
-- =============================================
-- Background job tracking table.
--
-- Lifecycle:
--   queued     → row inserted by /api/professor/upload
--   processing → worker has picked the job up
--   completed  → success; `result` jsonb is populated
--   failed     → worker error; `error` text is populated
--
-- The professor dashboard polls /api/jobs/status/[jobId] every
-- few seconds and reads `status` + `result` to drive the
-- pipeline progress bar.
-- =============================================

CREATE TABLE jobs (
  id            TEXT PRIMARY KEY,                       -- QStash messageId or app-generated UUID
  professor_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,                          -- 'generate_questions', 'export_data', etc.
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  result        JSONB,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

-- Polling endpoint queries by id (PK is sufficient).
-- Dashboard "my recent jobs" view queries by professor_id + recency.
CREATE INDEX idx_jobs_professor_created
  ON jobs(professor_id, created_at DESC);

-- Filter "still-running" jobs without scanning completed history.
CREATE INDEX idx_jobs_status
  ON jobs(status)
  WHERE status IN ('queued', 'processing');

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Professors can only see their own jobs:
CREATE POLICY "professor_own_jobs" ON jobs
  FOR ALL USING (professor_id = auth.uid());

-- The worker runs with the service role key (which bypasses RLS)
-- so it can update any row. No additional service-role policy
-- is required — service_role IS the RLS bypass.
