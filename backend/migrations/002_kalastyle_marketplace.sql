-- ============================================================
-- 002_kalastyle_marketplace.sql — Artisan Marketplace, AI Craft Attributes & Community
-- ============================================================

-- 1. Artisan Profiles Table
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
  years_of_experience INTEGER DEFAULT 10,
  earnings_total DECIMAL(12, 2) DEFAULT 0,
  bank_account_number VARCHAR(100),
  bank_ifsc VARCHAR(50),
  upi_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Link products to artisan_profiles
ALTER TABLE products ADD COLUMN IF NOT EXISTS artisan_id UUID REFERENCES artisan_profiles(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_handmade BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS material VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS style VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_suggested_price DECIMAL(10, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'approved';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[];

-- 2. Reviews Table
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  title VARCHAR(255),
  comment TEXT NOT NULL,
  is_verified_purchase BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT TRUE,
  moderation_flag VARCHAR(50) DEFAULT 'clean',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Rewards / Loyalty Table
CREATE TABLE IF NOT EXISTS user_rewards (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  completed_orders_count INTEGER DEFAULT 0,
  reward_unlocked BOOLEAN DEFAULT FALSE,
  reward_claimed BOOLEAN DEFAULT FALSE,
  reward_coupon_code VARCHAR(50),
  last_order_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  target_audience VARCHAR(50) DEFAULT 'all',
  target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
