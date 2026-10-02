const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { protect, optionalProtect } = require('../middleware/auth');

router.post('/spin', protect, couponController.spinWheel);
router.post('/validate', optionalProtect, couponController.validateCoupon);
router.get('/my-coupons', protect, couponController.getMyCoupons);

module.exports = router;
