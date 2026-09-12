-- ============================================================
-- 003_ai_admin_and_automation.sql — Autonomous AI Admin, Audit Logs & Safety
-- ============================================================

-- 1. AI Admin Actions Audit Trail (Immutable)
CREATE TABLE IF NOT EXISTS ai_admin_actions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id VARCHAR(255),
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(100) DEFAULT 'TOOL_CALL',
  safety_level INTEGER DEFAULT 1, -- 1: Safe, 2: Controlled, 3: High Risk
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  action_name VARCHAR(255) NOT NULL,
  tool_name VARCHAR(255) NOT NULL,
  input_summary TEXT,
  decision VARCHAR(100) NOT NULL,
  reason TEXT,
  confidence DECIMAL(4, 3) DEFAULT 1.000,
  result JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) DEFAULT 'success',
  error TEXT,
  confirmation_token VARCHAR(255),
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. AI Background Job Queue
CREATE TABLE IF NOT EXISTS ai_job_queue (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
  priority INTEGER DEFAULT 5,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. AI Automation Rules
CREATE TABLE IF NOT EXISTS ai_automation_rules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  rule_key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT TRUE,
  config JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. AI Daily Business Intelligence Reports
CREATE TABLE IF NOT EXISTS ai_daily_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  report_date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  metrics JSONB NOT NULL,
  insights TEXT,
  recommendations TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Customer / Artisan Complaints & Dispute System
CREATE TABLE IF NOT EXISTS customer_complaints (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  artisan_id UUID REFERENCES artisan_profiles(id) ON DELETE SET NULL,
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'open', -- open, under_review, resolved, rejected
  resolution_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
