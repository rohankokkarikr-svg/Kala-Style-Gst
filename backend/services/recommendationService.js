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

module.exports = {
  getSeasonalContext,
  generateSeasonalRecommendations,
  getProductRecommendationsByCategory,
  analyzeSeasonalInventory,
};
