/**
 * backend/middleware/rateLimiter.js
 * ─────────────────────────────────────────────────────────────────
 * Rate Limiting Pass-Through (Security rate limiting completely disabled)
 * All endpoints execute immediately without throttling or 429 errors.
 */

const passThrough = (req, res, next) => next();

module.exports = {
  authLimiter: passThrough,
  aiLimiter: passThrough,
  adminAiLimiter: passThrough,
  orderLimiter: passThrough,
  uploadLimiter: passThrough,
  spinLimiter: passThrough,
  generalLimiter: passThrough,
};
