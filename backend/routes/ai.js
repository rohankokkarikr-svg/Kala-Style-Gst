const express = require('express');
const router = express.Router();
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
  generateProductImages,
} = require('../controllers/aiController');

const { protect, artisanOrAdmin } = require('../middleware/auth');
const { aiPublicLimiter, agentChatLimiter } = require('../middleware/rateLimiter');

// Public customer-facing AI endpoints with strict IP rate limits and quotas
router.get('/health', aiPublicLimiter, getHealth);
router.post('/translate', aiPublicLimiter, translateProduct);
router.post('/smart-search', aiPublicLimiter, smartSearch);

// Protected generative studio AI endpoints (Artisans & Admins with rate limits)
router.post('/analyze-product', protect, artisanOrAdmin, agentChatLimiter, analyzeProduct);
router.post('/generate-description', protect, artisanOrAdmin, agentChatLimiter, generateDescription);
router.post('/full-catalog', protect, artisanOrAdmin, agentChatLimiter, generateFullCatalog);
router.post('/detect-category', protect, artisanOrAdmin, agentChatLimiter, detectCategory);
router.post('/suggest-price', protect, artisanOrAdmin, agentChatLimiter, suggestPrice);
router.post('/artisan-story', protect, artisanOrAdmin, agentChatLimiter, generateArtisanStory);
router.post('/insights', protect, artisanOrAdmin, agentChatLimiter, getAIInsights);
router.post('/generate-product-images', protect, artisanOrAdmin, agentChatLimiter, generateProductImages);

module.exports = router;

