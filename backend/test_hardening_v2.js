/**
 * backend/test_hardening_v2.js
 * ─────────────────────────────────────────────────────────────────
 * Validation test suite for:
 * 1. Suspicious order risk classification & signals
 * 2. AI safety level enforcement & high-risk interception
 * 3. Atomic inventory methods availability & signature
 * 4. Transaction ID prefix branding (KALA)
 */

const assert = require('assert');
const suspiciousService = require('./services/suspiciousOrderService');
const { atomicDeductStock, atomicRestoreStock, restoreInventory } = require('./services/orderService');
const { generateTransactionId } = require('./services/paymentService');
const { executeTool } = require('./ai/aiToolExecutor');

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 KALASTYLE AI — HARDENING V2 VALIDATION TEST SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name} ->`, e.message);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name} ->`, e.message);
      failed++;
    }
  }

  // --- 1. Branding & Transaction ID ---
  console.log('--- TEST 1: Branding & Transaction ID Prefix ---');
  test('generateTransactionId uses KALA prefix', () => {
    const txnId = generateTransactionId('fa675c0c-cb9e-4f45-a357');
    assert(txnId.startsWith('KALA'), `Expected prefix KALA, got: ${txnId}`);
  });

  // --- 2. Atomic Inventory Helpers ---
  console.log('\n--- TEST 2: Atomic Inventory Functions Availability ---');
  test('atomicDeductStock is exported as function', () => {
    assert.strictEqual(typeof atomicDeductStock, 'function');
  });
  test('atomicRestoreStock is exported as function', () => {
    assert.strictEqual(typeof atomicRestoreStock, 'function');
  });
  test('restoreInventory is exported as function', () => {
    assert.strictEqual(typeof restoreInventory, 'function');
  });

  // --- 3. Suspicious Order Detection ---
  console.log('\n--- TEST 3: AI Suspicious Order Detection & Scoring ---');
  await testAsync('Normal order classifies as normal risk', async () => {
    const evalResult = await suspiciousService.evaluateOrderRisk({
      total_amount: 1500,
      payment_method: 'razorpay',
      phone: '9876543210',
      shipping_address: '124 Heritage Lane, Near Old Temple, Jaipur, Rajasthan - 302001',
    });
    assert.strictEqual(evalResult.riskStatus, 'normal');
    assert(evalResult.riskScore < 35, `Expected score < 35, got ${evalResult.riskScore}`);
  });

  await testAsync('High value COD with invalid address flags as high_risk', async () => {
    const evalResult = await suspiciousService.evaluateOrderRisk({
      total_amount: 28000,
      payment_method: 'cod',
      phone: '123',
      shipping_address: 'test dummy',
    });
    assert.strictEqual(evalResult.riskStatus, 'high_risk');
    assert(evalResult.riskScore >= 70, `Expected score >= 70, got ${evalResult.riskScore}`);
    assert(evalResult.reasons.length >= 2, 'Expected multiple identified risk reasons');
  });

  // --- 4. AI Safety Level Interception ---
  console.log('\n--- TEST 4: AI Safety Levels (Level 3 High-Risk Interception) ---');
  await testAsync('Level 3 high-risk action (reject_artisan) requires admin confirmation token', async () => {
    const res = await executeTool('reject_artisan', {
      artisan_id: 'test-artisan-uuid',
      reason: 'Missing credentials',
    });
    assert.strictEqual(res.requires_admin_confirmation, true);
    assert.strictEqual(res.safety_level, 3);
    assert(res.confirmation_token, 'Expected confirmation_token');
  });

  await testAsync('Level 3 high-risk action with admin_confirmed=true executes without interception', async () => {
    const res = await executeTool('reject_artisan', {
      artisan_id: 'test-artisan-uuid',
      reason: 'Admin manually confirmed rejection',
      admin_confirmed: true,
    });
    assert.notStrictEqual(res.requires_admin_confirmation, true);
  });

  await testAsync('get_suspicious_orders tool is available and callable', async () => {
    const res = await executeTool('get_suspicious_orders', { limit: 5 });
    const payload = res.data || res;
    assert(res.success !== false, 'Expected success');
    assert(typeof payload.total === 'number', `Expected total count number, got ${payload.total}`);
    assert(Array.isArray(payload.orders), 'Expected orders array');
  });

  console.log('\n======================================================');
  console.log(`🏁 VALIDATION RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
