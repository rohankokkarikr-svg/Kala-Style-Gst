const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const { recordScanSale, getDailySales, getSalesSummary } = require('../controllers/salesController');

// Sales routes
router.post('/scan', protect, recordScanSale);
router.get('/daily', protect, getDailySales);
router.get('/summary', protect, getSalesSummary);

module.exports = router;
