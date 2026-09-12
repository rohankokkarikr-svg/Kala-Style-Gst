-- ============================================================
-- KALASTYLE AI — Autonomous AI Admin Management System Schema
-- Run this in your Supabase SQL Editor to enable AI Autonomous Operations
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. AI ACTION QUEUE (Event-Driven Lightweight Background Queue) ───────────
CREATE TABLE IF NOT EXISTS ai_action_queue (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'retrying', 'dead_letter'
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  idempotency_key VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_action_queue_idempotency_key_key'
  ) THEN
    ALTER TABLE ai_action_queue ADD CONSTRAINT ai_action_queue_idempotency_key_key UNIQUE (idempotency_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_action_queue_status ON ai_action_queue(status);
CREATE INDEX IF NOT EXISTS idx_ai_action_queue_scheduled ON ai_action_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_ai_action_queue_event ON ai_action_queue(event_type);

-- ── 2. AI ADMIN ACTIONS (Immutable Audit Trail) ──────────────────────────────
CREATE TABLE IF NOT EXISTS ai_admin_actions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id VARCHAR(255),
  event_type VARCHAR(100),
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  action_name VARCHAR(100) NOT NULL,
  tool_name VARCHAR(100) NOT NULL,
  input_summary TEXT,
  decision VARCHAR(100),
  reason TEXT,
  confidence DECIMAL(4,3) DEFAULT 1.000,
  result JSONB,
  status VARCHAR(50) DEFAULT 'success', -- 'success', 'failed', 'rejected', 'hold'
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_admin_actions_entity ON ai_admin_actions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_admin_actions_tool ON ai_admin_actions(tool_name);
CREATE INDEX IF NOT EXISTS idx_ai_admin_actions_created ON ai_admin_actions(created_at DESC);

-- ── 3. AI ADMIN CONVERSATIONS (Interactive Chat Sessions) ────────────────────
CREATE TABLE IF NOT EXISTS ai_admin_conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(255) DEFAULT 'Autonomous Operations Manager Session',
  messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_admin_conversations_admin ON ai_admin_conversations(admin_id);

-- ── 4. AI AUTOMATION RULES (Feature Flags & Policy Configurations) ───────────
CREATE TABLE IF NOT EXISTS ai_automation_rules (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  config JSONB DEFAULT '{}'::jsonb,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Default Autonomous Operational Rules
INSERT INTO ai_automation_rules (id, name, is_enabled, config, description)
VALUES
  (
    'artisan_auto_verification',
    'Autonomous Artisan Verification',
    TRUE,
    '{"auto_approve_threshold": 0.85, "require_experience": true}'::jsonb,
    'Evaluates artisan bio, experience, craft type, and profile completeness to verify or hold automatically.'
  ),
  (
    'product_auto_approval',
    'Autonomous Product Approval',
    TRUE,
    '{"check_pricing": true, "check_artisan": true, "max_stock_limit": 10000}'::jsonb,
    'Analyzes craft titles, material, categories, and pricing anomalies to approve or flag products.'
  ),
  (
    'order_auto_processing',
    'Autonomous Order Processing & Verification',
    TRUE,
    '{"notify_artisan_on_cod": true, "auto_verify_razorpay": true}'::jsonb,
    'Processes verified payments and valid COD orders, reserves stock, and notifies assigned artisans.'
  ),
  (
    'inventory_monitoring',
    'Inventory & Low Stock Sentinel',
    TRUE,
    '{"low_stock_threshold": 5, "auto_hold_out_of_stock": true}'::jsonb,
    'Monitors inventory velocity, triggers restock alerts, and marks depleted items as out of stock.'
  ),
  (
    'review_moderation',
    'Autonomous Review Moderation',
    TRUE,
    '{"auto_hide_abusive": true, "flag_spam_keywords": true}'::jsonb,
    'Analyzes customer reviews for sentiment, abusive language, and spam, keeping authentic reviews visible.'
  ),
  (
    'daily_ai_report',
    'Autonomous Daily Intelligence Report',
    TRUE,
    '{"report_time_utc": "00:00", "include_revenue": true, "include_kpis": true}'::jsonb,
    'Aggregates daily sales, order statuses, top artisans, and inventory warnings into a business report.'
  ),
  (
    'whatsapp_notifications',
    'Per-Artisan WhatsApp Dispatch',
    TRUE,
    '{"include_delivery_address": true, "mask_other_artisans": true}'::jsonb,
    'Sends order notifications strictly containing the artisan''s own items, preventing data cross-leakage.'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- ── 5. AI REPORTS TABLE ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  summary TEXT NOT NULL,
  metrics JSONB DEFAULT '{}'::jsonb,
  insights JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  actions_performed JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_reports_date ON ai_reports(report_date DESC);

-- ── 6. WHATSAPP NOTIFICATIONS TABLE EXTENSIONS ───────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  artisan_id UUID REFERENCES artisan_profiles(id) ON DELETE SET NULL,
  phone_number VARCHAR(50) NOT NULL,
  message_type VARCHAR(50) NOT NULL DEFAULT 'NEW_ORDER',
  idempotency_key VARCHAR(255),
  template_sid VARCHAR(100),
  twilio_message_sid VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending',
  error_code VARCHAR(50),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  payload_snapshot JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_order ON whatsapp_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_artisan ON whatsapp_notifications(artisan_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_status ON whatsapp_notifications(status);

-- ============================================================
-- END OF MIGRATION
-- ============================================================
