-- =============================================================
-- MediZee · 043_signup_source.sql
-- =============================================================
-- Remember where each student came from: a one-tap "How did you hear about
-- MediZee?" answer and the utm_* params of the landing URL.
--
--   profiles.signup_source  text   one of instagram | tiktok | friend |
--                                  class_group | other, else NULL
--   profiles.signup_utm     jsonb  only the five utm_* keys, each value cut
--                                  to 100 chars, else NULL
--
-- handle_new_auth_user() copies both from the signup metadata
-- (user_metadata.signup_source / signup_utm). Everything is re-validated here:
-- a missing or malformed value is stored as NULL and NEVER fails the signup.
-- The rest of the function is 040's strict body, unchanged.
--
-- Not client-writable: 031's allow-list rejects any column it doesn't list,
-- so students cannot edit these through PostgREST. The Google callback sets
-- them with the service role.
--
-- Safe either side of the app deploy: additive columns, and the old signup
-- form simply sends no source. Apply AFTER 040 (checked below).
-- Rollback is at the bottom.
-- =============================================================

BEGIN;

DO $$
BEGIN
  IF pg_get_functiondef('public.handle_new_auth_user()'::regprocedure) NOT LIKE '%username_required%' THEN
    RAISE EXCEPTION '043: apply 040 first (strict handle_new_auth_user missing)';
  END IF;
END
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_source TEXT,
  ADD COLUMN IF NOT EXISTS signup_utm JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_signup_source_known'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_signup_source_known
      CHECK (signup_source IS NULL
             OR signup_source IN ('instagram', 'tiktok', 'friend', 'class_group', 'other'));
  END IF;
END
$$;

COMMENT ON COLUMN public.profiles.signup_source IS
  'Self-reported "How did you hear about MediZee?" at signup. NULL = not answered.';
COMMENT ON COLUMN public.profiles.signup_utm IS
  'utm_* params from the landing URL at signup (first touch). NULL = none.';

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_year TEXT;
  chosen_year SMALLINT;
  chosen_username TEXT;
  raw_source TEXT;
  chosen_source TEXT;
  chosen_utm JSONB;
BEGIN
  -- Accept only 1–5 (keep in sync with ACADEMIC_YEAR_MIN/MAX in
  -- lib/academic-year.ts); anything else is stored as "not chosen" and
  -- the student is prompted on their next visit.
  raw_year := NEW.raw_user_meta_data ->> 'academic_year';
  IF raw_year ~ '^[1-5]$' THEN
    chosen_year := raw_year::SMALLINT;
  END IF;

  chosen_username := lower(btrim(coalesce(NEW.raw_user_meta_data ->> 'username', '')));
  IF chosen_username = '' THEN
    RAISE EXCEPTION 'username_required' USING ERRCODE = '23502';
  END IF;
  IF chosen_username !~ '^[a-z0-9_]{3,20}$' THEN
    RAISE EXCEPTION 'username_invalid' USING ERRCODE = '23514';
  END IF;
  IF public.is_reserved_username(chosen_username) THEN
    RAISE EXCEPTION 'username_reserved' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = chosen_username) THEN
    RAISE EXCEPTION 'username_taken' USING ERRCODE = '23505';
  END IF;

  -- Attribution: lenient, never fails the signup. Keep the source list in
  -- sync with SIGNUP_SOURCES in lib/signup-attribution.ts.
  raw_source := lower(btrim(coalesce(NEW.raw_user_meta_data ->> 'signup_source', '')));
  IF raw_source IN ('instagram', 'tiktok', 'friend', 'class_group', 'other') THEN
    chosen_source := raw_source;
  END IF;

  IF jsonb_typeof(NEW.raw_user_meta_data -> 'signup_utm') = 'object' THEN
    SELECT jsonb_object_agg(e.key, left(btrim(e.value), 100))
      INTO chosen_utm
      FROM jsonb_each_text(NEW.raw_user_meta_data -> 'signup_utm') AS e
     WHERE e.key IN ('utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content')
       AND btrim(e.value) <> '';
  END IF;

  INSERT INTO public.profiles (
    id, full_name, email, role, username, academic_year, academic_year_session,
    signup_source, signup_utm
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    'student',  -- never trust a client-supplied role
    chosen_username,
    chosen_year,
    CASE WHEN chosen_year IS NULL THEN NULL ELSE public.academic_session(now()) END,
    chosen_source,
    chosen_utm
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ---------- sanity check ----------------------------------------------
DO $$
DECLARE
  def TEXT := pg_get_functiondef('public.handle_new_auth_user()'::regprocedure);
BEGIN
  IF def NOT LIKE '%signup_source%' OR def NOT LIKE '%username_required%' THEN
    RAISE EXCEPTION '043: handle_new_auth_user did not land';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.handle_new_auth_user()'::regprocedure) THEN
    RAISE EXCEPTION '043: handle_new_auth_user lost SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', 'public.handle_new_auth_user()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.handle_new_auth_user()', 'EXECUTE') THEN
    RAISE EXCEPTION '043: handle_new_auth_user is executable by an API role';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'profiles'
         AND column_name IN ('signup_source', 'signup_utm')) <> 2 THEN
    RAISE EXCEPTION '043: signup_source / signup_utm columns missing';
  END IF;
END
$$;

COMMIT;

-- =============================================================
-- Rollback (manual): put 040's body back by re-running the CREATE OR
-- REPLACE FUNCTION in 040_require_username_on_signup.sql, then:
--
--   BEGIN;
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_signup_source_known;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS signup_source, DROP COLUMN IF EXISTS signup_utm;
--   COMMIT;
-- =============================================================
