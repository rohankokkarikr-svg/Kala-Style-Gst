-- ============================================================
-- 007_shipping_system_schema.sql
-- KalaStyle AI — Shiprocket Logistics, Shipments & Webhook Schema
-- ============================================================

-- 1. Create shipping_shipments table
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

-- Idempotency constraint: Prevent duplicate shipment per order (or order+artisan)
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipping_shipments_order_id_unique ON shipping_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_provider_shipment_id ON shipping_shipments(provider_shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_awb_code ON shipping_shipments(awb_code);
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_status ON shipping_shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipping_shipments_artisan_id ON shipping_shipments(artisan_id);

-- 2. Create shipping_webhook_events table (Durable Webhook Idempotency Log)
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

-- 3. Extend orders table with direct shipping columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_status VARCHAR(50) DEFAULT 'PENDING';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS awb_code VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_name VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;

-- 4. Extend artisan_profiles with registered pickup locations
ALTER TABLE IF EXISTS artisan_profiles ADD COLUMN IF NOT EXISTS pickup_location VARCHAR(100) DEFAULT 'Home';
ALTER TABLE IF EXISTS artisan_profiles ADD COLUMN IF NOT EXISTS pickup_pincode VARCHAR(20) DEFAULT '591307';
ALTER TABLE IF EXISTS artisan_profiles ADD COLUMN IF NOT EXISTS pickup_address TEXT;
ALTER TABLE IF EXISTS artisan_profiles ADD COLUMN IF NOT EXISTS pickup_city VARCHAR(100);
ALTER TABLE IF EXISTS artisan_profiles ADD COLUMN IF NOT EXISTS pickup_state VARCHAR(100);
