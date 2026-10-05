/**
 * backend/routes/recommendations.js
 * ─────────────────────────────────────────────────────────────────
 * Transparent, real-data product recommendation endpoints.
 * Sources from actual database catalog; enforces privacy and strict input validation.
 */

const express = require('express');
const router = express.Router();
const recommendationService = require('../services/recommendationService');

// POST /api/recommendations/personalized
// Computes multi-signal personalized recommendations based on shopper activity
router.post('/personalized', async (req, res) => {
  try {
    const { signals = [], preferences = [], excludeIds = [], limit = 8, targetCategory } = req.body || {};

    // Validate and sanitize signals (max 50, enforce object structure)
    const validSignalTypes = ['SEARCH', 'VIEW', 'CART', 'WISHLIST', 'PREFERENCE', 'DISMISS'];
    const sanitizedSignals = (Array.isArray(signals) ? signals : [])
      .filter(s => s && typeof s === 'object' && validSignalTypes.includes(s.type))
      .slice(0, 50)
      .map(s => ({
        type: String(s.type),
        productId: s.productId ? String(s.productId).slice(0, 64) : undefined,
        category: s.category ? String(s.category).slice(0, 100) : undefined,
        term: s.term ? String(s.term).slice(0, 100) : undefined,
        timestamp: s.timestamp ? new Date(s.timestamp).toISOString() : new Date().toISOString(),
      }));

    // Validate preferences (max 10 category strings)
    const sanitizedPreferences = (Array.isArray(preferences) ? preferences : [])
      .filter(p => typeof p === 'string' && p.trim().length > 0)
      .slice(0, 10)
      .map(p => p.trim().slice(0, 100));

    // Validate excludeIds (max 100)
    const sanitizedExcludeIds = (Array.isArray(excludeIds) ? excludeIds : [])
      .filter(id => typeof id === 'string' && id.trim().length > 0)
      .slice(0, 100)
      .map(id => id.trim());

    const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 8, 24));

    const result = await recommendationService.getPersonalizedRecommendations({
      signals: sanitizedSignals,
      preferences: sanitizedPreferences,
      excludeIds: sanitizedExcludeIds,
      limit: safeLimit,
      targetCategory: typeof targetCategory === 'string' ? targetCategory.slice(0, 100) : null,
    });

    return res.json(result);
  } catch (err) {
    console.error('Error generating personalized recommendations:', err);
    return res.status(500).json({
      success: false,
      error: 'Unable to compute recommendations',
      recommendations: [],
    });
  }
});

// GET /api/recommendations/seasonal
// Handcrafted seasonal and festival craft recommendations
router.get('/seasonal', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 12, 24));
    const result = await recommendationService.generateSeasonalRecommendations({ limit });
    return res.json(result);
  } catch (err) {
    console.error('Error generating seasonal recommendations:', err);
    return res.status(500).json({
      success: false,
      error: 'Unable to load seasonal recommendations',
      recommendations: [],
    });
  }
});

// GET /api/recommendations/by-category
// Recommendations filtered by category
router.get('/by-category', async (req, res) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category.slice(0, 100) : null;
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 8, 24));
    const result = await recommendationService.getProductRecommendationsByCategory({ category, limit });
    return res.json(result);
  } catch (err) {
    console.error('Error fetching recommendations by category:', err);
    return res.status(500).json({
      success: false,
      error: 'Unable to load category recommendations',
      recommendations: [],
    });
  }
});

module.exports = router;
