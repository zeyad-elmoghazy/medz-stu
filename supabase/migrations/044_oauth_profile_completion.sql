-- =============================================================
-- MediZee · 044_oauth_profile_completion.sql
-- =============================================================
-- "Continue with Google". A Google signup has no username or academic year:
-- those are collected AFTER sign-in by the "Finish setting up" prompt in the
-- student layout. 040's trigger raised username_required for any signup
-- without a username, so every Google signup would have failed with
-- "Database error saving new user".
--
-- This relaxes ONLY that case. handle_new_auth_user() = 043's body, except:
--
--   provider (auth.users.raw_app_meta_data ->> 'provider'), default 'email'
--     'email' (form signup, dashboard "Add user", admin.createUser)
--         unchanged: a valid, unused, non-reserved username is REQUIRED.
--     anything else (google, ...)
--         a missing username is stored as NULL. A username that IS supplied
--         is still validated exactly as above (a bad one still fails).
--
-- raw_app_meta_data is written by the auth server, never by the client, so a
-- form signup cannot claim to be a Google signup to skip the username check.
--
-- A student with no username is not ranked (leaderboard RPCs, 039 §5) and the
-- UI blocks them with the prompt until they choose one (profile allow-list,
-- 031, lets them set it; 039's trigger gives that first choice for free).
--
-- Apply AFTER 043 (checked below). Safe either side of the app deploy: it only
-- relaxes a check, and no email flow changes. Rollback is at the bottom.
-- =============================================================

BEGIN;

DO $$
BEGIN
  IF pg_get_functiondef('public.handle_new_auth_user()'::regprocedure) NOT LIKE '%signup_source%' THEN
    RAISE EXCEPTION '044: apply 043 first (signup_source handling missing)';
  END IF;
END
$$;

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
  is_email_signup BOOLEAN;
  raw_source TEXT;
  chosen_source TEXT;
  chosen_utm JSONB;
BEGIN
  is_email_signup := coalesce(NEW.raw_app_meta_data ->> 'provider', 'email') = 'email';

  -- Accept only 1–5 (keep in sync with ACADEMIC_YEAR_MIN/MAX in
  -- lib/academic-year.ts); anything else is stored as "not chosen" and
  -- the student is prompted on their next visit.
  raw_year := NEW.raw_user_meta_data ->> 'academic_year';
  IF raw_year ~ '^[1-5]$' THEN
    chosen_year := raw_year::SMALLINT;
  END IF;

  chosen_username := lower(btrim(coalesce(NEW.raw_user_meta_data ->> 'username', '')));
  IF chosen_username = '' THEN
    IF is_email_signup THEN
      RAISE EXCEPTION 'username_required' USING ERRCODE = '23502';
    END IF;
    chosen_username := NULL;  -- OAuth: chosen after sign-in
  ELSE
    IF chosen_username !~ '^[a-z0-9_]{3,20}$' THEN
      RAISE EXCEPTION 'username_invalid' USING ERRCODE = '23514';
    END IF;
    IF public.is_reserved_username(chosen_username) THEN
      RAISE EXCEPTION 'username_reserved' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username = chosen_username) THEN
      RAISE EXCEPTION 'username_taken' USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Attribution (043): lenient, never fails the signup. Keep the source
  -- list in sync with SIGNUP_SOURCES in lib/signup-attribution.ts.
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
    coalesce(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
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
  IF def NOT LIKE '%is_email_signup%' OR def NOT LIKE '%username_required%'
     OR def NOT LIKE '%signup_source%' THEN
    RAISE EXCEPTION '044: handle_new_auth_user did not land';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.handle_new_auth_user()'::regprocedure) THEN
    RAISE EXCEPTION '044: handle_new_auth_user lost SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', 'public.handle_new_auth_user()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.handle_new_auth_user()', 'EXECUTE') THEN
    RAISE EXCEPTION '044: handle_new_auth_user is executable by an API role';
  END IF;
END
$$;

COMMIT;

-- =============================================================
-- Rollback (manual): re-run the CREATE OR REPLACE FUNCTION from
-- 043_signup_source.sql. Google signups then fail again with
-- "Database error saving new user"; existing Google students keep their rows.
-- =============================================================
