const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { protect } = require('../middleware/auth');
const { spinLimiter } = require('../middleware/rateLimiter');

router.post('/spin', protect, spinLimiter, couponController.spinWheel);
router.post('/validate', protect, couponController.validateCoupon);
router.get('/my-coupons', protect, couponController.getMyCoupons);

module.exports = router;
