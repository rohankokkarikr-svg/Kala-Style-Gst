const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const {
  analyzeProduct,
  generateDescription,
  generateFullCatalog,
  detectCategory,
  translateProduct,
  suggestPrice,
  generateArtisanStory,
  getAIInsights,
  smartSearch,
  getHealth,
} = require('../controllers/aiController');

// Health check endpoint (public)
router.get('/health', getHealth);

// Public smart search (rate-limited)
router.post('/smart-search', aiLimiter, smartSearch);

// Artisan & Platform AI Generation endpoints (Protected + Rate-limited)
router.post('/analyze-product', protect, aiLimiter, analyzeProduct);
router.post('/generate-description', protect, aiLimiter, generateDescription);
router.post('/full-catalog', protect, aiLimiter, generateFullCatalog);
router.post('/detect-category', protect, aiLimiter, detectCategory);
router.post('/translate', protect, aiLimiter, translateProduct);
router.post('/suggest-price', protect, aiLimiter, suggestPrice);
router.post('/artisan-story', protect, aiLimiter, generateArtisanStory);
router.post('/insights', protect, aiLimiter, getAIInsights);

module.exports = router;
