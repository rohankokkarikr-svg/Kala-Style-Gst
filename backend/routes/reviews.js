const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { protect, admin, optionalProtect } = require('../middleware/auth');

const { reviewLimiter } = require('../middleware/rateLimiter');

// Public: Get only approved reviews
router.get('/', reviewController.getApprovedReviews);

// Review submission with spam rate limiter and real product validation
router.post('/', reviewLimiter, optionalProtect, reviewController.submitReview);

// Admin moderation
router.get('/admin', protect, admin, reviewController.getAllReviews);
router.patch('/:id/approve', protect, admin, reviewController.approveReview);
router.put('/:id/approve', protect, admin, reviewController.approveReview);
router.delete('/:id', protect, admin, reviewController.deleteReview);

module.exports = router;
