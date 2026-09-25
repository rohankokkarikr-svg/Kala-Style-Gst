/**
 * backend/routes/artisans.js
 * ─────────────────────────────────────────────────────────────────
 * Artisan routes — includes artisan sub-order management and earnings
 */

const express = require('express');
const router = express.Router();
const {
  getArtisans, getArtisanById, getMyProfile, updateMyProfile,
  getMyStats, getMyOrders, verifyArtisan, getAllArtisans,
  getMyArtisanOrders, updateArtisanOrderStatus, getMyEarnings,
} = require('../controllers/artisanController');
const { updateOrderStatus, verifyPayment } = require('../controllers/orderController');
const { protect, admin, artisan, artisanOnly } = require('../middleware/auth');

// ── Public routes ────────────────────────────────────────────────────────────
router.get('/', getArtisans);
router.get('/admin/all', protect, admin, getAllArtisans);

// ── Artisan profile & stats ──────────────────────────────────────────────────
router.get('/me', protect, artisan, getMyProfile);
router.get('/me/stats', protect, artisan, getMyStats);
router.put('/me', protect, artisan, updateMyProfile);

// ── Artisan sub-order management (uses artisan_orders table) ─────────────────
router.get('/orders', protect, artisan, getMyArtisanOrders);
router.patch('/orders/:id/status', protect, artisan, updateArtisanOrderStatus);
router.put('/orders/:id/status', protect, artisan, updateArtisanOrderStatus);

// ── Legacy order routes (kept for backward compat) ───────────────────────────
router.get('/me/orders', protect, artisan, getMyOrders);
router.put('/me/orders/:id/status', protect, artisan, updateArtisanOrderStatus);
router.put('/orders/:id/verify-payment', protect, artisan, verifyPayment);
router.put('/me/orders/:id/verify-payment', protect, artisan, verifyPayment);

// ── Artisan earnings ─────────────────────────────────────────────────────────
router.get('/earnings', protect, artisan, getMyEarnings);

// ── Admin: verify artisan ────────────────────────────────────────────────────
router.patch('/:id/verify', protect, admin, verifyArtisan);

// ── Public: get artisan by id ────────────────────────────────────────────────
router.get('/:id', getArtisanById);

module.exports = router;
