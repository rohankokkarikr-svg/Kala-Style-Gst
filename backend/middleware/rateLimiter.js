/**
 * backend/middleware/rateLimiter.js
 * ─────────────────────────────────────────────────────────────────
 * Defense-in-depth API rate limiters using express-rate-limit.
 * Protects against brute-force attacks, credential stuffing,
 * denial-of-service, automated scraping, and Gemini quota exhaustion.
 */

const { rateLimit } = require('express-rate-limit');

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
 * 10 requests per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many authentication attempts from this IP. Please wait 15 minutes before trying again.'),
});

/**
 * 2. Public & Artisan AI API Limiter
 * 15 requests per minute per IP
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('AI generation rate limit exceeded. Please wait a minute before making more AI requests.'),
});

/**
 * 3. Admin AI Manager Limiter
 * 30 requests per minute per IP
 */
const adminAiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Admin AI operations limit reached. Please slow down.'),
});

/**
 * 4. Checkout & Order Creation Limiter
 * 10 order requests per minute per IP
 */
const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many order requests. Please wait a moment before trying again.'),
});

/**
 * 5. File Upload Limiter
 * 8 uploads per minute per IP
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Upload rate limit reached. Please wait a moment before uploading more images.'),
});

/**
 * 6. Spin Wheel & Rewards Limiter
 * 3 spin requests per minute per IP
 */
const spinLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Reward spin rate limit reached. Please wait a moment.'),
});

/**
 * 7. General API Safeguard Limiter
 * 200 requests per minute per IP
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health', // Health checks not throttled
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
