/**
 * backend/middleware/rateLimiter.js
 * ─────────────────────────────────────────────────────────────────
 * Configurable rate limiters using express-rate-limit.
 * All limits are environment-variable controlled for easy tuning.
 * Agent chat has a dedicated limiter to control AI API costs.
 * Set DISABLE_RATE_LIMITS=true in .env to bypass all limits in development.
 */

const rateLimit = require('express-rate-limit');

// Helper: parse env int with fallback
const envInt = (key, fallback) => {
  const val = parseInt(process.env[key], 10);
  return isNaN(val) ? fallback : val;
};

const pass = (req, res, next) => next();

// Auth: prevent brute force login attempts
const authLimiter = process.env.DISABLE_RATE_LIMITS === 'true' ? pass : rateLimit({
  windowMs: envInt('AUTH_RATE_WINDOW_MS', 15 * 60 * 1000),
  max: envInt('AUTH_RATE_MAX', 20),
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// AI agent chat: per-IP limiter to control AI API costs
// Using default IP key (no custom keyGenerator) to avoid IPv6 validation issues
const agentChatLimiter = process.env.DISABLE_RATE_LIMITS === 'true' ? pass : rateLimit({
  windowMs: envInt('AGENT_RATE_WINDOW_MS', 60 * 1000),
  max: envInt('AGENT_RATE_MAX_CHAT', 10),
  message: { error: 'AI agent rate limit reached. Please wait a moment before sending another message.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General admin AI endpoints
const adminAiLimiter = process.env.DISABLE_RATE_LIMITS === 'true' ? pass : rateLimit({
  windowMs: envInt('ADMIN_AI_RATE_WINDOW_MS', 60 * 1000),
  max: envInt('ADMIN_AI_RATE_MAX', 60),
  message: { error: 'Too many AI management requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Orders
const orderLimiter = process.env.DISABLE_RATE_LIMITS === 'true' ? pass : rateLimit({
  windowMs: 60 * 1000,
  max: envInt('ORDER_RATE_MAX', 30),
  message: { error: 'Too many order requests. Please try again in a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// File upload
const uploadLimiter = process.env.DISABLE_RATE_LIMITS === 'true' ? pass : rateLimit({
  windowMs: 60 * 1000,
  max: envInt('UPLOAD_RATE_MAX', 20),
  message: { error: 'Upload rate limit reached. Please wait.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Spin wheel (once per day per IP)
const spinLimiter = process.env.DISABLE_RATE_LIMITS === 'true' ? pass : rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: envInt('SPIN_RATE_MAX', 1),
  message: { error: 'You have already spun today. Come back tomorrow!' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General catch-all
const generalLimiter = process.env.DISABLE_RATE_LIMITS === 'true' ? pass : rateLimit({
  windowMs: 60 * 1000,
  max: envInt('GENERAL_RATE_MAX', 200),
  message: { error: 'Too many requests. Please try again in a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Keep aiLimiter as alias for backward compatibility with existing routes
const aiLimiter = agentChatLimiter;

module.exports = {
  authLimiter,
  aiLimiter,
  agentChatLimiter,
  adminAiLimiter,
  orderLimiter,
  uploadLimiter,
  spinLimiter,
  generalLimiter,
};
