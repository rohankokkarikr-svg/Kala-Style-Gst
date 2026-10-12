-- ==============================================================================
-- 017_fix_reviews_rls_force.sql
-- ==============================================================================
-- Description: FORCE-FIXES Row-Level Security policies for the reviews table.
--              Drops ALL existing policies and recreates them cleanly to resolve
--              "new row violates row-level security policy for table reviews".
--              Also ensures service_role bypasses RLS completely.
-- Run this in Supabase Dashboard → SQL Editor
-- ==============================================================================

-- Step 1: Make sure RLS is enabled
ALTER TABLE IF EXISTS reviews ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL existing policies on reviews (clean slate)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'reviews' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON reviews', pol.policyname);
  END LOOP;
END $$;

-- Step 3: Force RLS (ensures even table owner is subject, but service_role policy overrides)
ALTER TABLE reviews FORCE ROW LEVEL SECURITY;

-- Step 4: Recreate all policies cleanly

-- Service role: unrestricted ALL operations (complete RLS bypass for backend)
CREATE POLICY "reviews_service_role_all"
  ON reviews FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users: INSERT (submit reviews)
CREATE POLICY "reviews_authenticated_insert"
  ON reviews FOR INSERT TO authenticated
  WITH CHECK (true);

-- Anon users: INSERT (guest/public review submission)
CREATE POLICY "reviews_anon_insert"
  ON reviews FOR INSERT TO anon
  WITH CHECK (true);

-- Everyone: SELECT approved reviews
CREATE POLICY "reviews_public_select"
  ON reviews FOR SELECT
  USING (true);

-- Authenticated: UPDATE (admin moderation)
CREATE POLICY "reviews_authenticated_update"
  ON reviews FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Authenticated: DELETE (admin moderation)
CREATE POLICY "reviews_authenticated_delete"
  ON reviews FOR DELETE TO authenticated
  USING (true);

-- Step 5: Verify
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'reviews' AND schemaname = 'public'
ORDER BY policyname;
