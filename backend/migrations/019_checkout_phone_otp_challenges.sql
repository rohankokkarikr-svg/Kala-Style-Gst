-- =====================================================================
-- Migration: 019_checkout_phone_otp_challenges.sql
-- KalaStyle AI — Checkout Phone OTP Challenge Metadata Table
--
-- PURPOSE: Persistent store for checkout phone verification challenges.
--   - Survives backend restarts (no in-memory state)
--   - Enables idempotency and anti-duplication on order creation
--   - Narrowly scoped RLS: a user can only read/write their own challenges
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS checkout_otp_challenges;
--   DROP INDEX IF EXISTS idx_checkout_otp_user_phone;
--   DROP INDEX IF EXISTS idx_checkout_otp_token;
--   DROP INDEX IF EXISTS idx_checkout_otp_expires;
--
-- NOTE: Never stores plaintext OTP values. The verify_token column holds
--       an opaque server-generated token issued AFTER Twilio confirms the code.
-- =====================================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS checkout_otp_challenges (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_e164      TEXT        NOT NULL,  -- E.164 normalized phone, e.g. +919876543210
  purpose         TEXT        NOT NULL DEFAULT 'checkout_order_confirmation',
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed        BOOLEAN     NOT NULL DEFAULT false,
  consumed_at     TIMESTAMPTZ,
  verify_token    TEXT        UNIQUE,    -- Opaque one-time token, NULL until verified
  token_expires_at TIMESTAMPTZ,          -- 15-min window after verification
  verified_at     TIMESTAMPTZ,
  send_count      INTEGER     NOT NULL DEFAULT 1,
  last_send_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count   INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_checkout_otp_user_phone
  ON checkout_otp_challenges(user_id, phone_e164, purpose, consumed)
  WHERE consumed = false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkout_otp_token
  ON checkout_otp_challenges(verify_token)
  WHERE verify_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checkout_otp_expires
  ON checkout_otp_challenges(expires_at)
  WHERE consumed = false;

-- 3. Auto-update updated_at
CREATE OR REPLACE FUNCTION update_checkout_otp_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_checkout_otp_updated_at ON checkout_otp_challenges;
CREATE TRIGGER trg_checkout_otp_updated_at
  BEFORE UPDATE ON checkout_otp_challenges
  FOR EACH ROW EXECUTE FUNCTION update_checkout_otp_updated_at();

-- 4. Row Level Security (least-privilege)
ALTER TABLE checkout_otp_challenges ENABLE ROW LEVEL SECURITY;

-- Service role (backend) bypasses RLS — only backend can read/write all rows.
-- No anon or authenticated browser policy needed — this table is backend-only.

-- Allow authenticated users to read only their own challenge metadata
-- (but NOT the verify_token — that is never returned to frontend anyway)
CREATE POLICY "Users can read own challenges"
  ON checkout_otp_challenges
  FOR SELECT
  USING (auth.uid()::text = user_id::text);

-- Deny all browser INSERT/UPDATE/DELETE — backend uses service_role key only
-- (No INSERT/UPDATE/DELETE policy for authenticated role → denied by default)

-- 5. Cleanup function: remove expired consumed challenges older than 24h
-- Can be called by a cron job or admin; not required for correctness.
CREATE OR REPLACE FUNCTION cleanup_expired_checkout_challenges()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM checkout_otp_challenges
  WHERE expires_at < now() - INTERVAL '24 hours';
END;
$$;

-- Comments
COMMENT ON TABLE  checkout_otp_challenges IS 'Persistent phone OTP challenge metadata for checkout verification. No plaintext OTP stored.';
COMMENT ON COLUMN checkout_otp_challenges.verify_token IS 'Opaque one-time token issued by server ONLY after Twilio confirms code is correct. Consumed atomically on order creation.';
COMMENT ON COLUMN checkout_otp_challenges.phone_e164 IS 'E.164 normalized delivery phone number. Verified by Twilio Verify before token is issued.';
