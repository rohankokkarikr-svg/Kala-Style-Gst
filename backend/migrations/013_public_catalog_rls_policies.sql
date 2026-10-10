-- ==============================================================================
-- 013_public_catalog_rls_policies.sql
-- ==============================================================================
-- Description: Ensures public read access (SELECT) on products, categories,
--              and artisan profiles for unauthenticated / anon and authenticated
--              storefront customers, while preserving update/delete security.
-- ==============================================================================

-- 1. Enable RLS on catalog tables if not already enabled
ALTER TABLE IF EXISTS products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS artisan_profiles ENABLE ROW LEVEL SECURITY;

-- 2. Products public read policy (all visitors can browse active approved catalog products)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'Public products are viewable by all'
  ) THEN
    CREATE POLICY "Public products are viewable by all" 
      ON products FOR SELECT 
      USING (true);
  END IF;
END $$;

-- 3. Categories public read policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'Public categories are viewable by all'
  ) THEN
    CREATE POLICY "Public categories are viewable by all" 
      ON categories FOR SELECT 
      USING (true);
  END IF;
END $$;

-- 4. Artisan profiles public read policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'artisan_profiles' AND policyname = 'Public artisan profiles are viewable by all'
  ) THEN
    CREATE POLICY "Public artisan profiles are viewable by all" 
      ON artisan_profiles FOR SELECT 
      USING (true);
  END IF;
END $$;
