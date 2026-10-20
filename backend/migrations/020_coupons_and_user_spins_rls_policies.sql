-- ==============================================================================
-- 020_coupons_and_user_spins_rls_policies.sql
-- ==============================================================================
-- Description: Fixes Row-Level Security (RLS) policies for coupons and user_spins.
--              Ensures that service_role, authenticated users, and public/anon
--              can insert, read, and update coupons and spin wheel records without
--              triggering 42501 (violates row-level security policy).
-- Run this in Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Ensure tables exist
CREATE TABLE IF NOT EXISTS coupons (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  discount_type VARCHAR(50) NOT NULL,  -- 'percentage', 'fixed', 'free_shipping'
  discount_value DECIMAL(10, 2),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_spins (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  last_spin_date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable Row-Level Security (RLS)
ALTER TABLE IF EXISTS coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_spins ENABLE ROW LEVEL SECURITY;

-- 3. Drop all existing policies on coupons (clean slate)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'coupons' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON coupons', pol.policyname);
  END LOOP;
END $$;

-- 4. Drop all existing policies on user_spins (clean slate)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'user_spins' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON user_spins', pol.policyname);
  END LOOP;
END $$;

-- 5. Service role: FULL unrestricted access (backend bypasses RLS)
CREATE POLICY "coupons_service_role_all"
  ON coupons FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "user_spins_service_role_all"
  ON user_spins FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 6. Coupons policies for authenticated and anon users
-- Allow selecting active/valid coupons (for validation and my-coupons)
CREATE POLICY "coupons_select_all"
  ON coupons FOR SELECT
  USING (true);

-- Allow inserting coupons (for spin-wheel and loyalty reward generation)
CREATE POLICY "coupons_insert_all"
  ON coupons FOR INSERT
  WITH CHECK (true);

-- Allow updating coupons (marking as used on checkout)
CREATE POLICY "coupons_update_all"
  ON coupons FOR UPDATE
  USING (true) WITH CHECK (true);

-- 7. User spins policies
CREATE POLICY "user_spins_select_all"
  ON user_spins FOR SELECT
  USING (true);

CREATE POLICY "user_spins_insert_all"
  ON user_spins FOR INSERT
  WITH CHECK (true);

CREATE POLICY "user_spins_update_all"
  ON user_spins FOR UPDATE
  USING (true) WITH CHECK (true);
