-- ==============================================================================
-- Migration: 026_resilient_auth_user_trigger_phone.sql
-- Project: KalaStyle AI (Supabase ref: fwuhlhaadhhveuljsqbh)
--
-- PURPOSE:
--   1. Ensures handle_new_user() trigger on auth.users gracefully handles
--      phone-only users or missing email without throwing NOT NULL constraint
--      violations on public.users(email).
--   2. Prevents any 500 "Database error saving new user" during phone OTP operations.
-- ==============================================================================

-- 1. Ensure public.users email column allows fallback generation or nullable
ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;

-- 2. Update handle_new_user() hook on auth.users -> public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_name TEXT;
  v_role TEXT;
  v_email TEXT;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'display_name',
    split_part(NEW.email, '@', 1),
    'User ' || substring(NEW.id::text, 1, 8)
  );
  v_role := COALESCE(LOWER(NEW.raw_user_meta_data->>'role'), 'user');
  
  -- Generate fallback email if auth user was created with phone only
  v_email := COALESCE(
    NEW.email,
    CASE 
      WHEN NEW.phone IS NOT NULL AND NEW.phone <> '' THEN NEW.phone || '@phone.kalastyle.ai'
      ELSE 'user_' || substring(NEW.id::text, 1, 8) || '@kalastyle.ai'
    END
  );

  -- Step 1: If user already exists by email, link their supabase_uid
  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    UPDATE public.users
    SET supabase_uid = NEW.id::text,
        name = COALESCE(public.users.name, v_name),
        status = 'active',
        phone = COALESCE(public.users.phone, NEW.phone)
    WHERE LOWER(email) = LOWER(NEW.email);
  END IF;

  -- Step 2: If no existing user matched by email, insert safely
  IF NOT FOUND THEN
    INSERT INTO public.users (id, supabase_uid, email, name, role, password, status, phone)
    VALUES (
      NEW.id,
      NEW.id::text,
      v_email,
      v_name,
      v_role,
      '',
      'active',
      NEW.phone
    )
    ON CONFLICT (id) DO UPDATE SET
      supabase_uid = EXCLUDED.supabase_uid,
      email = COALESCE(public.users.email, EXCLUDED.email),
      name = COALESCE(public.users.name, EXCLUDED.name),
      phone = COALESCE(public.users.phone, EXCLUDED.phone);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated, service_role;
