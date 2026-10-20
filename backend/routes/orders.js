/**
 * backend/routes/orders.js
 * ─────────────────────────────────────────────────────────────────
 * Order routes — supports multi-artisan, COD, Razorpay, tracking, cancellation.
 *
 * IMPORTANT:
 *   POST /phone-otp/send and POST /phone-otp/verify are the NEW separate
 *   checkout phone-OTP endpoints. They are completely isolated from
 *   /api/auth/send-otp and /api/auth/verify-otp (login email OTP).
 *
 *   The old /send-otp and /verify-otp routes are RETAINED for backward
 *   compatibility but are no longer called by Checkout.js.
 */

const express = require('express');
const router = express.Router();
const { protect, admin, artisan, artisanOnly, artisanOrAdmin } = require('../middleware/auth');
const { checkoutOtpSendLimiter, checkoutOtpVerifyLimiter } = require('../middleware/rateLimiter');
const {
  createOrder,
  getMyOrders,
  cancelOrder,
  switchToCOD,
  updateOrderDetails,
  getAllOrders,
  updateOrderStatus,
  payOrder,
  verifyPayment,
  getOrderById,
  getOrderTracking,
  calculateTotal,
  initiateRefund,
  confirmCODCollection,
} = require('../controllers/orderController');
const {
  sendCheckoutPhoneOtpHandler,
  verifyCheckoutPhoneOtpHandler,
} = require('../controllers/checkoutPhoneOtpController');

// ── NEW: Checkout Phone OTP (SEPARATE from login email OTP) ──────────────────
// Protected by JWT auth (user must be logged in) + dedicated IP rate limits.
router.post('/phone-otp/send',   protect, checkoutOtpSendLimiter,   sendCheckoutPhoneOtpHandler);
router.post('/phone-otp/verify', protect, checkoutOtpVerifyLimiter, verifyCheckoutPhoneOtpHandler);

// ── Customer Routes ──────────────────────────────────────────────────────────
router.post('/', protect, createOrder);
router.post('/create', protect, createOrder);              // explicit alias
router.post('/calculate-total', protect, calculateTotal); // price preview
router.get('/my', protect, getMyOrders);
router.get('/:id', protect, getOrderById);
router.get('/:id/tracking', protect, getOrderTracking);
router.put('/:id/edit', protect, updateOrderDetails);
router.put('/:id/cancel', protect, cancelOrder);
router.put('/:id/switch-to-cod', protect, switchToCOD);
router.put('/:id/pay', protect, payOrder);                 // legacy UTR flow

// ── Admin Routes ─────────────────────────────────────────────────────────────
router.get('/', protect, admin, getAllOrders);
router.put('/:id/status', protect, artisanOrAdmin, updateOrderStatus);
router.put('/:id/verify-payment', protect, artisanOnly, verifyPayment);
router.post('/:id/refund', protect, admin, initiateRefund);
router.post('/:id/confirm-cod', protect, admin, confirmCODCollection);

module.exports = router;
