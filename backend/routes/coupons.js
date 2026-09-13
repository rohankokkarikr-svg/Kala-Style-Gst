const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { protect } = require('../middleware/auth');

router.post('/spin', protect, couponController.spinWheel);
router.post('/validate', protect, couponController.validateCoupon);
router.get('/my-coupons', protect, couponController.getMyCoupons);

module.exports = router;
