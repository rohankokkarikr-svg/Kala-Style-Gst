/**
 * backend/middleware/rateLimiter.js
 * ─────────────────────────────────────────────────────────────────
 * Defense-in-depth API rate limiters using express-rate-limit.
 * Protects against brute-force attacks, credential stuffing,
 * denial-of-service, automated scraping, and Gemini quota exhaustion.
 */

const { rateLimit } = require('express-rate-limit');

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Custom handler returning uniform JSON security errors
 */
const rateLimitHandler = (message) => (req, res, next, options) => {
  res.status(429).json({
    error: 'Too Many Requests',
    message: message || 'You have exceeded the request rate limit. Please try again later.',
    retryAfterSeconds: Math.ceil(options.windowMs / 1000),
  });
};

/**
 * 1. Authentication Limiter (Login & Registration)
 * 100 failed attempts per 15 minutes per IP (1000 in dev).
 * Successful logins are NOT counted (skipSuccessfulRequests: true).
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 1000 : 100,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many failed login attempts. Please wait a few minutes before trying again.'),
});

/**
 * 2. Public & Artisan AI API Limiter
 * 30 requests per minute per IP
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isDev ? 120 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('AI generation rate limit exceeded. Please wait a minute before making more AI requests.'),
});

/**
 * 3. Admin AI Manager Limiter
 * 60 requests per minute per IP
 */
const adminAiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isDev ? 300 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Admin AI operations limit reached. Please slow down.'),
});

/**
 * 4. Checkout & Order Creation Limiter
 * 30 order requests per minute per IP
 */
const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isDev ? 200 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many order requests. Please wait a moment before trying again.'),
});

/**
 * 5. File Upload Limiter
 * 25 uploads per minute per IP
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isDev ? 200 : 25,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Upload rate limit reached. Please wait a moment before uploading more images.'),
});

/**
 * 6. Spin Wheel & Rewards Limiter
 * 10 spin requests per minute per IP
 */
const spinLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isDev ? 60 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Reward spin rate limit reached. Please wait a moment.'),
});

/**
 * 7. General API Safeguard Limiter
 * 800 requests per minute per IP
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isDev ? 5000 : 800,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDev || req.path === '/health', // Health checks not throttled
  handler: rateLimitHandler('General API rate limit exceeded. Please reduce request frequency.'),
});

module.exports = {
  authLimiter,
  aiLimiter,
  adminAiLimiter,
  orderLimiter,
  uploadLimiter,
  spinLimiter,
  generalLimiter,
};
