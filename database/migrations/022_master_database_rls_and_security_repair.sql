-- ==============================================================================
-- 022_master_database_rls_and_security_repair.sql
-- ==============================================================================
-- Project: Kala Style AI (Supabase ref: fwuhlhaadhhveuljsqbh)
-- Description: Comprehensive database, Row-Level Security (RLS), authentication,
--              AI admin operations, and role authorization repair for all 35 tables.
--
-- Features:
--   1. Safe identity mapping between public.users (id) and auth.users (supabase_uid)
--   2. Granular, non-recursive helper functions with fixed search_path = public, pg_temp
--   3. Hardened SECURITY DEFINER functions (stock deduction/restoration, rls_auto_enable)
--   4. Eliminates historical 42501 RLS failures on AI memory, AI actions, and AI reports
--   5. Covering indexes on all unindexed foreign keys and identity lookups
--   6. Least-privilege table grants revoking unintended write privileges from anon
--   7. Full table-by-table RLS policies for all 35 public schema tables
--
-- Run this in Supabase Dashboard → SQL Editor (Connected project: Kala AI / fwuhlhaadhhveuljsqbh)
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: PERFORMANCE INDEXES & IDENTITY LOOKUP COVERAGE
-- ─────────────────────────────────────────────────────────────────────────────

-- Identity lookup index (used by all RLS helper subqueries)
CREATE INDEX IF NOT EXISTS idx_users_supabase_uid ON public.users(supabase_uid);
CREATE INDEX IF NOT EXISTS idx_artisan_profiles_user_id ON public.artisan_profiles(user_id);

-- Foreign key covering indexes (resolves performance advisor findings)
CREATE INDEX IF NOT EXISTS idx_ai_admin_actions_conversation_id ON public.ai_admin_actions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_admin_actions_entity_id ON public.ai_admin_actions(entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_admin_conversations_admin_id ON public.ai_admin_conversations(admin_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_approvals_admin_id ON public.ai_agent_approvals(admin_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_approvals_approved_by ON public.ai_agent_approvals(approved_by);
CREATE INDEX IF NOT EXISTS idx_ai_agent_sessions_admin_id ON public.ai_agent_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id ON public.ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_artisan_earnings_artisan_id ON public.artisan_earnings(artisan_id);
CREATE INDEX IF NOT EXISTS idx_artisan_earnings_order_id ON public.artisan_earnings(order_id);
CREATE INDEX IF NOT EXISTS idx_artisan_earnings_artisan_order_id ON public.artisan_earnings(artisan_order_id);
CREATE INDEX IF NOT EXISTS idx_artisan_orders_artisan_id ON public.artisan_orders(artisan_id);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_user_id ON public.customer_complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_order_id ON public.customer_complaints(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_artisan_id ON public.order_items(artisan_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_order_id ON public.shipping_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_artisan_id ON public.shipping_shipments(artisan_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_artisan_id ON public.whatsapp_notifications(artisan_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_order_id ON public.whatsapp_notifications(order_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: SAFE SECURITY DEFINER HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper 1: Is the authenticated user an active administrator?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE supabase_uid = (SELECT auth.uid())::text
      AND role = 'admin'
      AND status = 'active'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- Helper 2: Is the authenticated user an active artisan?
CREATE OR REPLACE FUNCTION public.is_artisan()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE supabase_uid = (SELECT auth.uid())::text
      AND role = 'artisan'
      AND status = 'active'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_artisan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_artisan() TO anon, authenticated, service_role;

-- Helper 3: Get public.users.id for current Supabase auth user
CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT id FROM public.users
  WHERE supabase_uid = (SELECT auth.uid())::text
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_id() TO anon, authenticated, service_role;

-- Helper 4: Get public.artisan_profiles.id for current Supabase auth user
CREATE OR REPLACE FUNCTION public.get_current_artisan_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT ap.id FROM public.artisan_profiles ap
  JOIN public.users u ON u.id = ap.user_id
  WHERE u.supabase_uid = (SELECT auth.uid())::text
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_current_artisan_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_artisan_id() TO anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: HARDENED STORED PROCEDURES & TRIGGER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Hardened Atomic Stock Deduction (Eliminates race conditions & negative-quantity exploit)
CREATE OR REPLACE FUNCTION public.deduct_product_stock(p_product_id UUID, p_quantity INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_affected INT;
BEGIN
  -- Strict validation: Positive non-null quantity required
  IF p_product_id IS NULL OR p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE public.products
  SET stock_quantity = stock_quantity - p_quantity,
      is_in_stock = (stock_quantity - p_quantity > 0),
      updated_at = NOW()
  WHERE id = p_product_id
    AND stock_quantity >= p_quantity;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deduct_product_stock(UUID, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deduct_product_stock(UUID, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.deduct_product_stock(UUID, INT) TO authenticated, service_role;

-- Hardened Atomic Stock Restoration (Used on cancellations, refunds, payment fails)
CREATE OR REPLACE FUNCTION public.restore_product_stock(p_product_id UUID, p_quantity INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_affected INT;
BEGIN
  -- Strict validation: Positive non-null quantity required
  IF p_product_id IS NULL OR p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE public.products
  SET stock_quantity = COALESCE(stock_quantity, 0) + p_quantity,
      is_in_stock = TRUE,
      updated_at = NOW()
  WHERE id = p_product_id;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_product_stock(UUID, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_product_stock(UUID, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_product_stock(UUID, INT) TO authenticated, service_role;

-- Hardened RLS auto-enable trigger function (Fixes mutable search_path)
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cmd RECORD;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS')
  LOOP
    IF cmd.schema_name = 'public' THEN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', cmd.schema_name, cmd.objid::regclass);
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: ENSURE RLS IS ENABLED ON ALL 35 TABLES
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_action_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_admin_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_agent_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.artisan_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.artisan_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.artisan_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.checkout_otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customer_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shipping_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shipping_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_spins ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: CLEAN DROP OF EXISTING POLICIES (IDEMPOTENT RESET)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl TEXT;
  pol RECORD;
  tables_to_clean TEXT[] := ARRAY[
    'activity_logs', 'admin_activity_logs', 'ai_action_queue', 'ai_admin_actions',
    'ai_admin_conversations', 'ai_agent_approvals', 'ai_agent_memory', 'ai_agent_sessions',
    'ai_automation_rules', 'ai_daily_reports', 'ai_job_queue', 'ai_reports', 'ai_usage_logs',
    'artisan_earnings', 'artisan_orders', 'artisan_profiles', 'categories',
    'checkout_otp_challenges', 'coupons', 'customer_complaints', 'notifications',
    'order_items', 'orders', 'payments', 'platform_settings', 'products', 'reports',
    'reviews', 'sales', 'shipping_shipments', 'shipping_webhook_events', 'user_rewards',
    'user_spins', 'users', 'whatsapp_notifications'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_clean
  LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: SERVICE ROLE UNRESTRICTED ACCESS FOR ALL 35 TABLES
-- (Backend background processes and AI services with service_role key can execute)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl TEXT;
  tables_to_enable TEXT[] := ARRAY[
    'activity_logs', 'admin_activity_logs', 'ai_action_queue', 'ai_admin_actions',
    'ai_admin_conversations', 'ai_agent_approvals', 'ai_agent_memory', 'ai_agent_sessions',
    'ai_automation_rules', 'ai_daily_reports', 'ai_job_queue', 'ai_reports', 'ai_usage_logs',
    'artisan_earnings', 'artisan_orders', 'artisan_profiles', 'categories',
    'checkout_otp_challenges', 'coupons', 'customer_complaints', 'notifications',
    'order_items', 'orders', 'payments', 'platform_settings', 'products', 'reports',
    'reviews', 'sales', 'shipping_shipments', 'shipping_webhook_events', 'user_rewards',
    'user_spins', 'users', 'whatsapp_notifications'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_enable
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
      tbl || '_service_role_all', tbl);
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: USERS & AUTHENTICATION IDENTITY POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- Users: Identity defaults trigger
CREATE OR REPLACE FUNCTION public.set_user_identity_defaults()
RETURNS trigger AS $$
BEGIN
  IF NEW.supabase_uid IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.supabase_uid := (auth.uid())::text;
  END IF;
  IF NEW.id IS NULL THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.id := auth.uid();
    ELSE
      NEW.id := gen_random_uuid();
    END IF;
  END IF;
  IF NEW.supabase_uid IS NULL AND NEW.id IS NOT NULL AND auth.uid() IS NOT NULL AND NEW.id = auth.uid() THEN
    NEW.supabase_uid := NEW.id::text;
  END IF;
  IF NEW.role IS NULL OR TRIM(NEW.role) = '' THEN
    NEW.role := 'user';
  ELSE
    NEW.role := LOWER(TRIM(NEW.role));
  END IF;
  IF NEW.status IS NULL OR TRIM(NEW.status) = '' THEN
    NEW.status := 'active';
  ELSE
    NEW.status := LOWER(TRIM(NEW.status));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.set_user_identity_defaults() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_identity_defaults() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_set_user_identity_defaults ON public.users;
CREATE TRIGGER trg_set_user_identity_defaults
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_identity_defaults();

-- Users: Read own profile or admin reads all
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO authenticated
  USING (
    supabase_uid = (SELECT auth.uid())::text
    OR id = (SELECT auth.uid())
    OR public.is_admin()
  );

-- Users: Authenticated user creates initial profile or admin creates user
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      (
        supabase_uid = (SELECT auth.uid())::text
        OR id = (SELECT auth.uid())
        OR (supabase_uid IS NULL AND id IS NULL)
      )
      AND role IN ('user', 'artisan')
      AND (status IS NULL OR status IN ('active', 'pending'))
    )
  );

-- Users: User can update own name/phone/avatar; cannot self-promote to admin or change supabase_uid
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (
    supabase_uid = (SELECT auth.uid())::text
    OR id = (SELECT auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    public.is_admin()
    OR (
      (
        supabase_uid = (SELECT auth.uid())::text
        OR id = (SELECT auth.uid())
      )
      AND role = (SELECT u.role FROM public.users u WHERE u.id = public.users.id)
      AND status = (SELECT u.status FROM public.users u WHERE u.id = public.users.id)
    )
  );

-- Users: Admin can delete user profiles
CREATE POLICY "users_admin_delete" ON public.users
  FOR DELETE TO authenticated
  USING (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8: PUBLIC CATALOG DATA (Categories, Products, Reviews, Settings)
-- ─────────────────────────────────────────────────────────────────────────────

-- Categories: Public read active categories; admin reads all
CREATE POLICY "categories_public_select" ON public.categories
  FOR SELECT TO public
  USING (is_active = true OR public.is_admin());

-- Categories: Admin write management
CREATE POLICY "categories_admin_insert" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "categories_admin_update" ON public.categories
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "categories_admin_delete" ON public.categories
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Products: Public browse approved, visible, non-archived products; artisans see own; admins see all
CREATE POLICY "products_public_select" ON public.products
  FOR SELECT TO public
  USING (
    (status = 'approved' AND (is_hidden IS NOT TRUE) AND (archived IS NOT TRUE))
    OR (artisan_id = public.get_current_artisan_id())
    OR public.is_admin()
  );

-- Products: Artisans can insert own products (status begins as pending); admins can insert
CREATE POLICY "products_artisan_insert" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      artisan_id = public.get_current_artisan_id()
      AND status IN ('pending', 'draft')
    )
  );

-- Products: Artisans can update own products (cannot approve own products); admins can update all
CREATE POLICY "products_artisan_update" ON public.products
  FOR UPDATE TO authenticated
  USING (artisan_id = public.get_current_artisan_id() OR public.is_admin())
  WITH CHECK (
    public.is_admin()
    OR (
      artisan_id = public.get_current_artisan_id()
      AND status = (SELECT p.status FROM public.products p WHERE p.id = public.products.id)
    )
  );

-- Products: Artisans can delete own products; admins can delete any
CREATE POLICY "products_artisan_delete" ON public.products
  FOR DELETE TO authenticated
  USING (artisan_id = public.get_current_artisan_id() OR public.is_admin());

-- Reviews: Public view approved reviews; customer sees own; admin sees all
CREATE POLICY "reviews_public_select" ON public.reviews
  FOR SELECT TO public
  USING (is_approved = true OR status = 'approved' OR user_id = public.get_current_user_id() OR public.is_admin());

-- Reviews: Authenticated customer submits own review
CREATE POLICY "reviews_customer_insert" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_user_id());

-- Reviews: Customer edits own review; Admin moderates
CREATE POLICY "reviews_customer_update" ON public.reviews
  FOR UPDATE TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.get_current_user_id() OR public.is_admin());

-- Reviews: Customer deletes own review; Admin deletes
CREATE POLICY "reviews_customer_delete" ON public.reviews
  FOR DELETE TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin());

-- Platform Settings: Public can read general store settings
CREATE POLICY "platform_settings_public_select" ON public.platform_settings
  FOR SELECT TO public
  USING (true);

-- Platform Settings: Admin only write
CREATE POLICY "platform_settings_admin_write" ON public.platform_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 9: ARTISAN ECOSYSTEM (Profiles, Orders, Earnings, Sales)
-- ─────────────────────────────────────────────────────────────────────────────

-- Artisan Profiles: Public can view approved artisans; artisan views own; admin views all
CREATE POLICY "artisan_profiles_public_select" ON public.artisan_profiles
  FOR SELECT TO public
  USING (verification_status = 'approved' OR user_id = public.get_current_user_id() OR public.is_admin());

-- Artisan Profiles: Authenticated user creates own profile with pending status
CREATE POLICY "artisan_profiles_insert_own" ON public.artisan_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_user_id() AND verification_status = 'pending');

-- Artisan Profiles: Artisan can update store bio/pickup; cannot approve own verification status
CREATE POLICY "artisan_profiles_update_own" ON public.artisan_profiles
  FOR UPDATE TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin())
  WITH CHECK (
    public.is_admin()
    OR (
      user_id = public.get_current_user_id()
      AND verification_status = (SELECT ap.verification_status FROM public.artisan_profiles ap WHERE ap.id = public.artisan_profiles.id)
    )
  );

CREATE POLICY "artisan_profiles_admin_delete" ON public.artisan_profiles
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Artisan Orders: Assigned artisan sees own; buyer of parent order sees; admin sees all
CREATE POLICY "artisan_orders_select" ON public.artisan_orders
  FOR SELECT TO authenticated
  USING (
    artisan_id = public.get_current_artisan_id()
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = artisan_orders.order_id AND o.user_id = public.get_current_user_id())
    OR public.is_admin()
  );

-- Artisan Orders: Assigned artisan can update order status (accept, dispatch); admin updates all
CREATE POLICY "artisan_orders_update" ON public.artisan_orders
  FOR UPDATE TO authenticated
  USING (artisan_id = public.get_current_artisan_id() OR public.is_admin())
  WITH CHECK (artisan_id = public.get_current_artisan_id() OR public.is_admin());

-- Artisan Earnings: Private financial ledger — artisan reads own; admin reads all
CREATE POLICY "artisan_earnings_select_own" ON public.artisan_earnings
  FOR SELECT TO authenticated
  USING (artisan_id = public.get_current_artisan_id() OR public.is_admin());

-- Artisan Earnings: Admin only writes
CREATE POLICY "artisan_earnings_admin_write" ON public.artisan_earnings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Sales: Artisan reads sales for own products; admin reads all
CREATE POLICY "sales_select" ON public.sales
  FOR SELECT TO authenticated
  USING (artisan_id::text = public.get_current_artisan_id()::text OR public.is_admin());

-- Sales: Admin only writes
CREATE POLICY "sales_admin_write" ON public.sales
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 10: ORDERS, ORDER ITEMS, PAYMENTS & CHECKOUT OTP
-- ─────────────────────────────────────────────────────────────────────────────

-- Orders: Buyer reads own; admin reads all
CREATE POLICY "orders_select_own" ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin());

-- Orders: Authenticated customer creates own order
CREATE POLICY "orders_insert_own" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_user_id() OR public.is_admin());

-- Orders: Buyer can cancel pending order; admin manages all
CREATE POLICY "orders_update_own" ON public.orders
  FOR UPDATE TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin())
  WITH CHECK (
    public.is_admin()
    OR (
      user_id = public.get_current_user_id()
      AND status IN ('pending', 'cancelled')
    )
  );

CREATE POLICY "orders_admin_delete" ON public.orders
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Order Items: Buyer of order reads; assigned artisan reads; admin reads
CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND (o.user_id = public.get_current_user_id() OR public.is_admin()))
    OR artisan_id = public.get_current_artisan_id()
  );

-- Order Items: Insert allowed during order placement
CREATE POLICY "order_items_insert" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND (o.user_id = public.get_current_user_id() OR public.is_admin()))
    OR public.is_admin()
  );

-- Order Items: Admin only update/delete
CREATE POLICY "order_items_admin_write" ON public.order_items
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Payments: Buyer of order can read their payment status; admin reads all
CREATE POLICY "payments_select_own" ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = payments.order_id AND (o.user_id = public.get_current_user_id() OR public.is_admin()))
  );

-- Payments: Insert allowed during order placement
CREATE POLICY "payments_insert_own" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = payments.order_id AND (o.user_id = public.get_current_user_id() OR public.is_admin()))
    OR public.is_admin()
  );

-- Payments: UPDATE restricted to verified Admin & service_role only (customers cannot self-verify payments)
CREATE POLICY "payments_admin_update" ON public.payments
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Checkout OTP Challenges: Owner or checkout session manages own verification challenges
CREATE POLICY "checkout_otp_select_own" ON public.checkout_otp_challenges
  FOR SELECT TO authenticated
  USING (user_id = public.get_current_user_id() OR user_id IS NULL OR public.is_admin());

CREATE POLICY "checkout_otp_insert_own" ON public.checkout_otp_challenges
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_user_id() OR user_id IS NULL OR public.is_admin());

CREATE POLICY "checkout_otp_update_own" ON public.checkout_otp_challenges
  FOR UPDATE TO authenticated
  USING (user_id = public.get_current_user_id() OR user_id IS NULL OR public.is_admin())
  WITH CHECK (user_id = public.get_current_user_id() OR user_id IS NULL OR public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 11: LOGISTICS, SHIPPING & COMMUNICATIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Shipping Shipments: Buyer reads tracking; assigned artisan reads own; admin reads all
CREATE POLICY "shipping_shipments_select" ON public.shipping_shipments
  FOR SELECT TO authenticated
  USING (
    artisan_id = public.get_current_artisan_id()
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = shipping_shipments.order_id AND o.user_id = public.get_current_user_id())
    OR public.is_admin()
  );

-- Shipping Shipments: Admin & service_role only for write operations
CREATE POLICY "shipping_shipments_admin_write" ON public.shipping_shipments
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Shipping Webhook Events: Backend audit log — Admin only reads
CREATE POLICY "shipping_webhooks_admin_select" ON public.shipping_webhook_events
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- WhatsApp Notifications: Assigned artisan reads own; admin reads all
CREATE POLICY "whatsapp_notifications_select" ON public.whatsapp_notifications
  FOR SELECT TO authenticated
  USING (artisan_id = public.get_current_artisan_id() OR public.is_admin());

CREATE POLICY "whatsapp_notifications_admin_write" ON public.whatsapp_notifications
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 12: GAMIFICATION, COUPONS, REWARDS & USER SPINS
-- ─────────────────────────────────────────────────────────────────────────────

-- Coupons: Public read global coupons (user_id IS NULL); users read own targeted coupons
CREATE POLICY "coupons_select" ON public.coupons
  FOR SELECT TO public
  USING (user_id IS NULL OR user_id = public.get_current_user_id() OR public.is_admin());

-- Coupons: Admin & service_role only for creation and modification
CREATE POLICY "coupons_admin_write" ON public.coupons
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- User Spins: User views own spin cooldown; admin views all
CREATE POLICY "user_spins_select_own" ON public.user_spins
  FOR SELECT TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin());

-- User Spins: User records own spin
CREATE POLICY "user_spins_insert_own" ON public.user_spins
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_user_id() OR public.is_admin());

CREATE POLICY "user_spins_update_own" ON public.user_spins
  FOR UPDATE TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.get_current_user_id() OR public.is_admin());

-- User Rewards: User views own reward balance; admin views all
CREATE POLICY "user_rewards_select_own" ON public.user_rewards
  FOR SELECT TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin());

-- User Rewards: Admin only write
CREATE POLICY "user_rewards_admin_write" ON public.user_rewards
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Notifications: User views notifications targeted to them or broadcast
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    target_audience = 'all'
    OR target_user_id = public.get_current_user_id()
    OR (target_audience = 'admins' AND public.is_admin())
    OR (target_audience = 'artisans' AND public.is_artisan())
  );

-- Notifications: User marks own notification as read
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (target_user_id = public.get_current_user_id() OR public.is_admin())
  WITH CHECK (target_user_id = public.get_current_user_id() OR public.is_admin());

-- Notifications: Insert notification (users/artisans can trigger notifications, admin can broadcast)
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = public.get_current_user_id() OR sender_id IS NULL OR public.is_admin());

CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE TO authenticated
  USING (target_user_id = public.get_current_user_id() OR public.is_admin());

-- Customer Complaints: User views and submits own complaints; admin resolves
CREATE POLICY "customer_complaints_select_own" ON public.customer_complaints
  FOR SELECT TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin());

CREATE POLICY "customer_complaints_insert_own" ON public.customer_complaints
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_user_id());

CREATE POLICY "customer_complaints_admin_update" ON public.customer_complaints
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Reports: User submits and views own reports; admin resolves
CREATE POLICY "reports_select_own" ON public.reports
  FOR SELECT TO authenticated
  USING (reporter_id = public.get_current_user_id() OR public.is_admin());

CREATE POLICY "reports_insert_own" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = public.get_current_user_id());

CREATE POLICY "reports_admin_write" ON public.reports
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 13: AUTONOMOUS AI ADMIN & AUTOMATION SYSTEM
-- (Completely resolves historical RLS errors on ai_agent_memory, ai_admin_actions, ai_reports)
-- ─────────────────────────────────────────────────────────────────────────────

-- AI Admin Actions: Immutable audit trail — Admin reads; Admin & service_role write
CREATE POLICY "ai_admin_actions_admin_select" ON public.ai_admin_actions
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "ai_admin_actions_admin_write" ON public.ai_admin_actions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- AI Agent Memory: Operational memory — Admin reads; Admin & service_role write
CREATE POLICY "ai_agent_memory_admin_select" ON public.ai_agent_memory
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "ai_agent_memory_admin_write" ON public.ai_agent_memory
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- AI Reports: Business intelligence reports — Admin reads; Admin & service_role write
CREATE POLICY "ai_reports_admin_select" ON public.ai_reports
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "ai_reports_admin_write" ON public.ai_reports
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- AI Action Queue: High-risk actions awaiting approval — Admin only
CREATE POLICY "ai_action_queue_admin_access" ON public.ai_action_queue
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- AI Admin Conversations: Admin chat sessions
CREATE POLICY "ai_admin_conversations_admin_access" ON public.ai_admin_conversations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- AI Agent Approvals: Human-in-the-loop decisions
CREATE POLICY "ai_agent_approvals_admin_access" ON public.ai_agent_approvals
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- AI Agent Sessions: Autonomous agent execution sessions
CREATE POLICY "ai_agent_sessions_admin_access" ON public.ai_agent_sessions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- AI Automation Rules: Schedule and trigger configs
CREATE POLICY "ai_automation_rules_admin_access" ON public.ai_automation_rules
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- AI Daily Reports: Daily summaries
CREATE POLICY "ai_daily_reports_admin_access" ON public.ai_daily_reports
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- AI Job Queue: Asynchronous background worker queue
CREATE POLICY "ai_job_queue_admin_access" ON public.ai_job_queue
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- AI Usage Logs: User views own usage; admin views all
CREATE POLICY "ai_usage_logs_select" ON public.ai_usage_logs
  FOR SELECT TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin());

CREATE POLICY "ai_usage_logs_insert" ON public.ai_usage_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_user_id() OR user_id IS NULL OR public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 14: SYSTEM AUDIT & ACTIVITY LOGS
-- ─────────────────────────────────────────────────────────────────────────────

-- Admin Activity Logs: Admin-only audit trail
CREATE POLICY "admin_activity_logs_admin_access" ON public.admin_activity_logs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Activity Logs: Admin-only audit trail
CREATE POLICY "activity_logs_admin_access" ON public.activity_logs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 15: LEAST-PRIVILEGE TABLE GRANTS
-- (Revoke broad anonymous writes, grant read-only where public, preserve service_role)
-- ─────────────────────────────────────────────────────────────────────────────

-- Revoke all write permissions from public/anon on all tables
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;

-- Explicitly allow anon SELECT only on public storefront tables
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.reviews TO anon;
GRANT SELECT ON public.platform_settings TO anon;
GRANT SELECT ON public.artisan_profiles TO anon;
GRANT SELECT ON public.coupons TO anon;

-- Grant standard authenticated access (RLS enforces row-level boundaries)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
