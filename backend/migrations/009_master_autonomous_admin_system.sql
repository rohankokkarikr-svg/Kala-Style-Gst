-- ============================================================
-- 009_master_autonomous_admin_system.sql
-- KalaStyle AI — Master Consolidated Production Schema
-- Ensures complete idempotency and aligns all AI, Admin, and Shipping tables
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. USER & ARTISAN COLUMNS ────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ── 2. ORDER RISK & TRACKING EXTENSIONS ──────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS risk_status VARCHAR(50) DEFAULT 'normal';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS risk_reasons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_status VARCHAR(50) DEFAULT 'PENDING';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_status VARCHAR(50) DEFAULT 'pending';

-- ── 3. AI ACTION QUEUE (Authoritative Autonomous Job Queue) ──────────────────
CREATE TABLE IF NOT EXISTS ai_action_queue (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'retrying', 'dead_letter'
  priority INTEGER DEFAULT 5,
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

-- ── 4. AI ADMIN ACTIONS (Immutable Audit Trail) ──────────────────────────────
CREATE TABLE IF NOT EXISTS ai_admin_actions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id VARCHAR(255),
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(100) DEFAULT 'TOOL_CALL',
  safety_level INTEGER DEFAULT 1,
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  action_name VARCHAR(100) NOT NULL,
  tool_name VARCHAR(100) NOT NULL,
  input_summary TEXT,
  decision VARCHAR(100),
  reason TEXT,
  confidence DECIMAL(4,3) DEFAULT 1.000,
  result JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) DEFAULT 'success', -- 'success', 'failed', 'rejected', 'hold', 'pending_confirmation'
  error TEXT,
  confirmation_token VARCHAR(255),
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_admin_actions_entity ON ai_admin_actions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_admin_actions_tool ON ai_admin_actions(tool_name);
CREATE INDEX IF NOT EXISTS idx_ai_admin_actions_created ON ai_admin_actions(created_at DESC);

-- ── 5. AI AGENT APPROVALS (Human-in-the-Loop Gate with Atomic Locking) ────────
CREATE TABLE IF NOT EXISTS ai_agent_approvals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  action_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  risk_level VARCHAR(20) NOT NULL DEFAULT 'HIGH', -- 'MEDIUM', 'HIGH', 'CRITICAL'
  requested_by VARCHAR(255),
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  conversation_id VARCHAR(255),
  tool_name VARCHAR(100),
  tool_args JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED', 'EXECUTION_FAILED'
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  execution_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_approvals_status ON ai_agent_approvals(status);
CREATE INDEX IF NOT EXISTS idx_ai_agent_approvals_admin ON ai_agent_approvals(admin_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_approvals_created ON ai_agent_approvals(created_at DESC);

-- ── 6. AI AGENT MEMORY & CONTROL CENTER ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_agent_memory (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  memory_type VARCHAR(50) NOT NULL, -- 'preference', 'context', 'operational', 'control'
  key VARCHAR(255) NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_memory_type ON ai_agent_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_ai_agent_memory_key ON ai_agent_memory(key);

-- Seed Default Autonomous Control Center Settings
INSERT INTO ai_agent_memory (memory_type, key, value, description)
VALUES
  ('control', 'ai_global_enabled', 'true'::jsonb, 'Master kill switch for AI system'),
  ('control', 'ai_autonomous_enabled', 'true'::jsonb, 'Enables autonomous background operations'),
  ('control', 'ai_emergency_stop', 'false'::jsonb, 'Emergency stop blocking all autonomous mutations'),
  ('control', 'ai_mode', '"AUTONOMOUS"'::jsonb, 'Operational mode: OFF, READ_ONLY, ASSISTED, AUTONOMOUS, FULL_AUTONOMOUS'),
  ('control', 'action_budget', '{"max_actions_per_hour": 60, "max_notifications_per_hour": 30, "max_order_actions_per_hour": 20, "max_campaign_actions_per_day": 5}'::jsonb, 'Autonomous operational mutation limits'),
  ('operational', 'last_daily_sweep', 'null'::jsonb, 'Timestamp of last full administrative sweep'),
  ('operational', 'scheduler_state', '{}'::jsonb, 'Persistent schedule state tracking intervals across restarts')
ON CONFLICT (key) DO NOTHING;

-- ── 7. AI AUTOMATION RULES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_automation_rules (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  config JSONB DEFAULT '{}'::jsonb,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO ai_automation_rules (id, name, is_enabled, config, description)
VALUES
  ('artisan_auto_verification', 'Autonomous Artisan Verification', TRUE, '{"auto_approve_threshold": 0.85, "require_experience": true}'::jsonb, 'Evaluates artisan heritage bio and credentials. If evidence insufficient, holds for human review.'),
  ('product_auto_approval', 'Autonomous Product Approval', TRUE, '{"check_pricing": true, "check_artisan": true, "max_stock_limit": 10000}'::jsonb, 'Analyzes craft submissions. Never auto-approves on fallback without validation.'),
  ('order_auto_processing', 'Autonomous Order Risk Sentinel', TRUE, '{"notify_artisan_on_cod": true, "auto_hold_high_risk": true}'::jsonb, 'Analyzes order risk and holds suspicious orders before dispatch.'),
  ('inventory_monitoring', 'Inventory & Low Stock Sentinel', TRUE, '{"low_stock_threshold": 5, "auto_hold_out_of_stock": true}'::jsonb, 'Monitors inventory velocity and triggers targeted artisan restock alerts.'),
  ('shipping_sentinel', 'Logistics & Delay Sentinel', TRUE, '{"delay_threshold_days": 5, "auto_retry_failed_awb": true}'::jsonb, 'Detects stalled or delayed shipments and schedules safe retries.'),
  ('review_moderation', 'Review & Feedback Sentinel', TRUE, '{"auto_hide_abusive": true, "flag_spam_keywords": true}'::jsonb, 'Screens customer reviews for abusive language and spam.'),
  ('complaint_sentinel', 'Customer Complaint Sentinel', TRUE, '{"auto_prioritize": true, "alert_critical": true}'::jsonb, 'Classifies customer issues and escalates critical complaints to admin.'),
  ('daily_ai_report', 'Autonomous Daily Intelligence Report', TRUE, '{"report_time_utc": "00:00", "include_revenue": true}'::jsonb, 'Aggregates sales, shipping, artisan, and platform KPIs into daily report.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- ── 8. PLATFORM SETTINGS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_settings (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'main',
  platform_name VARCHAR(255) DEFAULT 'KalaStyle AI',
  contact_email VARCHAR(255) DEFAULT 'support@kalastyle.ai',
  contact_phone VARCHAR(50) DEFAULT '+91 7676558335',
  currency VARCHAR(10) DEFAULT 'INR',
  currency_symbol VARCHAR(10) DEFAULT '₹',
  tax_rate DECIMAL(5, 2) DEFAULT 5.00,
  platform_commission DECIMAL(5, 2) DEFAULT 10.00,
  hero_slides JSONB DEFAULT '[]'::jsonb,
  discount_banner JSONB DEFAULT '{}'::jsonb,
  ai_features_enabled BOOLEAN DEFAULT TRUE,
  daily_ai_limit_per_artisan INTEGER DEFAULT 50,
  maintenance_mode BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS hero_slides JSONB DEFAULT '[]'::jsonb;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS discount_banner JSONB DEFAULT '{}'::jsonb;

INSERT INTO platform_settings (id, platform_name)
VALUES ('main', 'KalaStyle AI')
ON CONFLICT (id) DO NOTHING;

-- ── 9. ADMIN ACTIVITY LOGS, REPORTS & NOTIFICATIONS ─────────────────────────
CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_name VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id VARCHAR(255),
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_type VARCHAR(50) NOT NULL,
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

CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  target_audience VARCHAR(50) NOT NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

-- ── 10. AI CONVERSATIONS & SESSIONS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_admin_conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(255) DEFAULT 'Autonomous Operations Session',
  messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_agent_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  conversation_id VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255) DEFAULT 'KalaStyle AI Session',
  message_count INTEGER DEFAULT 0,
  tool_calls_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 11. INDEXES ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_risk_status ON orders(risk_status);
CREATE INDEX IF NOT EXISTS idx_ai_reports_date ON ai_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_created ON admin_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_notifications_audience ON notifications(target_audience);
