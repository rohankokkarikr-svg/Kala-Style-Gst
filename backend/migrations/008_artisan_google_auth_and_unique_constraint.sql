-- ============================================================
-- Migration 008: Artisan Google Auth Identity & Unique Constraint
-- KalaStyle AI — One-to-One Supabase Identity Guarantee & Artisan Sync
-- ============================================================

-- 1. Ensure partial unique index on supabase_uid for users
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase_uid_unique 
  ON users (supabase_uid) 
  WHERE supabase_uid IS NOT NULL;

-- 2. Synchronize any users who have artisan profiles to role = 'artisan'
UPDATE users 
SET role = 'artisan' 
WHERE id IN (SELECT user_id FROM artisan_profiles WHERE user_id IS NOT NULL)
  AND role != 'admin';

-- 3. Fast lookup index on artisan_profiles(user_id)
CREATE INDEX IF NOT EXISTS idx_artisan_profiles_user_id ON artisan_profiles(user_id);
