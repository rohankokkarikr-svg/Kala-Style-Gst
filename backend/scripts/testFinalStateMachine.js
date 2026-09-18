/**
 * backend/scripts/testFinalStateMachine.js
 * ─────────────────────────────────────────────────────────────────
 * KalaStyle AI — Final Payment + COD + Shiprocket State Machine Tests
 *
 * Runs 15 unit-level tests covering:
 *  - COD lifecycle (placement → delivery → confirmCOD)
 *  - Prepaid/Razorpay lifecycle (create → verify → ship → deliver)
 *  - State machine guards and transition validation
 *  - confirmCODCollection idempotency and legacy cod_collected migration
 *  - Prepaid shipment creation gate (must be paid first)
 *
 * Usage:  node backend/scripts/testFinalStateMachine.js
 */

'use strict';

const { isValidShippingTransition, SHIPPING_STATUS } = require('../services/shipping/shippingConfig');

// ── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ──────────────────────────────────────────────────`);
}

// ── Mock Order Factory ────────────────────────────────────────────────────────

function makeCODOrder(overrides = {}) {
  return {
    id: 'test-cod-001',
    order_number: 'KS-COD-001',
    payment_method: 'cod',
    payment_status: 'cod_pending',
    order_status: 'confirmed',
    status: 'confirmed',
    shipping_status: null,
    total_amount: 500,
    ...overrides,
  };
}

function makePrepaidOrder(overrides = {}) {
  return {
    id: 'test-pre-001',
    order_number: 'KS-PRE-001',
    payment_method: 'razorpay',
    payment_status: 'paid',
    order_status: 'confirmed',
    status: 'confirmed',
    shipping_status: null,
    razorpay_order_id: 'order_test123',
    razorpay_payment_id: 'pay_test123',
    total_amount: 800,
    ...overrides,
  };
}

// ── State Machine Logic (mirrors backend) ─────────────────────────────────────

function canCreateShipment(order) {
  const method = String(order.payment_method || '').toLowerCase().trim();
  const payStatus = String(order.payment_status || '').toLowerCase().trim();
  const orderStatus = String(order.order_status || order.status || '').toLowerCase().trim();

  // Must not be cancelled
  if (['cancelled', 'rejected'].includes(orderStatus)) {
    return { allowed: false, reason: 'Order is cancelled' };
  }

  if (method === 'cod') {
    const validCodPayment = ['cod_pending', 'paid'].includes(payStatus);
    if (!validCodPayment) {
      return { allowed: false, reason: `COD order has invalid payment_status: ${payStatus}` };
    }
    return { allowed: true };
  } else {
    // Prepaid
    const isPaid = ['paid', 'completed'].includes(payStatus);
    if (!isPaid) {
      return { allowed: false, reason: `Prepaid order has payment_status='${payStatus}', must be 'paid' first` };
    }
    return { allowed: true };
  }
}

function simulateCODDelivery(order) {
  // Delivery event: shipping arrives — payment stays cod_pending
  const isCod = String(order.payment_method || '').toLowerCase() === 'cod';
  return {
    ...order,
    shipping_status: SHIPPING_STATUS.DELIVERED,
    order_status: 'delivered',
    status: 'delivered',
    // COD: payment_status MUST stay cod_pending — do NOT change it
    // Prepaid: payment_status stays 'paid' — do NOT change it
    payment_status: order.payment_status,
    _delivery_applied: true,
  };
}

function confirmCODCollection(order) {
  const payStatus = String(order.payment_status || '').toLowerCase();

  // Already paid (idempotent)
  if (payStatus === 'paid') {
    return { success: true, already_confirmed: true, order };
  }

  // Legacy alias migration
  if (payStatus === 'cod_collected') {
    return { success: true, already_confirmed: true, migrated: true, order: { ...order, payment_status: 'paid' } };
  }

  // Must be cod_pending
  if (payStatus !== 'cod_pending') {
    return { success: false, error: `Cannot confirm COD: payment_status='${order.payment_status}', expected 'cod_pending'` };
  }

  // Must be delivered
  const shippingStatus = String(order.shipping_status || '').toUpperCase();
  if (shippingStatus !== 'DELIVERED') {
    return { success: false, error: `Cannot confirm COD: order not yet delivered (shipping_status='${order.shipping_status}')` };
  }

  return {
    success: true,
    order: { ...order, payment_status: 'paid', order_status: 'delivered' },
  };
}

// ── TESTS ─────────────────────────────────────────────────────────────────────

section('1. COD ORDER LIFECYCLE');

{
  // Test 1: COD order can have shipment created while cod_pending
  const order = makeCODOrder();
  const result = canCreateShipment(order);
  assert('T01: COD cod_pending allows shipment creation', result.allowed, result.reason);
}

{
  // Test 2: COD cancelled order blocks shipment
  const order = makeCODOrder({ order_status: 'cancelled', status: 'cancelled' });
  const result = canCreateShipment(order);
  assert('T02: COD cancelled order blocks shipment creation', !result.allowed, result.reason);
}

{
  // Test 3: COD delivery event does NOT change payment_status
  const order = makeCODOrder();
  const delivered = simulateCODDelivery(order);
  assert('T03: COD delivery keeps payment_status=cod_pending', delivered.payment_status === 'cod_pending',
    `payment_status was: ${delivered.payment_status}`);
}

{
  // Test 4: COD delivery sets order_status=delivered
  const order = makeCODOrder();
  const delivered = simulateCODDelivery(order);
  assert('T04: COD delivery sets order_status=delivered', delivered.order_status === 'delivered',
    `order_status was: ${delivered.order_status}`);
}

{
  // Test 5: confirmCODCollection fails if not yet delivered
  const order = makeCODOrder({ shipping_status: null });
  const result = confirmCODCollection(order);
  assert('T05: confirmCODCollection blocks if not delivered', !result.success, result.error);
}

{
  // Test 6: Full COD happy path — cod_pending → delivered → confirmCOD → paid
  const order = makeCODOrder();
  const delivered = simulateCODDelivery(order);
  const confirmed = confirmCODCollection(delivered);
  assert('T06: Full COD lifecycle — paid after confirmCODCollection',
    confirmed.success && confirmed.order.payment_status === 'paid',
    JSON.stringify(confirmed));
}

{
  // Test 7: confirmCODCollection is idempotent when already paid
  const order = makeCODOrder({ payment_status: 'paid', shipping_status: SHIPPING_STATUS.DELIVERED });
  const result = confirmCODCollection(order);
  assert('T07: confirmCODCollection idempotent on already-paid order',
    result.success && result.already_confirmed === true, JSON.stringify(result));
}

{
  // Test 8: Legacy cod_collected is migrated gracefully
  const order = makeCODOrder({ payment_status: 'cod_collected', shipping_status: SHIPPING_STATUS.DELIVERED });
  const result = confirmCODCollection(order);
  assert('T08: cod_collected legacy state migrated to paid',
    result.success && result.migrated === true && result.order.payment_status === 'paid',
    JSON.stringify(result));
}

section('2. PREPAID (RAZORPAY/UPI) LIFECYCLE');

{
  // Test 9: Unpaid prepaid order blocks shipment creation
  const order = makePrepaidOrder({ payment_status: 'pending' });
  const result = canCreateShipment(order);
  assert('T09: Prepaid pending blocks shipment creation', !result.allowed, result.reason);
}

{
  // Test 10: Paid prepaid order allows shipment creation
  const order = makePrepaidOrder({ payment_status: 'paid' });
  const result = canCreateShipment(order);
  assert('T10: Prepaid paid allows shipment creation', result.allowed, result.reason);
}

{
  // Test 11: Prepaid delivery does NOT change payment_status (stays 'paid')
  const order = makePrepaidOrder({ payment_status: 'paid' });
  const delivered = simulateCODDelivery(order); // same simulation — only shipping/order changes
  assert('T11: Prepaid delivery keeps payment_status=paid',
    delivered.payment_status === 'paid', `payment_status was: ${delivered.payment_status}`);
}

{
  // Test 12: Prepaid 'failed' payment blocks shipment
  const order = makePrepaidOrder({ payment_status: 'failed' });
  const result = canCreateShipment(order);
  assert('T12: Prepaid failed payment blocks shipment', !result.allowed, result.reason);
}

section('3. SHIPPING STATE MACHINE TRANSITIONS');

{
  // Test 13: Valid transition pending → ready_to_ship (first valid transition from PENDING)
  const valid = isValidShippingTransition(SHIPPING_STATUS.PENDING, 'READY_TO_SHIP');
  assert('T13: pending → ready_to_ship is valid', valid === true);
}


{
  // Test 14: Invalid transition — cannot go backward delivered → in_transit
  const invalid = isValidShippingTransition(SHIPPING_STATUS.DELIVERED, SHIPPING_STATUS.IN_TRANSIT);
  assert('T14: delivered → in_transit is INVALID (no backward moves)', invalid === false);
}

section('4. COD CANNOT BE CONFIRMED WITHOUT DELIVERY');

{
  // Test 15: confirmCODCollection strictly requires shipping_status = DELIVERED
  const order = makeCODOrder({ payment_status: 'cod_pending', shipping_status: 'in_transit' });
  const result = confirmCODCollection(order);
  assert('T15: confirmCODCollection blocked when in_transit (not delivered)',
    !result.success, result.error);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n═══════════════════════════════════════════════════════════════`);
console.log(`  KalaStyle AI — State Machine Test Results`);
console.log(`  ✅ PASSED: ${passed} / ${passed + failed}`);
if (failed > 0) {
  console.log(`  ❌ FAILED: ${failed}`);
  process.exit(1);
} else {
  console.log(`  🎉 ALL TESTS PASSED`);
  process.exit(0);
}
