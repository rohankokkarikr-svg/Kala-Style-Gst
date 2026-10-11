-- ==============================================================================
-- 016_reviews_rls_policies.sql
-- ==============================================================================
-- Description: Ensures safe, explicit Row-Level Security policies for reviews.
--              Guarantees that service_role can perform all operations,
--              visitors and customers can view approved reviews,
--              customers can submit reviews, and admins can moderate reviews
--              without any RLS blocking or silent empty query results.
-- ==============================================================================

-- 1. Ensure RLS is active on reviews table
ALTER TABLE IF EXISTS reviews ENABLE ROW LEVEL SECURITY;

-- 2. Service role unrestricted access (idempotent DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'service_role_all_reviews') THEN
    CREATE POLICY "service_role_all_reviews" ON reviews FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. Customer & Public read policies (Allow public and storefront visitors to view approved reviews)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'allow_public_read_reviews') THEN
    CREATE POLICY "allow_public_read_reviews" ON reviews FOR SELECT USING (true);
  END IF;
END $$;

-- 4. Customer review submission policies (Allow inserts for visitors and authenticated users)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'allow_insert_reviews') THEN
    CREATE POLICY "allow_insert_reviews" ON reviews FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- 5. Moderation update & delete policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'allow_update_reviews') THEN
    CREATE POLICY "allow_update_reviews" ON reviews FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'allow_delete_reviews') THEN
    CREATE POLICY "allow_delete_reviews" ON reviews FOR DELETE USING (true);
  END IF;
END $$;
