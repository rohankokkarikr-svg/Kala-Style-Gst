-- ============================================================
-- KALASTYLE AI — Supabase Database Schema (Idempotent Migration)
-- Run this in your Supabase project's SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';

-- 2. Artisan Profiles Table (NEW)
CREATE TABLE IF NOT EXISTS artisan_profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  store_name VARCHAR(255) NOT NULL,
  artisan_type VARCHAR(100),
  specialization VARCHAR(255),
  location VARCHAR(255),
  bio TEXT,
  profile_image TEXT,
  verification_status VARCHAR(50) DEFAULT 'pending',
  preferred_language VARCHAR(50) DEFAULT 'English',
  years_of_experience INTEGER DEFAULT 20,
  earnings_total DECIMAL(12, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE artisan_profiles ADD COLUMN IF NOT EXISTS years_of_experience INTEGER DEFAULT 20;

-- 3. Products Table
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  original_price DECIMAL(10, 2),
  category VARCHAR(100) NOT NULL,
  subcategory VARCHAR(100),
  sizes TEXT[],
  image_url TEXT,
  barcode VARCHAR(100) UNIQUE,
  stock_quantity INTEGER DEFAULT 0,
  is_in_stock BOOLEAN DEFAULT TRUE,
  artisan_id UUID REFERENCES artisan_profiles(id) ON DELETE SET NULL,
  is_handmade BOOLEAN DEFAULT FALSE,
  material VARCHAR(255),
  style VARCHAR(255),
  ai_generated BOOLEAN DEFAULT FALSE,
  ai_suggested_price DECIMAL(10, 2),
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS artisan_id UUID REFERENCES artisan_profiles(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_handmade BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS material VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS style VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_suggested_price DECIMAL(10, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT[];

-- 4. Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  total_price DECIMAL(10, 2) NOT NULL,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  coupon_code VARCHAR(50),
  shipping_address TEXT NOT NULL,
  phone VARCHAR(20) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  payment_status VARCHAR(50) DEFAULT 'pending',
  payment_method VARCHAR(50),
  razorpay_order_id VARCHAR(255),
  razorpay_payment_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS live_location_url TEXT;

-- 5. Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  price_at_time DECIMAL(10, 2) NOT NULL,
  size VARCHAR(20)
);

-- 6. Sales Table
CREATE TABLE IF NOT EXISTS sales (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Reviews Table
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

-- 8. Coupons Table
CREATE TABLE IF NOT EXISTS coupons (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  discount_type VARCHAR(50) NOT NULL,
  discount_value DECIMAL(10, 2),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. User Spins Table
CREATE TABLE IF NOT EXISTS user_spins (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  last_spin_date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes (SAFE)
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_artisan_id ON products(artisan_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_artisan_profiles_user_id ON artisan_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_artisan_profiles_verification ON artisan_profiles(verification_status);

-- 10. Sales Table
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
  sale_type VARCHAR(50) DEFAULT 'offline_scan',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS product_name VARCHAR(255);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS order_id VARCHAR(255);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS artisan_id VARCHAR(255);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_type VARCHAR(50) DEFAULT 'offline_scan';

-- 11. Reports & Complaints Table
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_type VARCHAR(50) NOT NULL DEFAULT 'product',
  target_id VARCHAR(255) NOT NULL,
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'open',
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE reports ALTER COLUMN target_id TYPE VARCHAR(255);

-- 12. AI Usage Logs Table
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  feature VARCHAR(100) NOT NULL,
  model VARCHAR(100) DEFAULT 'gemini-2.0-flash',
  status VARCHAR(50) DEFAULT 'success',
  prompt_length INTEGER DEFAULT 0,
  response_length INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS metadata JSONB;

