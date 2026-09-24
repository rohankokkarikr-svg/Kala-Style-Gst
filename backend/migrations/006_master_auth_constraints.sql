-- ============================================================
-- Migration 006: Master Authentication Constraints & Indexes
-- KalaStyle AI — Idempotent Auth Stabilization
-- ============================================================

-- 1. Ensure supabase_uid column exists on public.users
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS supabase_uid UUID;

-- 2. Partial unique index on supabase_uid (ensures 1-to-1 mapping while allowing NULL for password-only users)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase_uid_unique 
  ON users (supabase_uid) 
  WHERE supabase_uid IS NOT NULL;

-- 3. Case-insensitive unique index on email
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique 
  ON users (LOWER(email));

-- 4. Unique constraint on artisan_profiles user_id (ensures 1-to-1 relationship with users)
CREATE UNIQUE INDEX IF NOT EXISTS idx_artisan_profiles_user_id_unique 
  ON artisan_profiles (user_id);

-- 5. Standard indices on users status and role for fast session lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
