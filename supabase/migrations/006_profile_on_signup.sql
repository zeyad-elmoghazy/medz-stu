-- =============================================================
-- MedZ · 006_profile_on_signup.sql
-- =============================================================
-- Auto-provision a public.profiles row every time a new user
-- appears in auth.users. Standard Supabase pattern: without this,
-- the sign-up flow has to do a client-side INSERT into profiles
-- immediately after auth.signUp, and that INSERT hits an RLS
-- violation because auth.uid() isn't set yet when email
-- confirmations are enabled (Supabase's default).
--
-- SECURITY DEFINER makes the trigger run as the function owner
-- (postgres role) rather than as the calling role, which lets it
-- INSERT past the profiles_owner_insert policy.
--
-- Metadata contract:
--   auth.signUp({ options: { data: { full_name, role } } })
-- populates auth.users.raw_user_meta_data with those keys. The
-- trigger reads them; if role is missing or unknown, we default
-- to 'student' so a malformed signup can't wedge auth.
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role TEXT;
  final_role     TEXT;
BEGIN
  requested_role := NEW.raw_user_meta_data ->> 'role';
  IF requested_role IN ('student', 'professor', 'admin') THEN
    final_role := requested_role;
  ELSE
    final_role := 'student';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    final_role
  )
  ON CONFLICT (id) DO NOTHING;  -- Idempotent: safe if a client
                                -- INSERT beat the trigger.

  RETURN NEW;
END;
$$;

-- Drop first so re-applying the migration replaces cleanly.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
