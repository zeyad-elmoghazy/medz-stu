-- =============================================================
-- MedZ · 001_initial_schema.sql
-- =============================================================
-- Foundation tables. Apply this BEFORE 002, 003, 004 on a fresh
-- Supabase project — every later migration references at least
-- one table declared here.
--
-- Tables created:
--   profiles     — user row keyed to auth.users, with role gate
--   questions    — published MCQ bank (source of truth for the
--                  quiz submit path; hard-coded histology bundle
--                  in data/histology-questions.ts is a seed target)
--   violations   — anti-cheat events raised by the proctor overlay,
--                  referenced by admin audit queries + 002 indexes
--
-- Run order:
--   001 → 003 → 004 → 005
--   File numbering NOW matches run order after renaming what was
--   002_performance_indexes.sql → 005_performance_indexes.sql so
--   `supabase db push` (which applies alphabetically) picks the
--   dependency order automatically.
--     - 001 creates foundation tables (profiles, questions,
--       violations).
--     - 003 adds quiz_sessions and the student personalization
--       tables.
--     - 004 adds the jobs table for the background worker.
--     - 005 is the performance pass (indexes, materialized view,
--       partitioning) — must run last so every referenced table
--       exists.
-- =============================================================


-- =============================================================
-- TABLE: profiles
-- =============================================================
-- One row per authenticated user, joined 1:1 with auth.users via
-- shared UUID. Role is the primary authorization gate everywhere
-- in the app (middleware, route handlers, RLS policies).
--
-- The 'admin' role is intentionally NOT selectable in the signup
-- form — promote a user manually:
--   UPDATE profiles SET role = 'admin' WHERE email = '...';
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  email       TEXT,
  role        TEXT NOT NULL
              CHECK (role IN ('student', 'professor', 'admin')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Owner can read + insert + update their own profile row.
-- The service-role client bypasses RLS entirely, so
-- worker/admin paths don't need extra policies here.
CREATE POLICY "profiles_owner_select" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_owner_insert" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_owner_update" ON profiles
  FOR UPDATE USING (auth.uid() = id);


-- =============================================================
-- TABLE: questions
-- =============================================================
-- The published MCQ bank. Every subject's block lives here — no
-- more hard-coded TS bundles in the shipping build.
--
-- Shape mirrors HistologyQuestion in data/histology-questions.ts
-- so the seed script can transliterate 1:1:
--   choices             JSONB  — [{id, text}, ...]
--   choice_rationales   JSONB  — { a: "...", b: "...", ... } | null
--
-- id                — surrogate PK, referenced by bookmarks/notes
-- subject_bundle_id — the ID a question had inside its source
--                     bundle (e.g. the number 1..30 in the
--                     seeded histology TS module, or an id emitted
--                     by the AI generation worker). Combined with
--                     subject_id, gives the seed script and the
--                     future professor-upload worker a stable
--                     upsert key: ON CONFLICT (subject_id,
--                     subject_bundle_id) DO NOTHING is idempotent.
CREATE TABLE IF NOT EXISTS questions (
  id                 BIGSERIAL PRIMARY KEY,
  subject_id         TEXT NOT NULL,
  subject_bundle_id  INTEGER NOT NULL,
  question           TEXT NOT NULL,
  choices            JSONB NOT NULL,
  correct_answer     TEXT NOT NULL,
  explanation        TEXT NOT NULL DEFAULT '',
  choice_rationales  JSONB,
  reference          TEXT NOT NULL DEFAULT '',
  topic              TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subject_id, subject_bundle_id)
);

-- Hot path: "give me every question for this subject, in the
-- stable bundle order the professor authored." The quiz start
-- route and the submit-scoring path both scan by subject and
-- rely on that ordering.
CREATE INDEX IF NOT EXISTS idx_questions_subject
  ON questions(subject_id, subject_bundle_id);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- Published bank is readable by any signed-in user.
-- Writes go through the service role only (professor upload
-- worker + seed scripts) — no INSERT/UPDATE/DELETE policy here.
CREATE POLICY "questions_authenticated_read" ON questions
  FOR SELECT USING (auth.role() = 'authenticated');


-- =============================================================
-- TABLE: violations
-- =============================================================
-- Anti-cheat audit trail. Written by the proctor overlay on the
-- quiz page (tab-switch, fullscreen exit, paste, etc.) and read
-- by the admin dashboard.
--
-- quiz_session_id is nullable so events raised before the row
-- exists (e.g. focus loss during question 1) still get logged.
-- No FK on quiz_session_id — the target table is created in 003,
-- which runs AFTER this file. If you want the FK later, add it
-- in a follow-up migration once both tables are in place.
CREATE TABLE IF NOT EXISTS violations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quiz_session_id  UUID,
  subject_id       TEXT,
  kind             TEXT NOT NULL,   -- 'tab_switch' | 'fullscreen_exit' | 'paste' | ...
  detail           JSONB,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE violations ENABLE ROW LEVEL SECURITY;

-- Student can INSERT their own events (the overlay lives in the
-- browser and posts as the signed-in student). Nobody except the
-- service role can SELECT — admin dashboards go through a
-- service-role endpoint.
CREATE POLICY "violations_student_insert" ON violations
  FOR INSERT WITH CHECK (student_id = auth.uid());
