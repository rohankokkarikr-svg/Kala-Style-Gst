-- ==============================================================================
-- Migration: 025_fix_auth_user_trigger_password.sql
-- Project: KalaStyle AI (Supabase ref: fwuhlhaadhhveuljsqbh)
--
-- PURPOSE:
--   1. Drops NOT NULL constraint on public.users(password) so that accounts
--      created via Supabase Auth (OTP, Google OAuth, Magic Link) can insert
--      without failing the database constraint.
--   2. Sets default empty string on public.users(password) for safety.
--   3. Updates public.handle_new_user() trigger function to safely provide
--      default password and prevent rollback during user creation in auth.users.
-- ==============================================================================

-- 1. Modify password column in public.users
ALTER TABLE public.users ALTER COLUMN password DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN password SET DEFAULT '';

-- 2. Update handle_new_user() hook on auth.users -> public.users
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

  -- Step 1: If user already exists by email, link their supabase_uid
  UPDATE public.users
  SET supabase_uid = NEW.id::text,
      name = COALESCE(public.users.name, v_name),
      status = 'active'
  WHERE LOWER(email) = LOWER(NEW.email);

  -- Step 2: If no existing user matched by email, insert with default password
  IF NOT FOUND THEN
    INSERT INTO public.users (id, supabase_uid, email, name, role, password, status)
    VALUES (
      NEW.id,
      NEW.id::text,
      NEW.email,
      v_name,
      v_role,
      '',
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
