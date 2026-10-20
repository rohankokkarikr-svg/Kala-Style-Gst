/**
 * backend/tests/order_calculation.test.js
 * ─────────────────────────────────────────────────────────────────
 * Tests for resilient order total calculation, UUID & barcode lookup,
 * and Supabase secret/service-role key resolution.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { calculateOrderTotals } = require('../services/orderService');
const { supabase, resolveServiceRoleKey, getSupabaseDiagnostics } = require('../config/supabase');

describe('Resilient Order Calculation & Product Lookup Suite', () => {

  let testProductId;
  let createdTestProduct = false;

  test.before(async () => {
    const { data } = await supabase
      .from('products')
      .select('id')
      .eq('status', 'approved')
      .neq('is_hidden', true)
      .limit(1);

    if (data?.[0]?.id) {
      testProductId = data[0].id;
    } else {
      // Create isolated test fixture for the suite
      const { data: inserted, error: insertErr } = await supabase
        .from('products')
        .insert({
          name: 'Test Handicraft Item',
          category: 'Handloom & Textiles',
          price: 500,
          stock_quantity: 50,
          is_in_stock: true,
          status: 'approved',
          is_hidden: false,
        })
        .select('id')
        .single();

      if (inserted?.id) {
        testProductId = inserted.id;
        createdTestProduct = true;
      } else {
        testProductId = '788d29e0-5752-4562-a552-0860f152ee8e';
      }
    }
  });

  test.after(async () => {
    if (createdTestProduct && testProductId) {
      await supabase.from('products').delete().eq('id', testProductId);
    }
  });

  test('calculateOrderTotals handles valid UUID products and computes totals correctly', async () => {
    const result = await calculateOrderTotals([
      { product_id: testProductId, quantity: 2, size: 'Free Size' }
    ]);

    assert.strictEqual(result.error, undefined, 'Should not return error for existing approved product');
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].product_id, testProductId);
    assert.strictEqual(result.items[0].quantity, 2);
    assert.strictEqual(result.subtotal, result.items[0].unit_price_snapshot * 2);
  });

  test('calculateOrderTotals normalizes trimmed product IDs', async () => {
    const result = await calculateOrderTotals([
      { product_id: `  ${testProductId}  `, quantity: 1 }
    ]);

    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.items[0].product_id, testProductId);
  });

  test('calculateOrderTotals gracefully handles non-existent product without database syntax errors', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000099';
    const result = await calculateOrderTotals([
      { product_id: fakeUuid, quantity: 1 }
    ]);

    assert.ok(result.error);
    assert.match(result.error, /Product not found:\s*00000000-0000-0000-0000-000000000099/i);
  });

  test('calculateOrderTotals rejects empty or invalid item arrays', async () => {
    const emptyRes = await calculateOrderTotals([]);
    assert.strictEqual(emptyRes.error, 'No order items provided');

    const invalidIdRes = await calculateOrderTotals([{ product_id: '', quantity: 1 }]);
    assert.strictEqual(invalidIdRes.error, 'No valid product IDs provided');
  });

  test('calculateOrderTotals rejects excessive or non-integer quantities', async () => {
    const overLimitRes = await calculateOrderTotals([
      { product_id: testProductId, quantity: 999 }
    ]);
    assert.match(overLimitRes.error, /exceeds maximum allowed order limit/i);

    const negativeRes = await calculateOrderTotals([
      { product_id: testProductId, quantity: -1 }
    ]);
    assert.match(negativeRes.error, /must be a positive integer/i);
  });

  test('Supabase client resolves authoritative secret key without hardcoded fallbacks', () => {
    const diag = getSupabaseDiagnostics();
    assert.ok(diag.configured, 'Supabase client must be configured');
    assert.ok(diag.host, 'Host must be resolved from SUPABASE_URL');

    // Test that modern opaque sb_secret_... keys are resolved directly without JWT split errors
    const savedSecretKey = process.env.SUPABASE_SECRET_KEY;
    try {
      process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_mock_secret_key_12345';
      const resolved = resolveServiceRoleKey();
      assert.strictEqual(resolved, 'sb_secret_test_mock_secret_key_12345', 'Modern sb_secret_ key must be resolved directly');
    } finally {
      if (savedSecretKey) process.env.SUPABASE_SECRET_KEY = savedSecretKey;
      else delete process.env.SUPABASE_SECRET_KEY;
    }
  });
});
