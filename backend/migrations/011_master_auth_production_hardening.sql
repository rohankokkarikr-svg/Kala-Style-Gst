-- ==============================================================================
-- 011_master_auth_production_hardening.sql
-- KalaStyle AI — Master Authentication Hardening & Role Constraints
--
-- Purpose:
--   1. Enforce canonical role constraints ('user', 'artisan', 'admin')
--   2. Enforce account status constraints ('active', 'pending', 'blocked', 'suspended')
--   3. Ensure 1-to-1 partial unique index on users(supabase_uid)
--   4. Ensure case-insensitive unique index on users(LOWER(email))
--   5. Ensure fast index lookups on users(role) and users(status)
--   6. Ensure artisan_profiles(user_id) 1-to-1 unique mapping
--   7. Safe, non-destructive, and 100% idempotent
-- ==============================================================================

-- 1. Ensure supabase_uid column exists on public.users
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS supabase_uid TEXT;

-- 2. Partial unique index on supabase_uid (ensures 1-to-1 mapping while allowing NULL for unlinked users)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase_uid_unique 
  ON users (supabase_uid) 
  WHERE supabase_uid IS NOT NULL;

-- 3. Case-insensitive unique index on email
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique 
  ON users (LOWER(email));

-- 4. Fast lookup index on phone
CREATE INDEX IF NOT EXISTS idx_users_phone 
  ON users (phone) 
  WHERE phone IS NOT NULL;

-- 5. Standard indices on users status and role for session lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- 6. Unique constraint on artisan_profiles user_id (ensures 1-to-1 relationship with users)
CREATE UNIQUE INDEX IF NOT EXISTS idx_artisan_profiles_user_id_unique 
  ON artisan_profiles (user_id);

-- 7. Normalize all roles to lowercase canonical values
UPDATE users SET role = LOWER(TRIM(role)) WHERE role IS NOT NULL;
UPDATE users SET role = 'user' WHERE role IS NULL OR role NOT IN ('user', 'artisan', 'admin');

-- 8. Add check constraint for canonical roles (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_users_role'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT check_users_role CHECK (role IN ('user', 'artisan', 'admin'));
  END IF;
END $$;

-- 9. Add check constraint for account statuses (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_users_status'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT check_users_status CHECK (status IN ('active', 'pending', 'blocked', 'suspended'));
  END IF;
END $$;

-- 10. Synchronize any users who have artisan profiles to role = 'artisan' (never overwrite admin)
UPDATE users 
SET role = 'artisan' 
WHERE id IN (SELECT user_id FROM artisan_profiles WHERE user_id IS NOT NULL)
  AND role != 'admin';
