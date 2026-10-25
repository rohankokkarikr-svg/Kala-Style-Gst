const { describe, test } = require('node:test');
const assert = require('node:assert');
const { isValidArtisanTransition } = require('../config/ecommerce');

describe('Order Status Bidirectional & Payment Audit Suite', () => {
  test('Artisan operational statuses support backward transitions smoothly', () => {
    // Forward transitions
    assert.strictEqual(isValidArtisanTransition('pending', 'accepted'), true);
    assert.strictEqual(isValidArtisanTransition('accepted', 'processing'), true);
    assert.strictEqual(isValidArtisanTransition('processing', 'shipped'), true);
    assert.strictEqual(isValidArtisanTransition('shipped', 'delivered'), true);

    // Backward transitions (reverting mistakes)
    assert.strictEqual(isValidArtisanTransition('accepted', 'pending'), true, 'accepted can revert to pending');
    assert.strictEqual(isValidArtisanTransition('processing', 'accepted'), true, 'processing can revert to accepted');
    assert.strictEqual(isValidArtisanTransition('processing', 'pending'), true, 'processing can revert to pending');
    assert.strictEqual(isValidArtisanTransition('shipped', 'processing'), true, 'shipped can revert to processing');
    assert.strictEqual(isValidArtisanTransition('shipped', 'accepted'), true, 'shipped can revert to accepted');
    assert.strictEqual(isValidArtisanTransition('delivered', 'shipped'), true, 'delivered can revert to shipped');
    assert.strictEqual(isValidArtisanTransition('delivered', 'processing'), true, 'delivered can revert to processing');
    assert.strictEqual(isValidArtisanTransition('delivered', 'accepted'), true, 'delivered can revert to accepted');
  });

  test('Terminal statuses remain strictly guarded against unauthorized reopening', () => {
    assert.strictEqual(isValidArtisanTransition('rejected', 'accepted'), false);
    assert.strictEqual(isValidArtisanTransition('cancelled', 'accepted'), false);
    assert.strictEqual(isValidArtisanTransition('rejected', 'processing'), false);
    assert.strictEqual(isValidArtisanTransition('cancelled', 'processing'), false);
    assert.strictEqual(isValidArtisanTransition('delivered', 'pending'), false, 'delivered cannot jump directly to pending');
  });

  test('Payment method invariants: non-COD orders must never be cod_pending', () => {
    const sanitizePaymentStatus = (paymentMethod, paymentStatus, transactionId) => {
      const isCod = String(paymentMethod || '').toLowerCase().trim() === 'cod';
      if (!isCod && paymentStatus === 'cod_pending') {
        return transactionId ? 'pending_verification' : 'pending';
      }
      return paymentStatus;
    };

    assert.strictEqual(sanitizePaymentStatus('cod', 'cod_pending'), 'cod_pending');
    assert.strictEqual(sanitizePaymentStatus('upi', 'cod_pending'), 'pending');
    assert.strictEqual(sanitizePaymentStatus('upi', 'cod_pending', '123456789012'), 'pending_verification');
    assert.strictEqual(sanitizePaymentStatus('razorpay', 'cod_pending'), 'pending');
  });
});
