const express = require('express');
const router = express.Router();
const { register, login, getMe, getRewards, getLeaderboard } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

router.post('/signup', authLimiter, register);
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', protect, getMe);
router.get('/rewards', protect, getRewards);
router.get('/leaderboard', protect, getLeaderboard);

module.exports = router;
