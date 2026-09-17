const express = require('express');
const router = express.Router();
const { register, login, getMe, getRewards, getLeaderboard, syncOtpSession } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
router.post('/signup', register);
router.post('/register', register);
router.post('/login', login);
router.post('/otp-session', syncOtpSession);
router.get('/me', protect, getMe);
router.get('/rewards', protect, getRewards);
router.get('/leaderboard', protect, getLeaderboard);

module.exports = router;

