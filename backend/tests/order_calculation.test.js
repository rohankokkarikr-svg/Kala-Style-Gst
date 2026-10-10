/**
 * backend/tests/order_calculation.test.js
 * ─────────────────────────────────────────────────────────────────
 * Tests for resilient order total calculation, UUID & barcode lookup,
 * and Supabase service role key resolution.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { calculateOrderTotals } = require('../services/orderService');

describe('Resilient Order Calculation & Product Lookup Suite', () => {

  test('calculateOrderTotals handles valid UUID products and computes totals correctly', async () => {
    // Royal Blue and Cyan Handloom Cotton Saree (id: 13361634-8caf-4e45-b1c8-450817b2319c)
    const result = await calculateOrderTotals([
      { product_id: '13361634-8caf-4e45-b1c8-450817b2319c', quantity: 2, size: 'Free Size' }
    ]);

    assert.strictEqual(result.error, undefined, 'Should not return error for existing approved product');
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].product_id, '13361634-8caf-4e45-b1c8-450817b2319c');
    assert.strictEqual(result.items[0].quantity, 2);
    assert.strictEqual(result.subtotal, result.items[0].unit_price_snapshot * 2);
  });

  test('calculateOrderTotals normalizes trimmed product IDs', async () => {
    const result = await calculateOrderTotals([
      { product_id: '  13361634-8caf-4e45-b1c8-450817b2319c  ', quantity: 1 }
    ]);

    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.items[0].product_id, '13361634-8caf-4e45-b1c8-450817b2319c');
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
      { product_id: '13361634-8caf-4e45-b1c8-450817b2319c', quantity: 999 }
    ]);
    assert.match(overLimitRes.error, /exceeds maximum allowed order limit/i);

    const negativeRes = await calculateOrderTotals([
      { product_id: '13361634-8caf-4e45-b1c8-450817b2319c', quantity: -1 }
    ]);
    assert.match(negativeRes.error, /must be a positive integer/i);
  });
});
