-- ═══════════════════════════════════════════════════════════════════════════════
-- 007_payment_state_machine_correction.sql
-- KalaStyle AI — Payment State Machine Correction
--
-- Purpose:
--   1. Add payment collection metadata columns (idempotent: IF NOT EXISTS)
--   2. Fix any existing orders stuck with payment_status = 'cod_collected'
--      → reset to 'cod_pending' for orders not yet manually confirmed
--   3. Fix any orders with payment_status = 'cod_collected' AND verified manual
--      confirmation evidence → migrate to 'paid'
--
-- SAFE: uses IF NOT EXISTS, no DROP, no data deletion, fully idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add payment collection metadata columns (safe) ─────────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_collected_at     TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_collected_by     TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_collection_notes TEXT        DEFAULT NULL;

-- ── 2. Fix legacy 'cod_collected' stuck orders ────────────────────────────────
-- Orders with payment_status = 'cod_collected' that are NOT yet marked as
-- shipping_state = DELIVERED should be reset to 'cod_pending' (delivery not confirmed).
UPDATE orders
SET
  payment_status = 'cod_pending',
  updated_at     = NOW()
WHERE
  payment_method = 'cod'
  AND payment_status = 'cod_collected'
  AND (
    shipping_state IS NULL
    OR UPPER(shipping_state) != 'DELIVERED'
  )
  AND payment_collected_at IS NULL;

-- ── 3. Migrate 'cod_collected' orders that ARE fully delivered ─────────────────
-- If order is COD + cod_collected + shipping = DELIVERED, treat as collection
-- confirmed and migrate to 'paid' for state machine consistency.
UPDATE orders
SET
  payment_status = 'paid',
  payment_collected_at = COALESCE(payment_collected_at, NOW()),
  payment_collected_by = COALESCE(payment_collected_by, 'system_migration_007'),
  payment_collection_notes = COALESCE(payment_collection_notes, 'Auto-migrated from legacy cod_collected state by migration 007'),
  updated_at = NOW()
WHERE
  payment_method = 'cod'
  AND payment_status = 'cod_collected'
  AND UPPER(COALESCE(shipping_state, '')) = 'DELIVERED';

-- Also sync the payments table for migrated records
UPDATE payments p
SET
  status     = 'paid',
  paid_at    = COALESCE(p.paid_at, NOW()),
  updated_at = NOW()
FROM orders o
WHERE
  p.order_id     = o.id
  AND o.payment_method = 'cod'
  AND o.payment_status = 'paid'
  AND p.status   != 'paid';

-- ── 4. Ensure payment_channel column exists for UPI tracking (optional) ────────
-- Records whether UPI or card was the channel within Razorpay.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_channel TEXT DEFAULT NULL;

-- ── 5. Add index for fast COD pending lookup ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_cod_pending
  ON orders (payment_method, payment_status)
  WHERE payment_method = 'cod' AND payment_status = 'cod_pending';

-- Done
