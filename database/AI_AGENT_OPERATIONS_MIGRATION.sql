-- ============================================================
-- KALASTYLE AI — Agent Operations Extension Migration
-- Run this in your Supabase SQL Editor after AI_ADMIN_SYSTEM_MIGRATION.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. AI AGENT APPROVALS (Approval Gate for HIGH/CRITICAL Actions) ──────────
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
  status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED'
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

-- ── 2. AI AGENT MEMORY (Persistent Operational Memory) ────────────────────────
CREATE TABLE IF NOT EXISTS ai_agent_memory (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  memory_type VARCHAR(50) NOT NULL, -- 'preference', 'context', 'operational', 'session'
  key VARCHAR(255) NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_memory_type ON ai_agent_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_ai_agent_memory_key ON ai_agent_memory(key);

-- Seed default memory entries
INSERT INTO ai_agent_memory (memory_type, key, value, description)
VALUES
  (
    'preference',
    'agent_language',
    '"en"'::jsonb,
    'Default response language for AI agent'
  ),
  (
    'operational',
    'last_health_check',
    'null'::jsonb,
    'Timestamp of last system health check'
  ),
  (
    'operational',
    'suspicious_order_threshold',
    '3'::jsonb,
    'Number of risk signals to classify as high_risk'
  )
ON CONFLICT (key) DO NOTHING;

-- ── 3. EXTEND ORDERS TABLE (for risk tracking if not already added) ────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS risk_status VARCHAR(50) DEFAULT 'normal';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS risk_reasons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ── 4. EXTEND ARTISAN PROFILES TABLE (for agent operations) ────────────────────
ALTER TABLE artisan_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE artisan_profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE artisan_profiles ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(50);

-- ── 5. EXTEND PRODUCTS TABLE (for agent operations) ────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE products ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_description_generated BOOLEAN DEFAULT FALSE;

-- ── 6. AGENT SESSION TRACKING (lightweight, separate from ai_admin_conversations) ──
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

CREATE INDEX IF NOT EXISTS idx_ai_agent_sessions_admin ON ai_agent_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_sessions_created ON ai_agent_sessions(created_at DESC);

-- ============================================================
-- END OF MIGRATION
-- ============================================================
