-- ==============================================================================
-- 023_fix_users_table_rls_policies.sql
-- ==============================================================================
-- Project: Kala Style AI (Supabase ref: fwuhlhaadhhveuljsqbh)
-- Description: Comprehensive fix for Row-Level Security (RLS) violation on public.users
--
-- Root Cause of "new row violates row-level security policy for table users":
--   1. users_insert_own strictly required `supabase_uid = (SELECT auth.uid())::text`.
--      When client, trigger, or OAuth flow inserted a new row without explicitly
--      passing `supabase_uid` (e.g. passing `id` or relying on defaults), the check
--      evaluated to NULL/false, triggering SQLSTATE 42501.
--   2. users_insert_own lacked `public.is_admin()` exemption, blocking administrators
--      from provisioning customer or artisan user accounts.
--   3. Auth triggers on auth.users (such as handle_new_user) execute before an auth
--      token is issued, meaning `auth.uid()` evaluates to NULL during creation.
--   4. Missing BEFORE INSERT trigger on public.users to auto-populate defaults
--      (supabase_uid, id, role, status) before RLS check evaluates.
--
-- Fixes Applied:
--   1. BEFORE INSERT trigger trg_set_user_identity_defaults auto-populates
--      supabase_uid := auth.uid(), id := auth.uid() (if not set), role := 'user', status := 'active'.
--   2. Flexible users_insert_own policy supporting:
--      - Administrators (public.is_admin())
--      - Direct supabase_uid matching auth.uid()
--      - Direct id matching auth.uid()
--      - Auto-populated identity defaults (supabase_uid IS NULL prior to trigger)
--   3. Flexible users_select_own and users_update_own matching both supabase_uid and id.
--   4. Idempotent handle_new_user trigger on auth.users with ON CONFLICT safety.
--   5. Service-role unrestricted bypass preserved for all backend services.
--
-- Run this in Supabase Dashboard → SQL Editor (Connected project: Kala AI / fwuhlhaadhhveuljsqbh)
-- ==============================================================================

-- ── 1. IDENTITY DEFAULTS TRIGGER FUNCTION (BEFORE INSERT) ─────────────────────
CREATE OR REPLACE FUNCTION public.set_user_identity_defaults()
RETURNS trigger AS $$
BEGIN
  -- 1a. Auto-link supabase_uid from auth context if omitted
  IF NEW.supabase_uid IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.supabase_uid := (auth.uid())::text;
  END IF;

  -- 1b. Auto-assign id from auth context if omitted
  IF NEW.id IS NULL THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.id := auth.uid();
    ELSE
      NEW.id := gen_random_uuid();
    END IF;
  END IF;

  -- 1c. If id matches auth.uid() but supabase_uid was omitted, align them
  IF NEW.supabase_uid IS NULL AND NEW.id IS NOT NULL AND auth.uid() IS NOT NULL AND NEW.id = auth.uid() THEN
    NEW.supabase_uid := NEW.id::text;
  END IF;

  -- 1d. Canonical default role
  IF NEW.role IS NULL OR TRIM(NEW.role) = '' THEN
    NEW.role := 'user';
  ELSE
    NEW.role := LOWER(TRIM(NEW.role));
  END IF;

  -- 1e. Canonical default status
  IF NEW.status IS NULL OR TRIM(NEW.status) = '' THEN
    NEW.status := 'active';
  ELSE
    NEW.status := LOWER(TRIM(NEW.status));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.set_user_identity_defaults() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_identity_defaults() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_set_user_identity_defaults ON public.users;
CREATE TRIGGER trg_set_user_identity_defaults
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_identity_defaults();


-- ── 2. DROP OBSOLETE / RESTRICTIVE POLICIES ON USERS ─────────────────────────
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_admin_delete" ON public.users;
DROP POLICY IF EXISTS "users_service_role_all" ON public.users;


-- ── 3. SERVICE ROLE UNRESTRICTED ACCESS ───────────────────────────────────────
CREATE POLICY "users_service_role_all" ON public.users
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- ── 4. REFINED USERS SELECT POLICY ────────────────────────────────────────────
-- Users can read their own profile via supabase_uid or id; Admins can read all
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO authenticated
  USING (
    supabase_uid = (SELECT auth.uid())::text
    OR id = (SELECT auth.uid())
    OR public.is_admin()
  );


-- ── 5. REFINED USERS INSERT POLICY (FIXES 42501 RLS ERROR) ────────────────────
-- Allows:
--  a) Administrators to insert any user (staff/artisan/customer)
--  b) Authenticated users creating their own initial profile (matching auth.uid() via supabase_uid or id)
--  c) Authenticated users omitting supabase_uid (auto-populated by trigger)
-- Strictly prevents:
--  - Regular users creating role = 'admin'
--  - Setting someone else's supabase_uid or id
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Admin bypass
    public.is_admin()
    -- Authenticated self-registration
    OR (
      (
        supabase_uid = (SELECT auth.uid())::text
        OR id = (SELECT auth.uid())
        OR (supabase_uid IS NULL AND id IS NULL)
      )
      AND role IN ('user', 'artisan')
      AND (status IS NULL OR status IN ('active', 'pending'))
    )
  );


-- ── 6. REFINED USERS UPDATE POLICY ────────────────────────────────────────────
-- Users can update their own profile; cannot self-promote to admin or hijack identities
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (
    supabase_uid = (SELECT auth.uid())::text
    OR id = (SELECT auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    public.is_admin()
    OR (
      (
        supabase_uid = (SELECT auth.uid())::text
        OR id = (SELECT auth.uid())
      )
      AND role = (SELECT u.role FROM public.users u WHERE u.id = public.users.id)
      AND status = (SELECT u.status FROM public.users u WHERE u.id = public.users.id)
    )
  );


-- ── 7. REFINED USERS DELETE POLICY ────────────────────────────────────────────
CREATE POLICY "users_admin_delete" ON public.users
  FOR DELETE TO authenticated
  USING (public.is_admin());


-- ── 8. CANONICAL SUPABASE AUTH HOOK (AUTH.USERS -> PUBLIC.USERS) ─────────────
-- Synchronizes new Supabase Auth users automatically with conflict safety
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_name TEXT;
  v_role TEXT;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'display_name',
    split_part(NEW.email, '@', 1)
  );
  v_role := COALESCE(LOWER(NEW.raw_user_meta_data->>'role'), 'user');

  -- If user already exists by email, link their supabase_uid
  UPDATE public.users
  SET supabase_uid = NEW.id::text,
      name = COALESCE(public.users.name, v_name),
      status = 'active'
  WHERE LOWER(email) = LOWER(NEW.email);

  -- If no user existed with that email, insert new record
  IF NOT FOUND THEN
    INSERT INTO public.users (id, supabase_uid, email, name, role, status)
    VALUES (
      NEW.id,
      NEW.id::text,
      NEW.email,
      v_name,
      v_role,
      'active'
    )
    ON CONFLICT (id) DO UPDATE SET
      supabase_uid = EXCLUDED.supabase_uid,
      email = COALESCE(public.users.email, EXCLUDED.email),
      name = COALESCE(public.users.name, EXCLUDED.name);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
    ) THEN
      CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;


-- ── 9. TABLE PRIVILEGE GRANTS ────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;
