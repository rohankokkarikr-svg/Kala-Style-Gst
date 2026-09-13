/**
 * backend/routes/orders.js
 * ─────────────────────────────────────────────────────────────────
 * Order routes — supports multi-artisan, COD, Razorpay, tracking, cancellation
 */

const express = require('express');
const router = express.Router();
const { protect, admin, artisan, artisanOnly, artisanOrAdmin } = require('../middleware/auth');
const {
  createOrder,
  getMyOrders,
  cancelOrder,
  updateOrderDetails,
  getAllOrders,
  updateOrderStatus,
  payOrder,
  verifyPayment,
  getOrderById,
  getOrderTracking,
  calculateTotal,
  initiateRefund,
} = require('../controllers/orderController');

// ── Customer Routes ──────────────────────────────────────────────────────────
router.post('/', protect, createOrder);
router.post('/create', protect, createOrder);              // explicit alias
router.post('/calculate-total', protect, calculateTotal); // price preview
router.get('/my', protect, getMyOrders);
router.get('/:id', protect, getOrderById);
router.get('/:id/tracking', protect, getOrderTracking);
router.put('/:id/edit', protect, updateOrderDetails);
router.put('/:id/cancel', protect, cancelOrder);
router.put('/:id/pay', protect, payOrder);                 // legacy UTR flow

// ── Admin Routes ─────────────────────────────────────────────────────────────
router.get('/', protect, admin, getAllOrders);
router.put('/:id/status', protect, artisanOrAdmin, updateOrderStatus);
router.put('/:id/verify-payment', protect, artisanOnly, verifyPayment);
router.post('/:id/refund', protect, admin, initiateRefund);

module.exports = router;
