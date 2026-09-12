-- ============================================================
-- 005_atomic_inventory_and_guards.sql — Atomic Inventory Stored Procedures & Indexes
-- ============================================================

-- 1. Atomic Stock Deduction Function (Eliminates Race Conditions)
-- Executes row-level locked deduction. Returns TRUE if stock was successfully deducted,
-- FALSE if insufficient inventory (preventing overselling).
CREATE OR REPLACE FUNCTION deduct_product_stock(p_product_id UUID, p_quantity INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_affected INT;
BEGIN
  UPDATE products
  SET stock_quantity = stock_quantity - p_quantity,
      is_in_stock = (stock_quantity - p_quantity > 0),
      updated_at = NOW()
  WHERE id = p_product_id
    AND stock_quantity >= p_quantity;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected > 0;
END;
$$;

-- 2. Atomic Stock Restoration Function
-- Restores inventory on cancellation, payment failure, or rejection.
CREATE OR REPLACE FUNCTION restore_product_stock(p_product_id UUID, p_quantity INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_affected INT;
BEGIN
  UPDATE products
  SET stock_quantity = COALESCE(stock_quantity, 0) + p_quantity,
      is_in_stock = TRUE,
      updated_at = NOW()
  WHERE id = p_product_id;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected > 0;
END;
$$;

-- 3. Non-negative Stock Check Constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_stock_non_negative'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT chk_products_stock_non_negative CHECK (stock_quantity >= 0);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4. High-Performance Indexes for Marketplace & Ecommerce Operations
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_risk_status ON orders(risk_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_artisan_id ON products(artisan_id);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);

CREATE INDEX IF NOT EXISTS idx_artisan_orders_artisan_id ON artisan_orders(artisan_id);
CREATE INDEX IF NOT EXISTS idx_artisan_orders_order_id ON artisan_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_artisan_orders_status ON artisan_orders(status);

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_ai_admin_actions_created_at ON ai_admin_actions(created_at DESC);
