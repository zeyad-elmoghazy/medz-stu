-- =============================================================
-- MediZee · 040_require_username_on_signup.sql
-- =============================================================
-- Apply AFTER 039 AND AFTER the app that sends `username` at signup is
-- deployed. From here on no auth user can be created without a valid,
-- unused, non-reserved username in its signup metadata:
--
--   user_metadata.username  missing / blank        -> username_required
--                           not ^[a-z0-9_]{3,20}$   -> username_invalid
--                           reserved (admin, …)     -> username_reserved
--                           already in use          -> username_taken
--
-- Why a separate step: this trigger makes the OLD signup form (no username
-- field) fail with "Database error saving new user". 039 therefore ships the
-- lenient version first, and this strict one goes live once the new form is.
--
-- GoTrue hides the trigger's message from the browser (it only returns
-- "Database error saving new user"), so the signup page re-checks the name
-- against /api/auth/username-available to explain what went wrong.
--
-- Anything that creates auth users OUTSIDE the signup form — the Supabase
-- dashboard "Add user", auth.admin.createUser in scripts and tests — must now
-- pass { "username": "…" } in user_metadata too.
--
-- Race: two signups for one name at the same instant both pass the check
-- above; the second INSERT then hits the UNIQUE constraint on
-- profiles.username (unique_violation) and its signup fails cleanly.
--
-- Rollback is at the bottom.
-- =============================================================

BEGIN;

DO $$
BEGIN
  -- Fail loudly if 040 is applied before 039.
  IF to_regprocedure('public.is_reserved_username(text)') IS NULL THEN
    RAISE EXCEPTION '040: apply 039 first (is_reserved_username missing)';
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

  INSERT INTO public.profiles (
    id, full_name, email, role, username, academic_year, academic_year_session
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    'student',  -- never trust a client-supplied role
    chosen_username,
    chosen_year,
    CASE WHEN chosen_year IS NULL THEN NULL ELSE public.academic_session(now()) END
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
  IF def NOT LIKE '%username_required%' THEN
    RAISE EXCEPTION '040: strict handle_new_auth_user did not land';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.handle_new_auth_user()'::regprocedure) THEN
    RAISE EXCEPTION '040: handle_new_auth_user lost SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', 'public.handle_new_auth_user()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.handle_new_auth_user()', 'EXECUTE') THEN
    RAISE EXCEPTION '040: handle_new_auth_user is executable by an API role';
  END IF;
END
$$;

COMMIT;

-- =============================================================
-- Rollback (manual): put the lenient 039 version back by re-running
-- section "4. signup trigger (lenient)" of 039_student_usernames.sql.
-- =============================================================
