-- =============================================================
-- MediZee · 039_student_usernames.sql
-- =============================================================
-- Students pick a unique username that the leaderboard shows instead of
-- their real name. This migration is the ADDITIVE, LENIENT half; apply it
-- BEFORE deploying the app. 040 (strict) is applied AFTER the deploy.
--
--   1. profiles.username_changed_at
--        NULL        = the student has not changed their username since
--                      first choosing it (that first change is free)
--        a timestamp = when they last changed it; the next change must wait
--                      30 days
--   2. is_reserved_username() + CHECK profiles_username_not_reserved
--        blocks names that could pass for staff (admin, support, medizee…).
--        Trailing digits/underscores are ignored, so admin1 is caught too.
--        Mirrors RESERVED_USERNAMES in lib/username.ts — change both.
--   3. enforce_username_rules (BEFORE UPDATE OF username)
--        - the first choice (NULL -> name) is free and does not start the clock
--        - a later change is refused for 30 days after the previous one
--        - API callers (anon / authenticated) can never clear a username
--        - service_role / the SQL editor bypass the cooldown and do NOT start
--          the student's clock (an admin renaming an offensive name must not
--          penalise the student)
--      The cooldown lives here, not in the API route, because the 031
--      allow-list lets a student update their own username straight through
--      PostgREST, around any route handler. username_changed_at is NOT in
--      that allow-list, so a client can never write it. The trigger name
--      sorts after enforce_profile_allowlist on purpose: the allow-list must
--      see only the client's own changes, before this trigger stamps the
--      column.
--   4. handle_new_auth_user() also stores the signup `username`.
--      LENIENT: a missing, malformed, reserved or taken name is stored as
--      NULL (the student is prompted at next login) instead of failing the
--      signup. 040 makes it strict.
--   5. get_leaderboard_top / get_student_rank no longer return full_name and
--      skip students without a username, so a real name can never leave the
--      database through the leaderboard.
--
-- Not changed: no NOT NULL on profiles.username. 103 existing students have
-- none yet, and a NOT NULL / CHECK would also make every UPDATE of their row
-- (record_quiz_result XP updates) fail.
--
-- Rollback is at the bottom.
-- =============================================================

BEGIN;

-- ---------- 1. cooldown column ---------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.username_changed_at IS
  'When the student last CHANGED their username (not when they first chose it). NULL = never changed. Stamped by enforce_username_rules; never writable by API roles.';

-- ---------- 2. reserved names ----------------------------------------
CREATE OR REPLACE FUNCTION public.is_reserved_username(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT regexp_replace(lower(p_username), '[_0-9]+$', '') = ANY (ARRAY[
    'admin', 'administrator', 'root', 'system', 'support', 'help', 'staff',
    'team', 'moderator', 'mod', 'official', 'owner', 'medizee', 'medz',
    'null', 'undefined', 'anonymous', 'you', 'security', 'leaderboard',
    'noreply'
  ]);
$$;

-- Called from the CHECK constraint below, i.e. as whoever writes the row, so
-- the API role that updates a profile needs EXECUTE. It is a pure function
-- with no data access. anon never writes profiles.
REVOKE EXECUTE ON FUNCTION public.is_reserved_username(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_reserved_username(TEXT) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_username_not_reserved'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_not_reserved
      CHECK (username IS NULL OR NOT public.is_reserved_username(username));
  END IF;
END
$$;

-- ---------- 3. change cooldown ---------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_username_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  claims TEXT;
  caller TEXT;
  next_allowed TIMESTAMPTZ;
BEGIN
  IF NEW.username IS NOT DISTINCT FROM OLD.username THEN
    RETURN NEW;
  END IF;

  -- Same caller detection as protect_profile_columns (031).
  claims := nullif(current_setting('request.jwt.claims', true), '');
  caller := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    CASE WHEN claims IS NOT NULL THEN claims::jsonb ->> 'role' END,
    nullif(current_setting('role', true), ''),
    'none'
  );

  -- service_role / SQL editor / migrations: no cooldown, clock untouched.
  IF caller NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NEW.username IS NULL THEN
    RAISE EXCEPTION 'username_required'
      USING ERRCODE = '23502';
  END IF;

  -- First choice: free, and it does not start the clock.
  IF OLD.username IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.username_changed_at IS NOT NULL THEN
    next_allowed := OLD.username_changed_at + INTERVAL '30 days';
    IF next_allowed > now() THEN
      -- DETAIL carries the UTC instant the student may change it again.
      RAISE EXCEPTION 'username_cooldown'
        USING ERRCODE = 'P0001',
              DETAIL = to_char(next_allowed AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    END IF;
  END IF;

  NEW.username_changed_at := now();
  RETURN NEW;
END;
$fn$;

-- Trigger-only function, not callable through the REST API (same as 031).
REVOKE ALL ON FUNCTION public.enforce_username_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_username_rules ON public.profiles;
CREATE TRIGGER enforce_username_rules
  BEFORE UPDATE OF username ON public.profiles
  FOR EACH ROW
  WHEN (NEW.username IS DISTINCT FROM OLD.username)
  EXECUTE FUNCTION public.enforce_username_rules();

-- ---------- 4. signup trigger (lenient) ------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_year TEXT;
  chosen_year SMALLINT;
  raw_username TEXT;
  chosen_username TEXT;
BEGIN
  -- Accept only 1–5 (keep in sync with ACADEMIC_YEAR_MIN/MAX in
  -- lib/academic-year.ts); anything else is stored as "not chosen" and
  -- the student is prompted on their next visit.
  raw_year := NEW.raw_user_meta_data ->> 'academic_year';
  IF raw_year ~ '^[1-5]$' THEN
    chosen_year := raw_year::SMALLINT;
  END IF;

  -- Same format as profiles_username_format (030). Anything unusable is
  -- stored as NULL; the student is prompted for a username at next login.
  raw_username := lower(btrim(coalesce(NEW.raw_user_meta_data ->> 'username', '')));
  IF raw_username ~ '^[a-z0-9_]{3,20}$'
     AND NOT public.is_reserved_username(raw_username)
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = raw_username)
  THEN
    chosen_username := raw_username;
  END IF;

  BEGIN
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
  EXCEPTION WHEN unique_violation THEN
    -- Someone took the username between the check above and the insert.
    -- Without a username there is nothing left to retry: re-raise.
    IF chosen_username IS NULL THEN
      RAISE;
    END IF;
    INSERT INTO public.profiles (
      id, full_name, email, role, username, academic_year, academic_year_session
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.email,
      'student',
      NULL,
      chosen_year,
      CASE WHEN chosen_year IS NULL THEN NULL ELSE public.academic_session(now()) END
    )
    ON CONFLICT (id) DO NOTHING;
  END;

  RETURN NEW;
END;
$$;

-- ---------- 5. leaderboard RPCs: usernames only -----------------------
-- The return type changes (full_name dropped), which CREATE OR REPLACE
-- cannot do. Privileges are rebuilt exactly as 028/031/034 left them:
-- SECURITY DEFINER, pinned search_path, executable by service_role only.
DROP FUNCTION IF EXISTS public.get_leaderboard_top(INTEGER);
DROP FUNCTION IF EXISTS public.get_student_rank(UUID);

CREATE FUNCTION public.get_leaderboard_top(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  id UUID,
  username TEXT,
  total_xp INTEGER,
  total_correct_answers INTEGER,
  total_questions_answered INTEGER,
  last_active_at TIMESTAMPTZ,
  highest_badge TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (RANK() OVER (ORDER BY p.total_xp DESC, p.total_correct_answers DESC, p.id))::INTEGER AS rank,
    p.id,
    p.username,
    p.total_xp,
    p.total_correct_answers,
    p.total_questions_answered,
    p.last_active_at,
    (
      SELECT b.badge_type FROM badges b
      WHERE b.student_id = p.id
      ORDER BY
        CASE b.badge_type WHEN 'streak_30' THEN 3 WHEN 'streak_14' THEN 2 WHEN 'streak_7' THEN 1 ELSE 0 END DESC
      LIMIT 1
    ) AS highest_badge
  FROM profiles p
  WHERE p.role = 'student' AND p.username IS NOT NULL
  ORDER BY p.total_xp DESC, p.total_correct_answers DESC, p.id
  LIMIT p_limit;
$$;

CREATE FUNCTION public.get_student_rank(p_student_id UUID)
RETURNS TABLE (
  rank INTEGER,
  id UUID,
  username TEXT,
  total_xp INTEGER,
  total_correct_answers INTEGER,
  total_questions_answered INTEGER,
  last_active_at TIMESTAMPTZ,
  highest_badge TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      (SELECT COUNT(*) FROM profiles o
       WHERE o.role = 'student' AND o.username IS NOT NULL AND o.total_xp > p.total_xp)
      + 1
    )::INTEGER AS rank,
    p.id,
    p.username,
    p.total_xp,
    p.total_correct_answers,
    p.total_questions_answered,
    p.last_active_at,
    (
      SELECT b.badge_type FROM badges b
      WHERE b.student_id = p.id
      ORDER BY
        CASE b.badge_type WHEN 'streak_30' THEN 3 WHEN 'streak_14' THEN 2 WHEN 'streak_7' THEN 1 ELSE 0 END DESC
      LIMIT 1
    ) AS highest_badge
  FROM profiles p
  WHERE p.id = p_student_id AND p.role = 'student' AND p.username IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_leaderboard_top(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_student_rank(UUID)       FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_leaderboard_top(INTEGER) TO service_role;
GRANT  EXECUTE ON FUNCTION public.get_student_rank(UUID)       TO service_role;

-- ---------- sanity check: abort if anything didn't land --------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username_changed_at'
  ) THEN
    RAISE EXCEPTION '039: profiles.username_changed_at missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'enforce_username_rules' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION '039: enforce_username_rules trigger missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_not_reserved'
  ) THEN
    RAISE EXCEPTION '039: profiles_username_not_reserved missing';
  END IF;

  IF pg_get_function_result('public.get_leaderboard_top(integer)'::regprocedure) LIKE '%full_name%'
     OR pg_get_function_result('public.get_student_rank(uuid)'::regprocedure) LIKE '%full_name%' THEN
    RAISE EXCEPTION '039: a leaderboard RPC still returns full_name';
  END IF;

  IF has_function_privilege('anon', 'public.get_leaderboard_top(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_leaderboard_top(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_student_rank(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_student_rank(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '039: a leaderboard RPC is executable by an API role';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.get_leaderboard_top(integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_student_rank(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '039: service_role cannot execute a leaderboard RPC';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.handle_new_auth_user()'::regprocedure) THEN
    RAISE EXCEPTION '039: handle_new_auth_user lost SECURITY DEFINER';
  END IF;
END
$$;

COMMIT;

-- =============================================================
-- Rollback (manual). The leaderboard functions come back with full_name
-- from 025, then re-lock them as 028/031/034 did.
--
--   BEGIN;
--   DROP TRIGGER IF EXISTS enforce_username_rules ON public.profiles;
--   DROP FUNCTION IF EXISTS public.enforce_username_rules();
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_not_reserved;
--   DROP FUNCTION IF EXISTS public.is_reserved_username(TEXT);
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS username_changed_at;
--   -- handle_new_auth_user(): re-run its definition from 030 (sections
--   --   "signup trigger").
--   -- get_leaderboard_top / get_student_rank: DROP both, re-run their
--   --   definitions from 025, then:
--   --   REVOKE EXECUTE ON FUNCTION public.get_leaderboard_top(integer)
--   --     FROM PUBLIC, anon, authenticated;
--   --   REVOKE EXECUTE ON FUNCTION public.get_student_rank(uuid)
--   --     FROM PUBLIC, anon, authenticated;
--   --   GRANT EXECUTE ON FUNCTION public.get_leaderboard_top(integer) TO service_role;
--   --   GRANT EXECUTE ON FUNCTION public.get_student_rank(uuid) TO service_role;
--   --   ALTER FUNCTION public.get_leaderboard_top(integer) SET search_path = public;
--   --   ALTER FUNCTION public.get_student_rank(uuid) SET search_path = public;
--   COMMIT;
-- =============================================================
