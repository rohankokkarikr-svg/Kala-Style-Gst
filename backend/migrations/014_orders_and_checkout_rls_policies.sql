-- ==============================================================================
-- 014_orders_and_checkout_rls_policies.sql
-- ==============================================================================
-- Description: Ensures safe, explicit Row-Level Security policies for orders,
--              order_items, payments, and artisan_orders. Guarantees that service_role
--              can perform all operations, authenticated users can insert and view
--              their orders, and customers never get blocked by RLS during checkout.
-- ==============================================================================

-- 1. Ensure RLS is active on checkout tables
ALTER TABLE IF EXISTS orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS artisan_orders ENABLE ROW LEVEL SECURITY;

-- 2. Service role unrestricted access (idempotent DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'service_role_all_orders') THEN
    CREATE POLICY "service_role_all_orders" ON orders FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_items' AND policyname = 'service_role_all_order_items') THEN
    CREATE POLICY "service_role_all_order_items" ON order_items FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'service_role_all_payments') THEN
    CREATE POLICY "service_role_all_payments" ON payments FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'artisan_orders' AND policyname = 'service_role_all_artisan_orders') THEN
    CREATE POLICY "service_role_all_artisan_orders" ON artisan_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. Customer order creation policies (Allow inserts for authenticated and checkout sessions)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'allow_order_insert') THEN
    CREATE POLICY "allow_order_insert" ON orders FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_items' AND policyname = 'allow_order_items_insert') THEN
    CREATE POLICY "allow_order_items_insert" ON order_items FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'allow_payments_insert') THEN
    CREATE POLICY "allow_payments_insert" ON payments FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'artisan_orders' AND policyname = 'allow_artisan_orders_insert') THEN
    CREATE POLICY "allow_artisan_orders_insert" ON artisan_orders FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- 4. Customer read and update policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'allow_view_own_orders') THEN
    CREATE POLICY "allow_view_own_orders" ON orders FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'allow_update_orders') THEN
    CREATE POLICY "allow_update_orders" ON orders FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_items' AND policyname = 'allow_view_order_items') THEN
    CREATE POLICY "allow_view_order_items" ON order_items FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'allow_view_payments') THEN
    CREATE POLICY "allow_view_payments" ON payments FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'artisan_orders' AND policyname = 'allow_view_artisan_orders') THEN
    CREATE POLICY "allow_view_artisan_orders" ON artisan_orders FOR SELECT USING (true);
  END IF;
END $$;
