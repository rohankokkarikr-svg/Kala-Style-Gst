const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { protect, admin, optionalProtect } = require('../middleware/auth');

// Public
router.get('/', reviewController.getApprovedReviews);

// Review submission (Strictly requires authenticated customer)
router.post('/', protect, reviewController.submitReview);

// Admin
router.get('/admin', protect, admin, reviewController.getAllReviews);
router.patch('/:id/approve', protect, admin, reviewController.approveReview);
router.delete('/:id', protect, admin, reviewController.deleteReview);

module.exports = router;
