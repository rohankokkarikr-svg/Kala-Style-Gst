-- 1. Create Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Products Table
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  original_price DECIMAL(10, 2),
  category VARCHAR(100) NOT NULL,
  sizes TEXT[], -- Array of strings e.g., ['S', 'M', 'L']
  image_url TEXT,
  barcode VARCHAR(100) UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  total_price DECIMAL(10, 2) NOT NULL,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  coupon_code VARCHAR(50),
  shipping_address TEXT NOT NULL,
  phone VARCHAR(20) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, shipped, delivered, cancelled
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS live_location_url TEXT;

-- 4. Create Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  price_at_time DECIMAL(10, 2) NOT NULL,
  size VARCHAR(20)
);

-- 5. Create Sales Table (for offline barcode scans & order sales tracking)
CREATE TABLE IF NOT EXISTS sales (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_id VARCHAR(255),
  product_name VARCHAR(255),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  order_id VARCHAR(255),
  artisan_id VARCHAR(255),
  sale_type VARCHAR(50) DEFAULT 'offline_scan', -- 'offline_scan', 'online_order', 'pos'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS product_name VARCHAR(255);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS order_id VARCHAR(255);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS artisan_id VARCHAR(255);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_type VARCHAR(50) DEFAULT 'offline_scan';

-- Note: We are bypassing RLS in the backend by using the Service Role Key.
-- If you choose to enable RLS, you must write appropriate policies.
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE products ENABLE ROW LEVEL SECURITY;
-- etc.

-- 6. Create Reviews Table
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT NOT NULL,
  image_url TEXT,
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Create Coupons Table (for spin-wheel rewards and loyalty coupons)
CREATE TABLE IF NOT EXISTS coupons (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  discount_type VARCHAR(50) NOT NULL,  -- 'percentage', 'fixed', 'free_shipping'
  discount_value DECIMAL(10, 2),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Create User Spins Table (tracks daily spin-wheel usage per user)
CREATE TABLE IF NOT EXISTS user_spins (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  last_spin_date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Add stock columns to products (if not already present)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_in_stock BOOLEAN DEFAULT TRUE;

-- 10. Add years_of_experience to artisan_profiles
ALTER TABLE IF EXISTS artisan_profiles
  ADD COLUMN IF NOT EXISTS years_of_experience INTEGER DEFAULT 20;

-- 11. Create Reports Table (Customer complaints & platform safety)
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_type VARCHAR(50) NOT NULL DEFAULT 'product', -- 'product', 'artisan', 'customer', 'review', 'safety'
  target_id VARCHAR(255) NOT NULL,
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'under_review', 'resolved', 'rejected'
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE reports ALTER COLUMN target_id TYPE VARCHAR(255);

-- 12. Create AI Usage Logs Table (Tracks all Gemini AI inferences & audit logs)
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  feature VARCHAR(100) NOT NULL, -- 'catalog', 'image_analysis', 'price_suggestion', 'translation', 'story', 'smart_search'
  model VARCHAR(100) DEFAULT 'gemini-2.0-flash',
  status VARCHAR(50) DEFAULT 'success', -- 'success', 'failed'
  prompt_length INTEGER DEFAULT 0,
  response_length INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS metadata JSONB;
-- 13. Master Authentication Constraints & Indexes
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS supabase_uid UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase_uid_unique ON users (supabase_uid) WHERE supabase_uid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique ON users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_artisan_profiles_user_id_unique ON artisan_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- 14. Shiprocket Shipping, Shipments & Webhook Schema
CREATE TABLE IF NOT EXISTS shipping_shipments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  artisan_id UUID,
  provider VARCHAR(50) DEFAULT 'shiprocket' NOT NULL,
  provider_order_id VARCHAR(100),
  provider_shipment_id VARCHAR(100),
  awb_code VARCHAR(100),
  courier_company_id VARCHAR(50),
  courier_name VARCHAR(100),
  pickup_location VARCHAR(100) DEFAULT 'Home',
  status VARCHAR(50) DEFAULT 'READY_TO_SHIP' NOT NULL,
  shipment_status VARCHAR(50) DEFAULT 'READY_TO_SHIP' NOT NULL,
  tracking_url TEXT,
  label_url TEXT,
  invoice_url TEXT,
  manifest_url TEXT,
  shipping_cost DECIMAL(10, 2) DEFAULT 0,
  estimated_delivery_date TIMESTAMPTZ,
  pickup_scheduled_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_tracking_update TIMESTAMPTZ,
  shipping_error TEXT,
  attempt_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  package_weight DECIMAL(8, 3) DEFAULT 0.5,
  package_length DECIMAL(8, 2) DEFAULT 20.0,
  package_breadth DECIMAL(8, 2) DEFAULT 20.0,
  package_height DECIMAL(8, 2) DEFAULT 10.0,
  declared_value DECIMAL(12, 2) DEFAULT 0,
  payment_method VARCHAR(50) DEFAULT 'Prepaid',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipping_shipments_order_id_unique ON shipping_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_provider_shipment_id ON shipping_shipments(provider_shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_awb_code ON shipping_shipments(awb_code);
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_status ON shipping_shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_artisan_id ON shipping_shipments(artisan_id);

CREATE TABLE IF NOT EXISTS shipping_webhook_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  provider VARCHAR(50) DEFAULT 'shiprocket' NOT NULL,
  event_name VARCHAR(100),
  event_id VARCHAR(255) UNIQUE NOT NULL,
  shipment_id VARCHAR(100),
  awb_code VARCHAR(100),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processing_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipping_webhook_events_event_id ON shipping_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_shipping_webhook_events_awb ON shipping_webhook_events(awb_code);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_status VARCHAR(50) DEFAULT 'PENDING';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS awb_code VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_name VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;

ALTER TABLE IF EXISTS artisan_profiles ADD COLUMN IF NOT EXISTS pickup_location VARCHAR(100) DEFAULT 'Home';
ALTER TABLE IF EXISTS artisan_profiles ADD COLUMN IF NOT EXISTS pickup_pincode VARCHAR(20) DEFAULT '591307';
ALTER TABLE IF EXISTS artisan_profiles ADD COLUMN IF NOT EXISTS pickup_address TEXT;
ALTER TABLE IF EXISTS artisan_profiles ADD COLUMN IF NOT EXISTS pickup_city VARCHAR(100);
ALTER TABLE IF EXISTS artisan_profiles ADD COLUMN IF NOT EXISTS pickup_state VARCHAR(100);

-- Migration 008: Artisan Google Auth Identity & Unique Constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase_uid_unique 
  ON users (supabase_uid) 
  WHERE supabase_uid IS NOT NULL;

UPDATE users 
SET role = 'artisan' 
WHERE id IN (SELECT user_id FROM artisan_profiles WHERE user_id IS NOT NULL)
  AND role != 'admin';

CREATE INDEX IF NOT EXISTS idx_artisan_profiles_user_id ON artisan_profiles(user_id);

