-- ============================================================
-- 004_v2_order_system_and_payments.sql — Multi-Artisan Sub-Orders & Razorpay Tracking
-- ============================================================

-- 1. Artisan Orders (Sub-Orders partitioned per artisan per basket)
CREATE TABLE IF NOT EXISTS artisan_orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  artisan_id UUID REFERENCES artisan_profiles(id) ON DELETE SET NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  delivery_fee DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, preparing, ready, dispatched, out_for_delivery, delivered, cancelled, rejected
  rejection_reason TEXT,
  accepted_at TIMESTAMP WITH TIME ZONE,
  prepared_at TIMESTAMP WITH TIME ZONE,
  ready_at TIMESTAMP WITH TIME ZONE,
  dispatched_at TIMESTAMP WITH TIME ZONE,
  out_for_delivery_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Link order_items to artisan_orders
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS artisan_id UUID REFERENCES artisan_profiles(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name_snapshot VARCHAR(255);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_image_snapshot TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_status VARCHAR(50) DEFAULT 'pending';

-- 2. Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE UNIQUE,
  method VARCHAR(50) NOT NULL, -- razorpay, cod, upi
  provider VARCHAR(50) DEFAULT 'razorpay',
  provider_order_id VARCHAR(255),
  provider_payment_id VARCHAR(255),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(50) DEFAULT 'pending', -- pending, cod_pending, paid, failed, partially_refunded, refunded
  signature_verified BOOLEAN DEFAULT FALSE,
  refund_id VARCHAR(255),
  refund_amount DECIMAL(10, 2),
  paid_at TIMESTAMP WITH TIME ZONE,
  refunded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Artisan Earnings Table
CREATE TABLE IF NOT EXISTS artisan_earnings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  artisan_id UUID REFERENCES artisan_profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  artisan_order_id UUID REFERENCES artisan_orders(id) ON DELETE CASCADE UNIQUE,
  gross_amount DECIMAL(10, 2) NOT NULL,
  platform_commission DECIMAL(10, 2) DEFAULT 0,
  delivery_amount DECIMAL(10, 2) DEFAULT 0,
  net_earning DECIMAL(10, 2) NOT NULL,
  settlement_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, settled
  settled_at TIMESTAMP WITH TIME ZONE,
  payout_reference VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Order tracking & addresses extensions
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_name VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_city VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_state VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_pincode VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_signature TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS risk_status VARCHAR(50) DEFAULT 'normal'; -- normal, review_required, high_risk
ALTER TABLE orders ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS risk_reasons TEXT[];
