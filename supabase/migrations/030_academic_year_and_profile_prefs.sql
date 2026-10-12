-- =============================================================
-- MedZ · 030_academic_year_and_profile_prefs.sql
-- =============================================================
-- 1. Students record the academic year they are in (1–5).
--    We store the year they CHOSE plus the academic SESSION in which
--    they chose it, and derive the current year on read:
--
--      current_year = LEAST(5, academic_year
--                              + academic_session(now())
--                              - academic_year_session)
--
--    so the year advances every 1 September with no scheduled job.
--    The TypeScript twin is lib/academic-year.ts — keep them in sync.
--
-- 2. Notification preferences move from localStorage into the DB.
--
-- 3. SECURITY FIX: handle_new_auth_user() (006) accepted the role
--    from raw_user_meta_data, so anyone calling
--    supabase.auth.signUp({ options: { data: { role: 'admin' } } })
--    directly got an admin profile. New profiles are always
--    'student'; admins are promoted by hand
--    (UPDATE profiles SET role = 'admin' WHERE email = '...').
--
-- Additive and backwards-compatible: every new column is nullable or
-- defaulted, so this can be applied BEFORE the app code that reads it.
--
-- Rollback (manual):
--   ALTER TABLE profiles DROP COLUMN academic_year, DROP COLUMN
--     academic_year_session, DROP COLUMN notify_email, DROP COLUMN
--     notify_reminders;
--   DROP FUNCTION academic_session(timestamptz);
--   -- then re-apply 006_profile_on_signup.sql to restore the old trigger.
-- =============================================================

-- ---------- columns --------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS academic_year          SMALLINT,
  ADD COLUMN IF NOT EXISTS academic_year_session  SMALLINT,
  ADD COLUMN IF NOT EXISTS notify_email           BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_reminders       BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_academic_year_range'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_academic_year_range
      CHECK (academic_year IS NULL OR academic_year BETWEEN 1 AND 5);
  END IF;

  -- Year and session are only meaningful together.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_academic_year_pair'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_academic_year_pair
      CHECK ((academic_year IS NULL) = (academic_year_session IS NULL));
  END IF;

  -- Usernames are shown on the leaderboard; keep them URL/handle-safe.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_format'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_format
      CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,20}$');
  END IF;
END
$$;

-- ---------- academic session -----------------------------------------
-- A session starts on 1 September (Africa/Cairo) and is identified by the
-- calendar year it starts in: 2026 = Sep 2026 – Aug 2027.
CREATE OR REPLACE FUNCTION public.academic_session(ts TIMESTAMPTZ DEFAULT now())
RETURNS SMALLINT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (
    CASE
      WHEN EXTRACT(MONTH FROM ts AT TIME ZONE 'Africa/Cairo') >= 9
        THEN EXTRACT(YEAR FROM ts AT TIME ZONE 'Africa/Cairo')
      ELSE EXTRACT(YEAR FROM ts AT TIME ZONE 'Africa/Cairo') - 1
    END
  )::SMALLINT
$$;

-- ---------- signup trigger -------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_year TEXT;
  chosen_year SMALLINT;
BEGIN
  -- Accept only 1–5 (keep in sync with ACADEMIC_YEAR_MIN/MAX in
  -- lib/academic-year.ts); anything else is stored as "not chosen" and
  -- the student is prompted on their next visit.
  raw_year := NEW.raw_user_meta_data ->> 'academic_year';
  IF raw_year ~ '^[1-5]$' THEN
    chosen_year := raw_year::SMALLINT;
  END IF;

  INSERT INTO public.profiles (
    id, full_name, email, role, academic_year, academic_year_session
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    'student',  -- never trust a client-supplied role
    chosen_year,
    CASE WHEN chosen_year IS NULL THEN NULL ELSE public.academic_session(now()) END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
