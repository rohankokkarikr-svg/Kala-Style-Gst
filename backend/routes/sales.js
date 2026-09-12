const express = require('express');
const router = express.Router();
const { protect, admin, artisanOrAdmin } = require('../middleware/auth');
const { recordScanSale, getDailySales, getSalesSummary } = require('../controllers/salesController');

// Sales routes — restricted strictly to registered artisans and admins
router.post('/scan', protect, artisanOrAdmin, recordScanSale);
router.get('/daily', protect, admin, getDailySales);
router.get('/summary', protect, admin, getSalesSummary);

module.exports = router;
