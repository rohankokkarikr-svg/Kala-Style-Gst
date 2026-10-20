-- ==============================================================================
-- 021_notifications_rls_policies.sql
-- ==============================================================================
-- Description: Fixes Row-Level Security (RLS) policies for notifications table.
--              Ensures that service_role, authenticated users, and public/anon
--              can insert, read, and update notifications without triggering 42501.
-- Run this in Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Ensure table exists with all required columns and constraints
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

-- 2. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_target_user ON notifications(target_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_target_audience ON notifications(target_audience);
CREATE INDEX IF NOT EXISTS idx_notifications_sender ON notifications(sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- 3. Enable Row-Level Security (RLS)
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;

-- 4. Drop all existing policies on notifications (clean slate)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'notifications' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON notifications', pol.policyname);
  END LOOP;
END $$;

-- 5. Service role: FULL unrestricted access (backend bypasses RLS)
CREATE POLICY "notifications_service_role_all"
  ON notifications FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 6. Authenticated and Anon users: SELECT (read messages), INSERT (send messages), UPDATE (mark as read)
CREATE POLICY "notifications_select_all"
  ON notifications FOR SELECT
  USING (true);

CREATE POLICY "notifications_insert_all"
  ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "notifications_update_all"
  ON notifications FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE POLICY "notifications_delete_all"
  ON notifications FOR DELETE
  USING (true);
