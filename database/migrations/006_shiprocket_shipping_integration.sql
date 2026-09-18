-- ============================================================
-- 006_shiprocket_shipping_integration.sql
-- Shiprocket Logistics & Shipping Integration for KalaStyle AI
-- ============================================================

-- 1. Shipping Shipments Table
CREATE TABLE IF NOT EXISTS shipping_shipments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  provider VARCHAR(50) DEFAULT 'shiprocket',
  provider_order_id VARCHAR(100),
  provider_shipment_id VARCHAR(100),
  awb_code VARCHAR(100),
  courier_company_id VARCHAR(50),
  courier_name VARCHAR(100),
  pickup_location VARCHAR(100) DEFAULT 'Primary',
  status VARCHAR(50) DEFAULT 'PENDING',
  shipment_status VARCHAR(50) DEFAULT 'PENDING',
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

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_order_id ON shipping_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_provider_shipment_id ON shipping_shipments(provider_shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_awb_code ON shipping_shipments(awb_code);
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_status ON shipping_shipments(status);

-- 2. Shipping Webhook Events Table (Idempotent Event Log)
CREATE TABLE IF NOT EXISTS shipping_webhook_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  provider VARCHAR(50) DEFAULT 'shiprocket',
  event_name VARCHAR(100),
  event_id VARCHAR(150) UNIQUE,
  shipment_id VARCHAR(100),
  awb_code VARCHAR(100),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processing_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipping_webhook_events_event_id ON shipping_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_shipping_webhook_events_awb ON shipping_webhook_events(awb_code);

-- 3. Extend orders table with direct shipping reference columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_id UUID REFERENCES shipping_shipments(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_status VARCHAR(50) DEFAULT 'PENDING';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS awb_code VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_name VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;

-- 4. Extend artisan_profiles with pickup location details
ALTER TABLE artisan_profiles ADD COLUMN IF NOT EXISTS pickup_location VARCHAR(100) DEFAULT 'Primary';
ALTER TABLE artisan_profiles ADD COLUMN IF NOT EXISTS pickup_pincode VARCHAR(20);
ALTER TABLE artisan_profiles ADD COLUMN IF NOT EXISTS pickup_address TEXT;
ALTER TABLE artisan_profiles ADD COLUMN IF NOT EXISTS pickup_city VARCHAR(100);
ALTER TABLE artisan_profiles ADD COLUMN IF NOT EXISTS pickup_state VARCHAR(100);
