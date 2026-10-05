/**
 * backend/services/recommendationService.js
 * ─────────────────────────────────────────────────────────────────
 * KalaStyle AI Recommendation & Seasonal Intelligence Engine.
 * Uses configurable seasonal context (Indian festivals/seasons)
 * and real database product data to generate recommendations.
 * NEVER fabricates product data — always sources from DB.
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const { getClient, getModel, isConfigured } = require('../ai/geminiClient');

/**
 * Determine the current Indian seasonal/festival context based on date.
 * Uses configurable date ranges rather than hardcoded assumptions.
 *
 * @returns {object} Seasonal context { season, festivals, promotions, period }
 */
function getSeasonalContext(date = new Date()) {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  // Configurable Indian festival/seasonal calendar
  const contexts = [
    {
      months: [1], period: 'January',
      season: 'Winter',
      festivals: ['Makar Sankranti', 'Lohri', 'Republic Day'],
      promotions: ['Winter Collection', 'New Year Gifting', 'Kite Festival Crafts'],
      categories: ['Handloom & Textiles', 'Handmade Jewelry & Accessories'],
    },
    {
      months: [2], period: 'February',
      season: 'Spring Onset',
      festivals: ['Vasant Panchami', 'Valentine\'s Day', 'Maha Shivratri'],
      promotions: ['Valentine\'s Gifting', 'Spring Crafts', 'Handmade Love'],
      categories: ['Handmade Jewelry & Accessories', 'Traditional Paintings & Wall Art'],
    },
    {
      months: [3, 4], period: 'March–April',
      season: 'Spring / Ugadi',
      festivals: ['Holi', 'Ugadi', 'Ram Navami', 'Gudi Padwa'],
      promotions: ['Festival Colors', 'Spring Home Décor', 'Holi Craft Gifting'],
      categories: ['Home Décor & Furnishings', 'Pottery & Terracotta', 'Eco-Friendly & Natural Products'],
    },
    {
      months: [5, 6], period: 'May–June',
      season: 'Pre-Monsoon / Summer',
      festivals: ['Mother\'s Day', 'Father\'s Day', 'Eid'],
      promotions: ['Summer Craft Sale', 'Gifting Season', 'Cool Décor'],
      categories: ['Eco-Friendly & Natural Products', 'Wooden Handicrafts'],
    },
    {
      months: [7, 8], period: 'July–August',
      season: 'Monsoon',
      festivals: ['Raksha Bandhan', 'Independence Day', 'Janmashtami'],
      promotions: ['Rakhi Gifting', 'Independence Crafts', 'Monsoon Essentials'],
      categories: ['Handmade Jewelry & Accessories', 'Handloom & Textiles'],
    },
    {
      months: [9, 10], period: 'September–October',
      season: 'Festive Season',
      festivals: ['Navratri', 'Durga Puja', 'Dussehra', 'Diwali'],
      promotions: ['Diwali Collection', 'Festive Gifting', 'Home Decoration', 'Pooja Essentials'],
      categories: ['Home Décor & Furnishings', 'Pottery & Terracotta', 'Traditional Paintings & Wall Art', 'Handmade Jewelry & Accessories'],
    },
    {
      months: [11], period: 'November',
      season: 'Post-Diwali / Winter Prep',
      festivals: ['Chhath Puja', 'Guru Nanak Jayanti'],
      promotions: ['Winter Warmth Collection', 'Year-End Gifting', 'Wedding Season'],
      categories: ['Handloom & Textiles', 'Wooden Handicrafts'],
    },
    {
      months: [12], period: 'December',
      season: 'Winter / Year-End',
      festivals: ['Christmas', 'New Year\'s Eve', 'Makar Sankranti Prep'],
      promotions: ['Christmas Gifting', 'Year-End Crafts', 'New Year Décor'],
      categories: ['Home Décor & Furnishings', 'Traditional Paintings & Wall Art', 'Eco-Friendly & Natural Products'],
    },
  ];

  const ctx = contexts.find(c => c.months.includes(month)) || contexts[0];
  return {
    ...ctx,
    currentMonth: month,
    currentDay: day,
    currentYear: date.getFullYear(),
    currentDate: date.toISOString().split('T')[0],
  };
}

/**
 * Fetch and recommend products relevant to the current season/festival.
 *
 * @param {object} options
 * @param {number} options.limit - Max products to recommend
 * @param {Date} options.date - Date for seasonal context (default: now)
 * @returns {Promise<object>} Recommendations with seasonal context
 */
async function generateSeasonalRecommendations({ limit = 12, date = new Date() } = {}) {
  const context = getSeasonalContext(date);

  // Fetch real in-stock products for the relevant categories
  let products = [];
  try {
    const queries = context.categories.slice(0, 3).map(cat =>
      safeQuery(() =>
        supabase
          .from('products')
          .select('id, name, price, category, description, image_url, stock_quantity, is_in_stock, tags, artisan_id')
          .eq('is_in_stock', true)
          .eq('status', 'approved')
          .ilike('category', `%${cat.split(' ')[0]}%`)
          .gt('stock_quantity', 0)
          .limit(Math.ceil(limit / context.categories.length))
      )
    );

    const results = await Promise.allSettled(queries);
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value.data) {
        products = [...products, ...r.value.data];
      }
    });

    // Deduplicate by ID
    const seen = new Set();
    products = products.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    }).slice(0, limit);
  } catch (err) {
    console.error('[Recommendation Service] DB fetch error:', err.message);
  }

  // If AI is configured, generate an enhanced recommendation narrative
  let aiNarrative = null;
  if (isConfigured() && products.length > 0) {
    try {
      const productList = products.slice(0, 6).map(p =>
        `${p.name} (₹${p.price}) — ${p.category}`
      ).join('\n');

      const ai = getClient();
      const response = await ai.models.generateContent({
        model: getModel(),
        contents: `For the ${context.season} season with upcoming festivals: ${context.festivals.join(', ')}, 
briefly explain (3-4 sentences) why these KalaStyle AI handmade craft products are perfect to promote right now:
${productList}

Be specific, culturally relevant, and authentic. Do not fabricate product features.`,
        config: { temperature: 0.5 },
      });
      aiNarrative = response.text || null;
    } catch (e) {}
  }

  return {
    success: true,
    seasonalContext: context,
    recommendations: products,
    totalFound: products.length,
    aiNarrative,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate product recommendations based on a specific category or tag.
 *
 * @param {object} options
 * @param {string} options.category - Product category to recommend
 * @param {number} options.limit - Max results
 * @returns {Promise<object>} Recommendations
 */
async function getProductRecommendationsByCategory({ category, limit = 10 } = {}) {
  try {
    let query = supabase
      .from('products')
      .select('id, name, price, category, description, image_url, stock_quantity, is_in_stock, tags')
      .eq('is_in_stock', true)
      .eq('status', 'approved')
      .gt('stock_quantity', 0)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.ilike('category', `%${category}%`);
    }

    const { data, error } = await safeQuery(() => query);
    return {
      success: true,
      category: category || 'all',
      recommendations: data || [],
      count: (data || []).length,
    };
  } catch (err) {
    return { success: false, error: err.message, recommendations: [] };
  }
}

/**
 * Analyze current inventory vs seasonal demand.
 * Identifies what to restock or promote based on the season.
 */
async function analyzeSeasonalInventory() {
  const context = getSeasonalContext();

  const [productsRes, lowStockRes] = await Promise.allSettled([
    safeQuery(() =>
      supabase
        .from('products')
        .select('id, name, category, stock_quantity, is_in_stock, price, status')
        .eq('status', 'approved')
        .limit(200)
    ),
    safeQuery(() =>
      supabase
        .from('products')
        .select('id, name, category, stock_quantity')
        .eq('status', 'approved')
        .lte('stock_quantity', 5)
        .limit(50)
    ),
  ]);

  const allProducts = productsRes.status === 'fulfilled' ? (productsRes.value.data || []) : [];
  const lowStockProducts = lowStockRes.status === 'fulfilled' ? (lowStockRes.value.data || []) : [];

  // Products relevant to current season but low on stock
  const seasonalLowStock = lowStockProducts.filter(p =>
    context.categories.some(cat =>
      p.category && p.category.toLowerCase().includes(cat.split(' ')[0].toLowerCase())
    )
  );

  // Products relevant to season with good stock
  const seasonalWellStocked = allProducts.filter(p =>
    p.stock_quantity > 5 &&
    context.categories.some(cat =>
      p.category && p.category.toLowerCase().includes(cat.split(' ')[0].toLowerCase())
    )
  );

  return {
    success: true,
    seasonalContext: context,
    analysis: {
      totalProducts: allProducts.length,
      lowStockCount: lowStockProducts.length,
      seasonalLowStock: seasonalLowStock.slice(0, 10),
      seasonalReadyToPromote: seasonalWellStocked.slice(0, 10),
      restockRecommendations: seasonalLowStock.map(p => ({
        productId: p.id,
        name: p.name,
        category: p.category,
        currentStock: p.stock_quantity,
        urgency: p.stock_quantity === 0 ? 'CRITICAL' : 'HIGH',
        reason: `Low inventory for ${context.season} season (${context.festivals.join(', ')})`,
      })),
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate personalized product recommendations using real catalog data
 * and multi-signal shopper behavior (views, searches, cart, wishlist, preferences).
 *
 * @param {object} options
 * @param {Array} options.signals - Shopper activity events
 * @param {Array} options.preferences - Explicit category preferences
 * @param {Array} options.excludeIds - Product IDs to exclude (in-cart, dismissed, or current)
 * @param {number} options.limit - Max products to return
 * @param {string} options.targetCategory - Optional specific category filter
 * @returns {Promise<object>}
 */
async function getPersonalizedRecommendations({
  signals = [],
  preferences = [],
  excludeIds = [],
  limit = 8,
  targetCategory = null,
} = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 24));
  const excludeSet = new Set((Array.isArray(excludeIds) ? excludeIds : []).filter(Boolean));

  // 1. Sanitize & normalize signals
  const validSignalTypes = new Set(['SEARCH', 'VIEW', 'CART', 'WISHLIST', 'PREFERENCE', 'DISMISS']);
  const sanitizedSignals = (Array.isArray(signals) ? signals : [])
    .filter(s => s && typeof s === 'object' && validSignalTypes.has(s.type))
    .slice(0, 50);

  // Separate dismissals
  sanitizedSignals.forEach(s => {
    if (s.type === 'DISMISS' && s.productId) {
      excludeSet.add(s.productId);
    }
  });

  // 2. Fetch real in-stock approved products from Supabase
  let catalog = [];
  try {
    let query = supabase
      .from('products')
      .select('id, name, price, category, description, image_url, stock_quantity, is_in_stock, tags, artisan_id')
      .eq('is_in_stock', true)
      .eq('status', 'approved')
      .gt('stock_quantity', 0)
      .limit(100);

    if (targetCategory && typeof targetCategory === 'string') {
      query = query.ilike('category', `%${targetCategory.trim()}%`);
    }

    const { data, error } = await safeQuery(() => query);
    if (!error && Array.isArray(data)) {
      catalog = data;
    }
  } catch (err) {
    console.error('[Recommendation Service] Catalog fetch error:', err.message);
  }

  // Filter out exclusions & out-of-stock items immediately
  const availableCandidates = catalog.filter(p => p && p.id && !excludeSet.has(p.id) && p.is_in_stock && p.stock_quantity > 0);

  if (availableCandidates.length === 0) {
    return {
      success: true,
      recommendations: [],
      totalFound: 0,
      coldStart: true,
      generatedAt: new Date().toISOString(),
    };
  }

  // 3. Signal Weights & Recency Decay
  const SIGNAL_WEIGHTS = {
    CART: 8.0,
    WISHLIST: 6.0,
    PREFERENCE: 7.0,
    SEARCH: 5.0,
    VIEW: 3.0,
  };

  const now = Date.now();
  const categoryScores = {};
  const searchTerms = [];
  const interactedProductIds = new Map(); // id -> highest signal weight

  sanitizedSignals.forEach(signal => {
    if (signal.type === 'DISMISS') return;

    // Recency decay: lambda = 0.015 (half-life approx 46 hours)
    const timestamp = signal.timestamp ? new Date(signal.timestamp).getTime() : now;
    const hoursElapsed = Math.max(0, (now - timestamp) / (1000 * 60 * 60));
    const decay = Math.exp(-0.015 * Math.min(hoursElapsed, 720)); // cap at 30 days
    const weight = (SIGNAL_WEIGHTS[signal.type] || 2.0) * decay;

    if (signal.category && typeof signal.category === 'string') {
      const catKey = signal.category.toLowerCase().trim();
      categoryScores[catKey] = (categoryScores[catKey] || 0) + weight;
    }

    if (signal.term && typeof signal.term === 'string') {
      const cleanTerm = signal.term.trim().toLowerCase();
      if (cleanTerm.length >= 2) {
        searchTerms.push({ term: cleanTerm, weight });
      }
    }

    if (signal.productId) {
      const prev = interactedProductIds.get(signal.productId) || 0;
      if (weight > prev) {
        interactedProductIds.set(signal.productId, weight);
      }
    }
  });

  // Explicit category preferences boost
  const prefSet = new Set((Array.isArray(preferences) ? preferences : []).map(p => String(p).toLowerCase().trim()));
  prefSet.forEach(pref => {
    categoryScores[pref] = (categoryScores[pref] || 0) + 7.0;
  });

  const isColdStart = sanitizedSignals.filter(s => s.type !== 'DISMISS').length === 0 && prefSet.size === 0;

  // 4. Score each candidate product
  const scoredProducts = availableCandidates.map(product => {
    let score = 1.0; // Base score
    let reason = 'Trending Indian handicraft';
    let matchSource = 'trending';
    let maxFactorScore = 0;

    const prodCategoryLower = (product.category || '').toLowerCase().trim();
    const prodNameLower = (product.name || '').toLowerCase();
    const prodDescLower = (product.description || '').toLowerCase();

    // A. Explicit preference bonus
    if (prodCategoryLower && prefSet.has(prodCategoryLower)) {
      const prefScore = 9.0;
      score += prefScore;
      if (prefScore > maxFactorScore) {
        maxFactorScore = prefScore;
        reason = `Matches your preferred craft: ${product.category}`;
        matchSource = 'preference';
      }
    }

    // B. Category Affinity Score
    for (const [cat, catScore] of Object.entries(categoryScores)) {
      if (prodCategoryLower.includes(cat) || cat.includes(prodCategoryLower)) {
        score += catScore * 1.8;
        if (catScore * 1.8 > maxFactorScore) {
          maxFactorScore = catScore * 1.8;
          // Find which signal triggered this
          const relevantSignal = sanitizedSignals.find(s => s.category && s.category.toLowerCase().includes(cat));
          if (relevantSignal?.type === 'CART') {
            reason = `Complements items in your cart`;
            matchSource = 'cart';
          } else if (relevantSignal?.type === 'WISHLIST') {
            reason = `Similar to items in your wishlist`;
            matchSource = 'wishlist';
          } else {
            reason = `Based on your interest in ${product.category}`;
            matchSource = 'view';
          }
        }
      }
    }

    // C. Search Query Token Matching
    searchTerms.forEach(({ term, weight }) => {
      const words = term.split(/\s+/).filter(w => w.length >= 3);
      let matchCount = 0;
      words.forEach(word => {
        if (prodNameLower.includes(word)) matchCount += 2.0;
        else if (prodCategoryLower.includes(word)) matchCount += 1.5;
        else if (prodDescLower.includes(word)) matchCount += 0.8;
      });

      if (matchCount > 0) {
        const searchScore = matchCount * weight * 2.5;
        score += searchScore;
        if (searchScore > maxFactorScore) {
          maxFactorScore = searchScore;
          reason = `Based on your search for "${term}"`;
          matchSource = 'search';
        }
      }
    });

    // D. Soft seasonal boost for cold-start or low activity
    const seasonalCtx = getSeasonalContext();
    if (seasonalCtx.categories.some(cat => prodCategoryLower.includes(cat.toLowerCase().split(' ')[0]))) {
      score += 1.2;
      if (isColdStart && 1.2 > maxFactorScore) {
        reason = `Handcrafted pick for ${seasonalCtx.season}`;
        matchSource = 'seasonal';
      }
    }

    return {
      product,
      score,
      recommendationReason: reason,
      matchSource,
    };
  });

  // 5. Diversity Enforcement: Sort by score and cap per category
  scoredProducts.sort((a, b) => b.score - a.score);

  const maxPerCategory = Math.max(2, Math.ceil(safeLimit / 3));
  const categoryCounts = {};
  const selected = [];
  const overflow = [];

  for (const item of scoredProducts) {
    const cat = item.product.category || 'General';
    const currentCount = categoryCounts[cat] || 0;
    if (currentCount < maxPerCategory) {
      categoryCounts[cat] = currentCount + 1;
      selected.push({
        ...item.product,
        recommendationReason: item.recommendationReason,
        matchSource: item.matchSource,
      });
      if (selected.length >= safeLimit) break;
    } else {
      overflow.push({
        ...item.product,
        recommendationReason: item.recommendationReason,
        matchSource: item.matchSource,
      });
    }
  }

  // If diversity filter resulted in fewer than requested limit, backfill with remaining highest scoring items
  while (selected.length < safeLimit && overflow.length > 0) {
    selected.push(overflow.shift());
  }

  return {
    success: true,
    recommendations: selected,
    totalFound: selected.length,
    coldStart: isColdStart,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  getSeasonalContext,
  generateSeasonalRecommendations,
  getProductRecommendationsByCategory,
  analyzeSeasonalInventory,
  getPersonalizedRecommendations,
};
