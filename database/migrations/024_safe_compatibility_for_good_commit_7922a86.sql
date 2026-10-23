-- ==============================================================================
-- Migration: 024_safe_compatibility_for_good_commit_7922a86.sql
-- Project: KalaStyle AI (Supabase ref: fwuhlhaadhhveuljsqbh)
-- Target Application Commit: 7922a86159c65bd65b9b478f510476abfb46a545
--
-- STRICT DATA PRESERVATION GUARANTEE:
--   - 100% NON-DESTRUCTIVE & IDEMPOTENT
--   - NO DROP DATABASE, NO DROP SCHEMA public CASCADE, NO TRUNCATE
--   - NO DELETION of users, products, orders, reviews, payments, or AI logs
--   - Keeps all existing production rows intact
--   - Uses ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION
--   - Fixes RLS 42501 error and avoids SQL 42601 syntax errors
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: ADDITIVE COLUMNS (ENSURES FULL SCHEMA COMPATIBILITY)
-- ─────────────────────────────────────────────────────────────────────────────

-- 2.1 AI Action Queue: Add priority if missing
ALTER TABLE IF EXISTS public.ai_action_queue
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1;

-- 2.2 AI Admin Actions: Add governance & confirmation fields
ALTER TABLE IF EXISTS public.ai_admin_actions
  ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS confirmation_token TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS safety_level TEXT DEFAULT 'safe';

-- 2.3 AI Automation Rules: Add rule key lookup
ALTER TABLE IF EXISTS public.ai_automation_rules
  ADD COLUMN IF NOT EXISTS rule_key TEXT;

-- 2.4 Artisan Profiles: Add banking & payout identifiers
ALTER TABLE IF EXISTS public.artisan_profiles
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc TEXT,
  ADD COLUMN IF NOT EXISTS upi_id TEXT;

-- 2.5 Reviews: Add verified purchase, title, and dual comment/review_text support
ALTER TABLE IF EXISTS public.reviews
  ADD COLUMN IF NOT EXISTS comment TEXT,
  ADD COLUMN IF NOT EXISTS is_verified_purchase BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS moderation_flag TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT;

-- Synchronize dual review text and verified purchase fields safely
UPDATE public.reviews
SET comment = review_text
WHERE comment IS NULL AND review_text IS NOT NULL;

UPDATE public.reviews
SET review_text = comment
WHERE review_text IS NULL AND comment IS NOT NULL;

UPDATE public.reviews
SET is_verified_purchase = is_verified_buyer
WHERE is_verified_purchase IS NULL AND is_verified_buyer IS NOT NULL;

-- 2.6 Coupons: Add active status and minimum order value
ALTER TABLE IF EXISTS public.coupons
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_order_value NUMERIC(10,2) DEFAULT 0;

-- 2.7 Payments: Add currency and signature verification flag
ALTER TABLE IF EXISTS public.payments
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS signature_verified BOOLEAN DEFAULT false;

-- 2.8 Artisan Earnings: Add payout reference tracking
ALTER TABLE IF EXISTS public.artisan_earnings
  ADD COLUMN IF NOT EXISTS payout_reference TEXT;

-- 2.9 Users: Ensure supabase_uid column exists and has proper indexing
ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS supabase_uid TEXT;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: PERFORMANCE INDEXES & CONSTRAINTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Identity lookup indexes
CREATE INDEX IF NOT EXISTS idx_users_supabase_uid ON public.users(supabase_uid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase_uid_unique ON public.users(supabase_uid) WHERE supabase_uid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique ON public.users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone) WHERE phone IS NOT NULL;

-- Artisan profile mapping
CREATE UNIQUE INDEX IF NOT EXISTS idx_artisan_profiles_user_id_unique ON public.artisan_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_artisan_profiles_user_id ON public.artisan_profiles(user_id);

-- Catalog & Order Indexes
CREATE INDEX IF NOT EXISTS idx_products_artisan_id ON public.products(artisan_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_status ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_artisan_id ON public.order_items(artisan_id);
CREATE INDEX IF NOT EXISTS idx_artisan_orders_order_id ON public.artisan_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_artisan_orders_artisan_id ON public.artisan_orders(artisan_id);
CREATE INDEX IF NOT EXISTS idx_artisan_orders_status ON public.artisan_orders(status);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_order_id ON public.shipping_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_artisan_id ON public.shipping_shipments(artisan_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_order_id ON public.whatsapp_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_artisan_id ON public.whatsapp_notifications(artisan_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_memory_key ON public.ai_agent_memory(key);
CREATE INDEX IF NOT EXISTS idx_ai_agent_memory_type ON public.ai_agent_memory(memory_type);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: SECURITY DEFINER HELPER FUNCTIONS
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
    WHERE (supabase_uid = (SELECT auth.uid())::text OR id = (SELECT auth.uid()))
      AND role = 'admin'
      AND (status IS NULL OR status = 'active')
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
    WHERE (supabase_uid = (SELECT auth.uid())::text OR id = (SELECT auth.uid()))
      AND role = 'artisan'
      AND (status IS NULL OR status = 'active')
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
     OR id = (SELECT auth.uid())
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
     OR u.id = (SELECT auth.uid())
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_current_artisan_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_artisan_id() TO anon, authenticated, service_role;

-- 4.5 Atomic Inventory Deduction Function
CREATE OR REPLACE FUNCTION public.deduct_product_stock(p_product_id UUID, p_quantity INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_affected INT;
BEGIN
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
GRANT EXECUTE ON FUNCTION public.deduct_product_stock(UUID, INT) TO anon, authenticated, service_role;

-- 4.6 Atomic Inventory Restoration Function
CREATE OR REPLACE FUNCTION public.restore_product_stock(p_product_id UUID, p_quantity INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_affected INT;
BEGIN
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
GRANT EXECUTE ON FUNCTION public.restore_product_stock(UUID, INT) TO anon, authenticated, service_role;

-- 4.7 Checkout OTP Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_checkout_otp_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 4.8 Checkout OTP Expired challenges cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_expired_checkout_challenges()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.checkout_otp_challenges
  WHERE expires_at < now() - INTERVAL '24 hours';
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: AUTHENTICATION IDENTITY SYNCHRONIZATION TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────

-- 5.1 Identity defaults trigger on public.users (BEFORE INSERT)
CREATE OR REPLACE FUNCTION public.set_user_identity_defaults()
RETURNS trigger AS $$
BEGIN
  -- Auto-link supabase_uid from auth context if omitted
  IF NEW.supabase_uid IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.supabase_uid := (auth.uid())::text;
  END IF;

  -- Auto-assign id from auth context if omitted
  IF NEW.id IS NULL THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.id := auth.uid();
    ELSE
      NEW.id := gen_random_uuid();
    END IF;
  END IF;

  -- Align supabase_uid if id equals auth.uid()
  IF NEW.supabase_uid IS NULL AND NEW.id IS NOT NULL AND auth.uid() IS NOT NULL AND NEW.id = auth.uid() THEN
    NEW.supabase_uid := NEW.id::text;
  END IF;

  -- Canonical default role
  IF NEW.role IS NULL OR TRIM(NEW.role) = '' THEN
    NEW.role := 'user';
  ELSE
    NEW.role := LOWER(TRIM(NEW.role));
  END IF;

  -- Canonical default status
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

-- 5.2 Checkout OTP trigger
DROP TRIGGER IF EXISTS trg_checkout_otp_updated_at ON public.checkout_otp_challenges;
CREATE TRIGGER trg_checkout_otp_updated_at
  BEFORE UPDATE ON public.checkout_otp_challenges
  FOR EACH ROW EXECUTE FUNCTION public.update_checkout_otp_updated_at();

-- 5.3 Canonical Supabase Auth Hook (auth.users -> public.users)
-- Avoids syntax error 42601 (no duplicate ON CONFLICT clauses)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_name TEXT;
  v_role TEXT;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'display_name',
    split_part(NEW.email, '@', 1)
  );
  v_role := COALESCE(LOWER(NEW.raw_user_meta_data->>'role'), 'user');

  -- Step 1: If user already exists by email, link their supabase_uid
  UPDATE public.users
  SET supabase_uid = NEW.id::text,
      name = COALESCE(public.users.name, v_name),
      status = 'active'
  WHERE LOWER(email) = LOWER(NEW.email);

  -- Step 2: If no existing user matched by email, insert with single ON CONFLICT (id)
  IF NOT FOUND THEN
    INSERT INTO public.users (id, supabase_uid, email, name, role, status)
    VALUES (
      NEW.id,
      NEW.id::text,
      NEW.email,
      v_name,
      v_role,
      'active'
    )
    ON CONFLICT (id) DO UPDATE SET
      supabase_uid = EXCLUDED.supabase_uid,
      email = COALESCE(public.users.email, EXCLUDED.email),
      name = COALESCE(public.users.name, EXCLUDED.name);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
    ) THEN
      CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: ROW LEVEL SECURITY (RLS) POLICIES FOR ALL 35 TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS on all 35 tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artisan_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artisan_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artisan_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_spins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_action_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_admin_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_job_queue ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 6.1 USERS TABLE POLICIES (Fixes 42501 Insert error)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_admin_delete" ON public.users;
DROP POLICY IF EXISTS "users_service_role_all" ON public.users;

CREATE POLICY "users_service_role_all" ON public.users
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO authenticated
  USING (
    supabase_uid = (SELECT auth.uid())::text
    OR id = (SELECT auth.uid())
    OR public.is_admin()
  );

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

CREATE POLICY "users_admin_delete" ON public.users
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- 6.2 ARTISAN PROFILES
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "artisan_profiles_select_public" ON public.artisan_profiles;
DROP POLICY IF EXISTS "artisan_profiles_manage_own" ON public.artisan_profiles;
DROP POLICY IF EXISTS "artisan_profiles_admin_all" ON public.artisan_profiles;

CREATE POLICY "artisan_profiles_select_public" ON public.artisan_profiles
  FOR SELECT
  USING (true);

CREATE POLICY "artisan_profiles_manage_own" ON public.artisan_profiles
  FOR ALL TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.get_current_user_id() OR public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- 6.3 PRODUCTS & CATEGORIES
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "categories_select_public" ON public.categories;
DROP POLICY IF EXISTS "categories_admin_all" ON public.categories;

CREATE POLICY "categories_select_public" ON public.categories
  FOR SELECT USING (true);

CREATE POLICY "categories_admin_all" ON public.categories
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "products_select_public" ON public.products;
DROP POLICY IF EXISTS "products_artisan_insert" ON public.products;
DROP POLICY IF EXISTS "products_artisan_update" ON public.products;
DROP POLICY IF EXISTS "products_artisan_delete" ON public.products;

-- Public can view approved active products; Artisans can view own; Admins can view all
CREATE POLICY "products_select_public" ON public.products
  FOR SELECT
  USING (
    status = 'approved'
    OR artisan_id = public.get_current_artisan_id()
    OR public.is_admin()
  );

CREATE POLICY "products_artisan_insert" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    artisan_id = public.get_current_artisan_id()
    OR public.is_admin()
  );

CREATE POLICY "products_artisan_update" ON public.products
  FOR UPDATE TO authenticated
  USING (artisan_id = public.get_current_artisan_id() OR public.is_admin())
  WITH CHECK (artisan_id = public.get_current_artisan_id() OR public.is_admin());

CREATE POLICY "products_artisan_delete" ON public.products
  FOR DELETE TO authenticated
  USING (artisan_id = public.get_current_artisan_id() OR public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- 6.4 ORDERS & ORDER ITEMS & ARTISAN ORDERS
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
DROP POLICY IF EXISTS "orders_update_own" ON public.orders;

CREATE POLICY "orders_select_own" ON public.orders
  FOR SELECT TO authenticated
  USING (
    user_id = public.get_current_user_id()
    OR public.is_admin()
    OR id IN (SELECT order_id FROM public.artisan_orders WHERE artisan_id = public.get_current_artisan_id())
  );

CREATE POLICY "orders_insert_own" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.get_current_user_id()
    OR public.is_admin()
  );

CREATE POLICY "orders_update_own" ON public.orders
  FOR UPDATE TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.get_current_user_id() OR public.is_admin());

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;

CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    order_id IN (SELECT id FROM public.orders WHERE user_id = public.get_current_user_id())
    OR artisan_id = public.get_current_artisan_id()
    OR public.is_admin()
  );

CREATE POLICY "order_items_insert" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    order_id IN (SELECT id FROM public.orders WHERE user_id = public.get_current_user_id())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "artisan_orders_select" ON public.artisan_orders;
DROP POLICY IF EXISTS "artisan_orders_update" ON public.artisan_orders;

CREATE POLICY "artisan_orders_select" ON public.artisan_orders
  FOR SELECT TO authenticated
  USING (
    artisan_id = public.get_current_artisan_id()
    OR order_id IN (SELECT id FROM public.orders WHERE user_id = public.get_current_user_id())
    OR public.is_admin()
  );

CREATE POLICY "artisan_orders_update" ON public.artisan_orders
  FOR UPDATE TO authenticated
  USING (artisan_id = public.get_current_artisan_id() OR public.is_admin())
  WITH CHECK (artisan_id = public.get_current_artisan_id() OR public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- 6.5 PAYMENTS & ARTISAN EARNINGS & SALES
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "payments_select" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_all" ON public.payments;

CREATE POLICY "payments_select" ON public.payments
  FOR SELECT TO authenticated
  USING (
    order_id IN (SELECT id FROM public.orders WHERE user_id = public.get_current_user_id())
    OR public.is_admin()
  );

CREATE POLICY "payments_admin_all" ON public.payments
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "artisan_earnings_select" ON public.artisan_earnings;
CREATE POLICY "artisan_earnings_select" ON public.artisan_earnings
  FOR SELECT TO authenticated
  USING (artisan_id = public.get_current_artisan_id() OR public.is_admin());

DROP POLICY IF EXISTS "sales_select" ON public.sales;
CREATE POLICY "sales_select" ON public.sales
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_artisan());

-- ─────────────────────────────────────────────────────────────
-- 6.6 REVIEWS, REWARDS, SPINS, COUPONS
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "reviews_select_public" ON public.reviews;
DROP POLICY IF EXISTS "reviews_insert_authenticated" ON public.reviews;
DROP POLICY IF EXISTS "reviews_manage_own" ON public.reviews;

CREATE POLICY "reviews_select_public" ON public.reviews
  FOR SELECT USING (is_approved = true OR user_id = public.get_current_user_id() OR public.is_admin());

CREATE POLICY "reviews_insert_authenticated" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_user_id() OR public.is_admin());

CREATE POLICY "reviews_manage_own" ON public.reviews
  FOR ALL TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.get_current_user_id() OR public.is_admin());

DROP POLICY IF EXISTS "coupons_select_public" ON public.coupons;
DROP POLICY IF EXISTS "coupons_admin_all" ON public.coupons;

CREATE POLICY "coupons_select_public" ON public.coupons
  FOR SELECT USING (true);

CREATE POLICY "coupons_admin_all" ON public.coupons
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "user_spins_select_own" ON public.user_spins;
DROP POLICY IF EXISTS "user_spins_manage_own" ON public.user_spins;

CREATE POLICY "user_spins_select_own" ON public.user_spins
  FOR SELECT TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin());

CREATE POLICY "user_spins_manage_own" ON public.user_spins
  FOR ALL TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.get_current_user_id() OR public.is_admin());

DROP POLICY IF EXISTS "user_rewards_select_own" ON public.user_rewards;
DROP POLICY IF EXISTS "user_rewards_manage_own" ON public.user_rewards;

CREATE POLICY "user_rewards_select_own" ON public.user_rewards
  FOR SELECT TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin());

CREATE POLICY "user_rewards_manage_own" ON public.user_rewards
  FOR ALL TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.get_current_user_id() OR public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- 6.7 NOTIFICATIONS, COMPLAINTS, REPORTS, SETTINGS
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;

CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    target_audience = 'all'
    OR target_user_id = public.get_current_user_id()
    OR (target_audience = 'admins' AND public.is_admin())
    OR (target_audience = 'artisans' AND public.is_artisan())
  );

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (target_user_id = public.get_current_user_id() OR public.is_admin())
  WITH CHECK (target_user_id = public.get_current_user_id() OR public.is_admin());

CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = public.get_current_user_id() OR sender_id IS NULL OR public.is_admin());

DROP POLICY IF EXISTS "customer_complaints_access" ON public.customer_complaints;
CREATE POLICY "customer_complaints_access" ON public.customer_complaints
  FOR ALL TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.get_current_user_id() OR public.is_admin());

DROP POLICY IF EXISTS "reports_access" ON public.reports;
CREATE POLICY "reports_access" ON public.reports
  FOR ALL TO authenticated
  USING (reporter_id = public.get_current_user_id() OR public.is_admin())
  WITH CHECK (reporter_id = public.get_current_user_id() OR public.is_admin());

DROP POLICY IF EXISTS "platform_settings_select_public" ON public.platform_settings;
DROP POLICY IF EXISTS "platform_settings_admin_all" ON public.platform_settings;

CREATE POLICY "platform_settings_select_public" ON public.platform_settings
  FOR SELECT USING (true);

CREATE POLICY "platform_settings_admin_all" ON public.platform_settings
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "checkout_otp_challenges_select_own" ON public.checkout_otp_challenges;
CREATE POLICY "checkout_otp_challenges_select_own" ON public.checkout_otp_challenges
  FOR SELECT TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin());

DROP POLICY IF EXISTS "shipping_shipments_access" ON public.shipping_shipments;
CREATE POLICY "shipping_shipments_access" ON public.shipping_shipments
  FOR ALL TO authenticated
  USING (
    artisan_id = public.get_current_artisan_id()
    OR order_id IN (SELECT id FROM public.orders WHERE user_id = public.get_current_user_id())
    OR public.is_admin()
  )
  WITH CHECK (public.is_admin() OR artisan_id = public.get_current_artisan_id());

DROP POLICY IF EXISTS "shipping_webhook_events_admin_access" ON public.shipping_webhook_events;
CREATE POLICY "shipping_webhook_events_admin_access" ON public.shipping_webhook_events
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "whatsapp_notifications_access" ON public.whatsapp_notifications;
CREATE POLICY "whatsapp_notifications_access" ON public.whatsapp_notifications
  FOR ALL TO authenticated
  USING (artisan_id = public.get_current_artisan_id() OR public.is_admin())
  WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- 6.8 AI ADMIN, AGENTS & LOGS
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ai_admin_actions_admin_access" ON public.ai_admin_actions;
CREATE POLICY "ai_admin_actions_admin_access" ON public.ai_admin_actions
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ai_agent_memory_admin_access" ON public.ai_agent_memory;
CREATE POLICY "ai_agent_memory_admin_access" ON public.ai_agent_memory
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ai_reports_admin_access" ON public.ai_reports;
CREATE POLICY "ai_reports_admin_access" ON public.ai_reports
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ai_action_queue_admin_access" ON public.ai_action_queue;
CREATE POLICY "ai_action_queue_admin_access" ON public.ai_action_queue
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ai_admin_conversations_admin_access" ON public.ai_admin_conversations;
CREATE POLICY "ai_admin_conversations_admin_access" ON public.ai_admin_conversations
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ai_agent_approvals_admin_access" ON public.ai_agent_approvals;
CREATE POLICY "ai_agent_approvals_admin_access" ON public.ai_agent_approvals
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ai_agent_sessions_admin_access" ON public.ai_agent_sessions;
CREATE POLICY "ai_agent_sessions_admin_access" ON public.ai_agent_sessions
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ai_automation_rules_admin_access" ON public.ai_automation_rules;
CREATE POLICY "ai_automation_rules_admin_access" ON public.ai_automation_rules
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ai_daily_reports_admin_access" ON public.ai_daily_reports;
CREATE POLICY "ai_daily_reports_admin_access" ON public.ai_daily_reports
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ai_job_queue_admin_access" ON public.ai_job_queue;
CREATE POLICY "ai_job_queue_admin_access" ON public.ai_job_queue
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ai_usage_logs_access" ON public.ai_usage_logs;
CREATE POLICY "ai_usage_logs_access" ON public.ai_usage_logs
  FOR ALL TO authenticated
  USING (user_id = public.get_current_user_id() OR user_id IS NULL OR public.is_admin())
  WITH CHECK (user_id = public.get_current_user_id() OR user_id IS NULL OR public.is_admin());

DROP POLICY IF EXISTS "admin_activity_logs_admin_access" ON public.admin_activity_logs;
CREATE POLICY "admin_activity_logs_admin_access" ON public.admin_activity_logs
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "activity_logs_admin_access" ON public.activity_logs;
CREATE POLICY "activity_logs_admin_access" ON public.activity_logs
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: LEAST-PRIVILEGE ROLE PERMISSIONS & GRANTS
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;

GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.reviews TO anon;
GRANT SELECT ON public.platform_settings TO anon;
GRANT SELECT ON public.artisan_profiles TO anon;
GRANT SELECT ON public.coupons TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- ==============================================================================
-- END OF MIGRATION 024 — SUPABASE SCHEMA RESTORATION & HARMONIZATION COMPLETE
-- ==============================================================================
