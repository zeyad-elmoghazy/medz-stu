-- =============================================================
-- Admin read access to all profiles
-- =============================================================
-- A policy on `profiles` can't subquery `profiles` directly to
-- check the caller's role — that's self-referential and RLS
-- evaluates the policy recursively, so Postgres just rejects it.
-- The fix is a SECURITY DEFINER function: it runs as its owner,
-- bypassing RLS internally, so the role lookup itself doesn't
-- re-trigger the policy on `profiles`.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE POLICY "profiles_admin_select" ON profiles
  FOR SELECT USING (is_admin());
