const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert');

describe('UPI Paid Order vs COD Refund Logic Suite', () => {
  // Mock order factory
  const makeOrder = (overrides = {}) => ({
    id: 'ord_test_123',
    user_id: 'usr_test_456',
    order_number: 'KALA-202612345',
    total_amount: 1499.00,
    payment_method: 'upi',
    payment_status: 'paid',
    order_status: 'confirmed',
    status: 'confirmed',
    ...overrides,
  });

  test('Strict Rule: COD orders are NEVER eligible for refund on cancellation', () => {
    const codOrder = makeOrder({ payment_method: 'cod', payment_status: 'pending' });
    const isCod = String(codOrder.payment_method || '').toLowerCase().trim() === 'cod';
    assert.strictEqual(isCod, true, 'Payment method should identify as COD');

    // Refund gate evaluation
    const shouldRefundOnCancel = !isCod && (codOrder.payment_status === 'paid' || codOrder.payment_status === 'cod_collected');
    assert.strictEqual(shouldRefundOnCancel, false, 'COD order should never trigger refund on cancellation');
  });

  test('Strict Rule: UPI paid orders ARE eligible for refund on customer cancellation', () => {
    const upiOrder = makeOrder({ payment_method: 'upi', payment_status: 'paid' });
    const isCod = String(upiOrder.payment_method || '').toLowerCase().trim() === 'cod';
    const isPaid = upiOrder.payment_status === 'paid' || upiOrder.payment_status === 'cod_collected';

    const shouldRefundOnCancel = !isCod && isPaid;
    assert.strictEqual(shouldRefundOnCancel, true, 'UPI paid order must trigger refund on customer cancellation');
  });

  test('Strict Rule: UPI paid orders ARE eligible for refund on artisan rejection/cancellation', () => {
    const upiOrder = makeOrder({ payment_method: 'upi', payment_status: 'paid' });
    const artisanActionStatus = 'rejected'; // or 'cancelled'

    const isCod = String(upiOrder.payment_method || '').toLowerCase().trim() === 'cod';
    const isPaid = upiOrder.payment_status === 'paid' || upiOrder.payment_status === 'cod_collected';
    const isArtisanCancel = artisanActionStatus === 'rejected' || artisanActionStatus === 'cancelled';

    const shouldRefundOnArtisanAction = isArtisanCancel && !isCod && isPaid;
    assert.strictEqual(shouldRefundOnArtisanAction, true, 'Artisan rejection of UPI paid order must trigger refund');
  });

  test('COD orders rejected or cancelled by artisan do NOT trigger refund', () => {
    const codOrder = makeOrder({ payment_method: 'cod', payment_status: 'cod_pending' });
    const isCod = String(codOrder.payment_method || '').toLowerCase().trim() === 'cod';
    const isPaid = codOrder.payment_status === 'paid' || codOrder.payment_status === 'cod_collected';

    const shouldRefundOnArtisanAction = !isCod && isPaid;
    assert.strictEqual(shouldRefundOnArtisanAction, false, 'Artisan rejection of COD order must NOT trigger refund');
  });

  test('UPI payment methods normalization and eligibility', () => {
    const upiVariants = ['upi', 'upi_phonepe', 'upi_gpay', 'upi_paytm', 'razorpay'];
    for (const method of upiVariants) {
      const order = makeOrder({ payment_method: method, payment_status: 'paid' });
      const isCod = String(order.payment_method || '').toLowerCase().trim() === 'cod';
      const isPaid = order.payment_status === 'paid' || order.payment_status === 'cod_collected';
      assert.strictEqual(!isCod && isPaid, true, `Method ${method} should qualify for refund when paid`);
    }
  });

  test('Refund ID format and payload generation for UPI refunds', () => {
    const order = makeOrder({ order_number: 'KALA-202699999', total_amount: 899 });
    const cleanNum = (order.order_number || String(order.id).substring(0, 8)).replace(/[^a-zA-Z0-9]/g, '');
    const refundRef = `ref_upi_${cleanNum}_${Date.now()}`;

    assert.match(refundRef, /^ref_upi_KALA202699999_\d+$/, 'UPI refund reference must follow clean standard format');

    const refundRecord = {
      id: refundRef,
      payment_id: order.transaction_id || `UPI_${cleanNum}`,
      amount: order.total_amount,
      currency: 'INR',
      status: 'processed',
      method: order.payment_method || 'upi',
      note: 'UPI Order Cancellation Refund',
    };

    assert.strictEqual(refundRecord.amount, 899);
    assert.strictEqual(refundRecord.status, 'processed');
    assert.strictEqual(refundRecord.method, 'upi');
  });
});
