-- ═══════════════════════════════════════════════════════════════════════════════
-- 008_auth_account_linking.sql
-- KalaStyle AI — Supabase Auth Account Linking & Role Indexing
--
-- Purpose:
--   1. Add supabase_uid column to users table for reliable Supabase Auth linking
--   2. Add indexes for fast case-insensitive email and phone lookups
--   3. Safe and fully idempotent (uses IF NOT EXISTS, no DROP, no destructive DDL)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add supabase_uid column for direct Supabase Auth user ID mapping ───────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS supabase_uid TEXT DEFAULT NULL;

-- ── 2. Create index on supabase_uid for fast session resolution ───────────────
CREATE INDEX IF NOT EXISTS idx_users_supabase_uid
  ON users (supabase_uid)
  WHERE supabase_uid IS NOT NULL;

-- ── 3. Create case-insensitive index on email ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email_lower
  ON users (LOWER(email));

-- ── 4. Create index on phone for fast identifier lookup ───────────────────────
CREATE INDEX IF NOT EXISTS idx_users_phone
  ON users (phone)
  WHERE phone IS NOT NULL;
