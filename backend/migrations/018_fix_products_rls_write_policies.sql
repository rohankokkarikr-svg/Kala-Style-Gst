-- ==============================================================================
-- 018_fix_products_rls_write_policies.sql
-- ==============================================================================
-- Description: FORCE-FIXES Row-Level Security policies for the products table.
--              Drops all existing policies and recreates them cleanly.
--              Adds missing INSERT, UPDATE, DELETE policies for service_role,
--              authenticated (artisan/admin), and anon roles.
--              Resolves: product delete shows message but does not actually delete.
-- Run this in Supabase Dashboard → SQL Editor
-- ==============================================================================

-- Step 1: Enable RLS
ALTER TABLE IF EXISTS products ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL existing policies on products (clean slate)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'products' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON products', pol.policyname);
  END LOOP;
END $$;

-- Step 3: Force RLS
ALTER TABLE products FORCE ROW LEVEL SECURITY;

-- Step 4: Recreate all policies

-- service_role: FULL unrestricted access (backend bypasses RLS)
CREATE POLICY "products_service_role_all"
  ON products FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Public: SELECT (anyone can browse products)
CREATE POLICY "products_public_select"
  ON products FOR SELECT
  USING (true);

-- Authenticated (artisan/admin): INSERT new products
CREATE POLICY "products_authenticated_insert"
  ON products FOR INSERT TO authenticated
  WITH CHECK (true);

-- Authenticated (artisan/admin): UPDATE products
CREATE POLICY "products_authenticated_update"
  ON products FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Authenticated (artisan/admin): DELETE products
CREATE POLICY "products_authenticated_delete"
  ON products FOR DELETE TO authenticated
  USING (true);

-- Step 5: Also fix categories table (same missing write policies)
ALTER TABLE IF EXISTS categories ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'categories' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON categories', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "categories_service_role_all"
  ON categories FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "categories_public_select"
  ON categories FOR SELECT USING (true);

CREATE POLICY "categories_authenticated_write"
  ON categories FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Step 6: Also fix artisan_profiles table write policies
ALTER TABLE IF EXISTS artisan_profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'artisan_profiles' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON artisan_profiles', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "artisan_profiles_service_role_all"
  ON artisan_profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "artisan_profiles_public_select"
  ON artisan_profiles FOR SELECT USING (true);

CREATE POLICY "artisan_profiles_authenticated_write"
  ON artisan_profiles FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Step 7: Verify
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('products', 'categories', 'artisan_profiles') AND schemaname = 'public'
ORDER BY tablename, policyname;
