const express = require('express');
const router = express.Router();
const { register, login, getMe, getRewards, getLeaderboard, syncSupabaseSession, syncOtpSession, sendOtp, verifyOtp, forgotPassword, resetPassword } = require('../controllers/authController');
const { protect, optionalProtect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

router.post('/signup', authLimiter, register);
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/send-otp', authLimiter, sendOtp);
router.post('/verify-otp', authLimiter, verifyOtp);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);
router.post('/supabase-session', authLimiter, syncSupabaseSession);
router.post('/session', authLimiter, syncSupabaseSession);
router.post('/otp-session', authLimiter, syncOtpSession);
router.get('/me', protect, getMe);
router.get('/rewards', protect, getRewards);
router.get('/leaderboard', optionalProtect, getLeaderboard);

module.exports = router;

