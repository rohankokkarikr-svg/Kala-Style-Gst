-- ==============================================================================
-- 012_master_source_audit_and_moderation_guards.sql
-- ==============================================================================
-- Description: Hardens product moderation status, non-negative stock, positive prices,
--              canonical artisan profile verification status, and audit log tables.
-- Safe Application Order:
--   1. Dry-run / review in isolated staging database.
--   2. Verify no active checkouts before running DDL.
--   3. Apply to Supabase SQL editor.
-- ==============================================================================

-- 1. Product Moderation & Integrity Constraints
ALTER TABLE products 
  ALTER COLUMN status SET DEFAULT 'pending';

-- Migrate any legacy NULL or invalid status products to pending
UPDATE products 
SET status = 'pending' 
WHERE status IS NULL OR status NOT IN ('pending', 'approved', 'rejected');

-- Add check constraint for valid product statuses if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_status_valid'
  ) THEN
    ALTER TABLE products 
      ADD CONSTRAINT chk_products_status_valid 
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- Enforce positive finite prices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_price_positive'
  ) THEN
    ALTER TABLE products 
      ADD CONSTRAINT chk_products_price_positive 
      CHECK (price > 0);
  END IF;
END $$;

-- Enforce non-negative stock (anti-overselling at database level)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_stock_non_negative'
  ) THEN
    ALTER TABLE products 
      ADD CONSTRAINT chk_products_stock_non_negative 
      CHECK (stock >= 0);
  END IF;
END $$;

-- 2. Artisan Profile Verification Default
ALTER TABLE artisan_profiles 
  ALTER COLUMN verification_status SET DEFAULT 'pending';

UPDATE artisan_profiles 
SET verification_status = 'pending' 
WHERE verification_status IS NULL;

-- 3. Activity and Moderation Audit Logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(100) NOT NULL,
  actor_id UUID,
  actor_role VARCHAR(50),
  entity_id VARCHAR(100),
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor ON activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- 4. Payment and Order Indexes for Idempotency
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id ON orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_order_id ON payments(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id ON payments(provider_payment_id);
