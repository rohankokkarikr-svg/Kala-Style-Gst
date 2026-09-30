/**
 * backend/controllers/aiController.js
 * ─────────────────────────────────────
 * All Gemini AI logic for the KalaStyle AI platform.
 * Uses the centralized geminiService — never initializes
 * the Gemini client directly.
 *
 * Exported handlers:
 *  1. analyzeProduct       — image + description → catalog fields
 *  2. generateDescription  — simple text → professional description
 *  3. generateFullCatalog  — structured JSON product catalog
 *  4. detectCategory       — 7-category auto-detection with confidence
 *  5. translateProduct     — EN/HI/KN/MR multilingual catalog
 *  6. suggestPrice         — deterministic calc + AI range explanation
 *  7. generateArtisanStory — biography from artisan-provided info
 *  8. getAIInsights        — real Supabase stats → AI trend insights
 *  9. smartSearch          — semantic query expansion for product search
 */

const gemini = require('../services/geminiService');
const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');

const { SEVEN_CATEGORIES } = gemini;

/**
 * Persists an inference event into the database `ai_usage_logs` table
 */
async function logAIUsage({ userId, feature, model, status = 'success', promptLength = 0, responseLength = 0, metadata = {} }) {
  try {
    const entry = {
      user_id: userId || null,
      feature: feature || 'general',
      model: model || process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      status: status || 'success',
      prompt_length: Number(promptLength) || 0,
      response_length: Number(responseLength) || 0,
      metadata: typeof metadata === 'object' ? metadata : {},
      created_at: new Date().toISOString()
    };
    await safeQuery(() => supabase.from('ai_usage_logs').insert([entry]));
  } catch (err) {
    console.warn('[logAIUsage] DB insert notice:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SMART FALLBACKS — Used when AI call fails or key is not configured
// ════════════════════════════════════════════════════════════════════════════

function buildMockCatalog(description = '') {
  const lower = description.toLowerCase();
  let category = 'Handmade Jewelry & Accessories';
  let material = 'Mixed Materials';
  let subcategory = 'Artisan Collection';
  let technique = 'Handcrafted';

  if (lower.includes('saree') || lower.includes('silk') || lower.includes('weav') || lower.includes('fabric') || lower.includes('textile') || lower.includes('loom')) {
    category = 'Handloom & Textiles'; material = 'Handloom Fabric'; subcategory = 'Handwoven Textiles'; technique = 'Handwoven';
  } else if (lower.includes('bamboo') || lower.includes('jute') || lower.includes('cane') || lower.includes('eco') || lower.includes('natural')) {
    category = 'Eco-Friendly & Natural Products'; material = 'Bamboo/Jute'; subcategory = 'Natural Fiber Products'; technique = 'Handcrafted';
  } else if (lower.includes('wood') || lower.includes('carv') || lower.includes('toy') || lower.includes('wooden')) {
    category = 'Wooden Handicrafts'; material = 'Natural Wood'; subcategory = 'Wooden Home Décor'; technique = 'Hand-carved';
  } else if (lower.includes('clay') || lower.includes('pot') || lower.includes('terracotta') || lower.includes('ceramic')) {
    category = 'Pottery & Terracotta'; material = 'Terracotta/Clay'; subcategory = 'Decorative Pottery'; technique = 'Pottery';
  } else if (lower.includes('paint') || lower.includes('art') || lower.includes('madhubani') || lower.includes('warli') || lower.includes('gond')) {
    category = 'Traditional Paintings & Wall Art'; material = 'Natural Colors on Canvas'; subcategory = 'Folk Art'; technique = 'Hand-painted';
  } else if (lower.includes('decor') || lower.includes('lamp') || lower.includes('cushion') || lower.includes('furnish') || lower.includes('home')) {
    category = 'Home Décor & Furnishings'; material = 'Mixed Handcrafted Materials'; subcategory = 'Decorative Items'; technique = 'Handcrafted';
  }

  const words = description.trim().split(' ').slice(0, 5).join(' ');
  const productName = words ? (words.charAt(0).toUpperCase() + words.slice(1)) : 'Authentic Indian Handicraft';

  return {
    productName,
    shortDescription: `A beautifully handcrafted ${category.toLowerCase()} made by skilled Indian artisans using traditional techniques.`,
    fullDescription: `This ${productName} is a genuine piece of Indian craftsmanship. ${description || 'Handcrafted with care using traditional methods passed down through generations.'}. Each piece is unique and reflects the rich cultural heritage of India's artisan communities. Made with high-quality ${material}, this product supports local artisans and their livelihoods.`,
    category,
    subcategory,
    materials: [material],
    craftTechnique: technique,
    suggestedTags: ['handmade', 'artisan', 'indian-handicraft', 'authentic', category.toLowerCase().split(' ')[0]],
    keyFeatures: ['100% handmade', 'Authentic Indian craft', `Made from ${material}`, 'Unique one-of-a-kind piece', 'Supports local artisans'],
    careInstructions: ['Handle with care', 'Keep away from direct sunlight', 'Store in a cool dry place', 'Clean gently with soft cloth'],
    suggestedPriceRange: { minimum: 499, maximum: 2999, currency: 'INR' },
    isAIGenerated: false,
    note: 'Smart fallback catalog — configure GEMINI_API_KEY in backend/.env for AI-generated content.',
  };
}

function validateCatalogFields(obj) {
  return {
    productName:        String(obj.productName        || obj.product_name        || 'Artisan Product'),
    shortDescription:   String(obj.shortDescription   || obj.short_description   || ''),
    fullDescription:    String(obj.fullDescription    || obj.full_description    || obj.description || ''),
    category:           String(obj.category           || 'Handmade Jewelry & Accessories'),
    subcategory:        String(obj.subcategory        || 'Artisan Collection'),
    materials:          Array.isArray(obj.materials)  ? obj.materials  : [String(obj.material || 'Handcrafted Materials')],
    craftTechnique:     String(obj.craftTechnique     || obj.craft_technique     || 'Handcrafted'),
    suggestedTags:      Array.isArray(obj.suggestedTags)     ? obj.suggestedTags     : (Array.isArray(obj.tags) ? obj.tags : ['handmade', 'artisan']),
    keyFeatures:        Array.isArray(obj.keyFeatures)       ? obj.keyFeatures       : ['Handmade', 'Authentic Indian Craft'],
    careInstructions:   Array.isArray(obj.careInstructions)  ? obj.careInstructions  : ['Handle with care'],
    suggestedPriceRange: (obj.suggestedPriceRange && typeof obj.suggestedPriceRange === 'object')
      ? { minimum: Number(obj.suggestedPriceRange.minimum || obj.suggestedPriceRange.min || 499), maximum: Number(obj.suggestedPriceRange.maximum || obj.suggestedPriceRange.max || 2999), currency: 'INR' }
      : { minimum: 499, maximum: 2999, currency: 'INR' },
    isAIGenerated: obj.isAI !== false,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. ANALYZE PRODUCT — Image + Description → Catalog Fields
// ════════════════════════════════════════════════════════════════════════════

exports.analyzeProduct = async (req, res) => {
  try {
    const { image_url, description } = req.body;

    if (!description && !image_url) {
      return res.status(400).json({ error: 'Please provide an image URL or product description.' });
    }

    const prompt = `You are an expert Indian handicrafts product listing assistant for KalaStyle AI — a marketplace connecting artisans with buyers.

Analyze this artisan product and return ONLY a valid JSON object with EXACTLY these fields (no markdown, no explanation):
{
  "productName": "concise marketable name",
  "shortDescription": "1-2 sentence attractive e-commerce description",
  "fullDescription": "3-4 sentence professional description mentioning craftsmanship, materials, cultural heritage, and usage",
  "category": "MUST be one of: ${SEVEN_CATEGORIES.join(' | ')}",
  "subcategory": "specific subcategory",
  "materials": ["material1", "material2"],
  "craftTechnique": "e.g. Handwoven, Hand-carved, Hand-painted, Pottery, Embroidered",
  "suggestedTags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "keyFeatures": ["feature1", "feature2", "feature3", "feature4"],
  "careInstructions": ["instruction1", "instruction2"],
  "suggestedPriceRange": { "minimum": 500, "maximum": 3000, "currency": "INR" }
}

Artisan description: "${description || 'No description provided'}"

Rules:
- category MUST exactly match one of the 7 provided options
- Respect Indian cultural heritage — avoid inventing facts
- Do not exaggerate claims or invent historical facts
- Return ONLY valid JSON`;

    let result;
    if (image_url) {
      const { data, isAI } = await gemini.generateStructuredJSON(
        prompt, // fallback prompt handled inside analyzeImage path
        buildMockCatalog(description)
      );
      // Try image analysis first
      try {
        const imageText = await gemini.analyzeImage(image_url, prompt);
        const cleaned = imageText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        const parsed = JSON.parse(cleaned);
        result = { data: parsed, isAI: true };
      } catch {
        result = { data, isAI };
      }
    } else {
      result = await gemini.generateStructuredJSON(prompt, buildMockCatalog(description));
    }

    const catalog = validateCatalogFields({ ...result.data, isAI: result.isAI });

    logAIUsage({
      userId: req.user?.id,
      feature: 'image_analysis',
      model: gemini.getModelName(),
      status: 'success',
      promptLength: (description || '').length + (image_url ? 100 : 0),
      responseLength: JSON.stringify(catalog).length,
      metadata: { category: catalog.category, isAI: catalog.isAIGenerated }
    });

    // Legacy field mapping for existing AIProductStudio compatibility
    return res.json({
      ...catalog,
      product_name: catalog.productName,
      description: catalog.fullDescription,
      category: catalog.category,
      material: catalog.materials[0] || '',
      tags: catalog.suggestedTags,
      suggested_price: catalog.suggestedPriceRange.minimum + Math.round((catalog.suggestedPriceRange.maximum - catalog.suggestedPriceRange.minimum) * 0.4),
      price_range: { min: catalog.suggestedPriceRange.minimum, max: catalog.suggestedPriceRange.maximum },
      ai_notes: catalog.isAIGenerated
        ? `Generated by Gemini ${gemini.getModelName()} — AI-generated estimate.`
        : 'Smart fallback — configure GEMINI_API_KEY for AI generation.',
    });
  } catch (err) {
    console.error('[analyzeProduct] Error:', err.message);
    return res.json({ ...buildMockCatalog(req.body?.description), product_name: buildMockCatalog(req.body?.description).productName });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 2. GENERATE DESCRIPTION — Simple text → Professional description
// ════════════════════════════════════════════════════════════════════════════

exports.generateDescription = async (req, res) => {
  try {
    const { simple_text, language = 'English' } = req.body;
    if (!simple_text) return res.status(400).json({ error: 'Please provide simple_text' });

    const prompt = `Convert this simple artisan product description into a professional, attractive e-commerce description in ${language}.
Simple description: "${simple_text}"
Write 3-4 sentences highlighting: craftsmanship, material quality, cultural heritage, and customer value.
Return ONLY the description text — no markdown, no labels, no explanation.`;

    try {
      const text = await gemini.generateText(prompt);
      logAIUsage({
        userId: req.user?.id,
        feature: 'description',
        model: gemini.getModelName(),
        status: 'success',
        promptLength: (simple_text || '').length,
        responseLength: (text || '').length,
        metadata: { language }
      });
      return res.json({ professional_description: text });
    } catch {
      const fallbackDesc = `A beautifully handcrafted piece made with love and skill by Indian artisans. ${simple_text}. Each item is unique, reflecting the rich tradition of Indian craftsmanship. This product supports local artisan communities and makes an excellent gift.`;
      logAIUsage({
        userId: req.user?.id,
        feature: 'description',
        model: gemini.getModelName(),
        status: 'success',
        promptLength: (simple_text || '').length,
        responseLength: fallbackDesc.length,
        metadata: { fallback: true, language }
      });
      return res.json({
        professional_description: fallbackDesc,
      });
    }
  } catch (err) {
    console.error('[generateDescription] Error:', err.message);
    res.status(500).json({ error: 'Could not generate description. Please try again.' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 3. GENERATE FULL CATALOG — Feature 1+7: Complete structured catalog
// ════════════════════════════════════════════════════════════════════════════

exports.generateFullCatalog = async (req, res) => {
  try {
    const { description, image_url, language = 'English' } = req.body;
    if (!description && !image_url) {
      return res.status(400).json({ error: 'Please provide a product description or image.' });
    }

    const prompt = `You are an Indian handicrafts product cataloging expert for KalaStyle AI.
Generate a complete professional product catalog in ${language} for this artisan product.

Product info: "${description || 'Handcrafted Indian artisan product'}"

Return ONLY valid JSON with exactly these fields:
{
  "productName": "marketable product name",
  "shortDescription": "1-2 sentences for product card",
  "fullDescription": "4-5 sentences for product page — mention purpose, craftsmanship, materials, tradition, usage",
  "category": "MUST be exactly one of: ${SEVEN_CATEGORIES.join(' | ')}",
  "subcategory": "specific subcategory within category",
  "materials": ["primary material", "secondary material"],
  "craftTechnique": "the handmade technique used",
  "suggestedTags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"],
  "keyFeatures": ["feature 1", "feature 2", "feature 3", "feature 4", "feature 5"],
  "careInstructions": ["care step 1", "care step 2", "care step 3"],
  "suggestedPriceRange": { "minimum": 0, "maximum": 0, "currency": "INR" }
}

Rules: category must exactly match one of the 7 options. Do not invent historical claims. Return ONLY JSON.`;

    const fallback = buildMockCatalog(description);
    const result = image_url
      ? await (async () => {
          try {
            const text = await gemini.analyzeImage(image_url, prompt);
            const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
            return { data: JSON.parse(cleaned), isAI: true };
          } catch {
            return gemini.generateStructuredJSON(prompt, fallback);
          }
        })()
      : await gemini.generateStructuredJSON(prompt, fallback);

    const catalog = validateCatalogFields({ ...result.data, isAI: result.isAI });

    logAIUsage({
      userId: req.user?.id,
      feature: 'catalog',
      model: gemini.getModelName(),
      status: 'success',
      promptLength: (description || '').length + (image_url ? 100 : 0),
      responseLength: JSON.stringify(catalog).length,
      metadata: { category: catalog.category, isAI: result.isAI }
    });

    return res.json({ catalog, isAIGenerated: result.isAI });
  } catch (err) {
    console.error('[generateFullCatalog] Error:', err.message);
    const fallbackCatalog = validateCatalogFields({ ...buildMockCatalog(req.body?.description), isAI: false });
    return res.json({ catalog: fallbackCatalog, isAIGenerated: false });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 4. DETECT CATEGORY — Image + description → 7-category with confidence
// ════════════════════════════════════════════════════════════════════════════

exports.detectCategory = async (req, res) => {
  try {
    const { description, image_url } = req.body;
    if (!description && !image_url) {
      return res.status(400).json({ error: 'Provide a description or image URL.' });
    }

    const prompt = `You are a category classifier for Indian handicrafts.

Classify this product into exactly ONE of these 7 categories:
${SEVEN_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Product description: "${description || 'No description provided'}"

Return ONLY valid JSON:
{
  "category": "exact category name from the list above",
  "subcategory": "specific subcategory",
  "confidence": "high | medium | low",
  "reason": "one sentence explaining why this category was chosen",
  "alternativeCategory": "second best category if confidence is low or medium"
}`;

    let result;
    if (image_url) {
      try {
        const text = await gemini.analyzeImage(image_url, prompt);
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        result = { data: JSON.parse(cleaned), isAI: true };
      } catch {
        result = await gemini.generateStructuredJSON(prompt, null);
      }
    } else {
      result = await gemini.generateStructuredJSON(prompt, null);
    }

    if (!result.data) {
      // Deterministic fallback
      const lower = (description || '').toLowerCase();
      let category = 'Handmade Jewelry & Accessories';
      if (lower.includes('saree') || lower.includes('weav') || lower.includes('fabric')) category = 'Handloom & Textiles';
      else if (lower.includes('wood') || lower.includes('carv')) category = 'Wooden Handicrafts';
      else if (lower.includes('clay') || lower.includes('pot') || lower.includes('terracotta')) category = 'Pottery & Terracotta';
      else if (lower.includes('bamboo') || lower.includes('jute') || lower.includes('eco')) category = 'Eco-Friendly & Natural Products';
      else if (lower.includes('paint') || lower.includes('art') || lower.includes('madhubani')) category = 'Traditional Paintings & Wall Art';
      else if (lower.includes('decor') || lower.includes('home') || lower.includes('lamp')) category = 'Home Décor & Furnishings';
      result = { data: { category, subcategory: 'General', confidence: 'low', reason: 'Keyword-based fallback detection.', alternativeCategory: '' }, isAI: false };
    }

    // Ensure category is one of the 7
    if (!SEVEN_CATEGORIES.includes(result.data.category)) {
      result.data.category = SEVEN_CATEGORIES[0];
      result.data.confidence = 'low';
    }

    logAIUsage({
      userId: req.user?.id,
      feature: 'category_detection',
      model: gemini.getModelName(),
      status: 'success',
      promptLength: (description || '').length,
      responseLength: 60,
      metadata: { category: result.data?.category, confidence: result.data?.confidence }
    });

    return res.json({ ...result.data, isAIGenerated: result.isAI });
  } catch (err) {
    console.error('[detectCategory] Error:', err.message);
    res.status(500).json({ error: 'Category detection failed. Please try again.' });
  }
};

// In-memory cache for live product translations: cacheKey -> { English, Hindi, Kannada, Marathi }
const productTranslationCache = new Map();

exports.translateProduct = async (req, res) => {
  try {
    const {
      productId,
      targetLanguage,
      targetLanguages = ['Hindi', 'Kannada', 'Marathi'],
      productName,
      description,
      productData = {},
    } = req.body;

    const name = productData.name || productName || '';
    const desc = productData.description || description || '';
    const shortDesc = productData.short_description || productData.shortDescription || '';
    const material = productData.material || (Array.isArray(productData.materials) ? productData.materials[0] : '') || '';
    const craftTechnique = productData.craft_technique || productData.craftTechnique || '';
    const artisanBio = productData.artisan_bio || productData.bio || '';
    const careInstructions = productData.care_instructions || (Array.isArray(productData.careInstructions) ? productData.careInstructions.join('. ') : '') || '';
    const stateOfOrigin = productData.state_of_origin || productData.originState || '';
    const category = productData.category || '';

    if (!name && !desc) {
      return res.status(400).json({ error: 'Provide product name or description to translate.' });
    }

    // Cache key based on productId or name
    const cacheKey = productId ? String(productId) : `${name.slice(0, 40)}_${(material || '').slice(0, 20)}`;
    const cached = productTranslationCache.get(cacheKey);

    // Normalize target language code to full language name
    const normalizeLang = (l) => {
      if (!l) return null;
      const lower = String(l).toLowerCase().trim();
      if (lower === 'hi' || lower === 'hindi') return 'Hindi';
      if (lower === 'kn' || lower === 'kannada') return 'Kannada';
      if (lower === 'mr' || lower === 'marathi') return 'Marathi';
      if (lower === 'en' || lower === 'english') return 'English';
      return l;
    };

    const requestedSingleLang = normalizeLang(targetLanguage);

    if (cached) {
      if (requestedSingleLang && cached[requestedSingleLang]) {
        return res.json({
          translations: cached,
          translation: cached[requestedSingleLang],
          language: requestedSingleLang,
          cached: true,
          isAIGenerated: true,
        });
      }
      if (!requestedSingleLang && cached.Hindi && cached.Kannada && cached.Marathi) {
        return res.json({
          translations: cached,
          cached: true,
          isAIGenerated: true,
        });
      }
    }

    const payloadToTranslate = {
      name,
      description: desc,
      ...(shortDesc ? { short_description: shortDesc } : {}),
      ...(material ? { material } : {}),
      ...(craftTechnique ? { craft_technique: craftTechnique } : {}),
      ...(artisanBio ? { artisan_bio: artisanBio } : {}),
      ...(careInstructions ? { care_instructions: careInstructions } : {}),
      ...(stateOfOrigin ? { state_of_origin: stateOfOrigin } : {}),
      ...(category ? { category } : {}),
    };

    const prompt = `You are an expert Indian handicrafts multilingual translator and cultural linguist.
Translate all product details into Hindi (हिन्दी), Kannada (ಕನ್ನಡ), and Marathi (मराठी).
Maintain cultural dignity, handicraft authenticity, and natural regional phrasing (not robotic translation).
Keep proper names (e.g. Varanasi, Banarasi, Kanchipuram) phonetically accurate in Indian scripts.

Product to translate:
${JSON.stringify(payloadToTranslate, null, 2)}

Return ONLY valid JSON matching this exact structure:
{
  "Hindi": {
    "name": "...",
    "description": "...",
    "short_description": "...",
    "material": "...",
    "craft_technique": "...",
    "artisan_bio": "...",
    "care_instructions": "...",
    "state_of_origin": "..."
  },
  "Kannada": {
    "name": "...",
    "description": "...",
    "short_description": "...",
    "material": "...",
    "craft_technique": "...",
    "artisan_bio": "...",
    "care_instructions": "...",
    "state_of_origin": "..."
  },
  "Marathi": {
    "name": "...",
    "description": "...",
    "short_description": "...",
    "material": "...",
    "craft_technique": "...",
    "artisan_bio": "...",
    "care_instructions": "...",
    "state_of_origin": "..."
  }
}`;

    const fallbackTranslations = {
      English: { ...payloadToTranslate },
      Hindi: {
        ...payloadToTranslate,
        name: `${name} (हिंदी)`,
        description: `${desc}`,
      },
      Kannada: {
        ...payloadToTranslate,
        name: `${name} (ಕನ್ನಡ)`,
        description: `${desc}`,
      },
      Marathi: {
        ...payloadToTranslate,
        name: `${name} (मराठी)`,
        description: `${desc}`,
      },
    };

    const result = await gemini.generateStructuredJSON(prompt, fallbackTranslations);

    const fullTranslations = {
      English: { ...payloadToTranslate },
      ...(result.data || {}),
    };

    // Store in cache
    productTranslationCache.set(cacheKey, fullTranslations);

    logAIUsage({
      userId: req.user?.id,
      feature: 'translation',
      model: gemini.getModelName(),
      status: 'success',
      promptLength: JSON.stringify(payloadToTranslate).length,
      responseLength: JSON.stringify(fullTranslations).length,
      metadata: { languages: ['Hindi', 'Kannada', 'Marathi'], productId }
    });

    return res.json({
      translations: fullTranslations,
      translation: requestedSingleLang ? fullTranslations[requestedSingleLang] || fullTranslations.Hindi : null,
      language: requestedSingleLang || 'all',
      isAIGenerated: result.isAI,
    });
  } catch (err) {
    console.error('[translateProduct] Error:', err.message);
    const safeName = req.body?.productData?.name || req.body?.productName || 'Handcrafted Product';
    const safeDesc = req.body?.productData?.description || req.body?.description || '';
    const safePayload = { name: safeName, description: safeDesc, ...((req.body && req.body.productData) || {}) };
    const safeFallbacks = {
      English: safePayload,
      Hindi: { ...safePayload, name: `${safeName} (हिंदी)` },
      Kannada: { ...safePayload, name: `${safeName} (ಕನ್ನಡ)` },
      Marathi: { ...safePayload, name: `${safeName} (मराठी)` },
    };
    const reqLang = req.body?.targetLanguage || 'Hindi';
    return res.json({
      translations: safeFallbacks,
      translation: safeFallbacks[reqLang] || safeFallbacks.Hindi,
      language: reqLang,
      isAIGenerated: false,
    });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 6. SUGGEST PRICE — Deterministic calc + AI range explanation
// ════════════════════════════════════════════════════════════════════════════

exports.suggestPrice = async (req, res) => {
  try {
    const {
      rawMaterialCost = 0,
      laborCost       = 0,
      additionalExpenses = 0,
      desiredMarginPercent = 30,
      category = '',
      description = '',
    } = req.body;

    // ── Deterministic calculation (primary) ─────────────────────────────
    const baseCost = Number(rawMaterialCost) + Number(laborCost) + Number(additionalExpenses);
    const margin   = Math.max(0, Math.min(500, Number(desiredMarginPercent)));
    const suggestedPrice = Math.round(baseCost * (1 + margin / 100));

    const breakdown = {
      rawMaterialCost:    Number(rawMaterialCost),
      laborCost:          Number(laborCost),
      additionalExpenses: Number(additionalExpenses),
      baseCost,
      marginPercent:      margin,
      marginAmount:       Math.round(baseCost * margin / 100),
      suggestedPrice,
    };

    // ── AI range explanation (supplemental only) ─────────────────────────
    let aiRange = null;
    let aiExplanation = '';

    if (baseCost > 0) {
      const prompt = `You are a pricing advisor for Indian handicrafts artisans.

An artisan has the following costs for a "${category || 'handcrafted'}" product:
- Raw materials: ₹${rawMaterialCost}
- Labor: ₹${laborCost}
- Additional expenses: ₹${additionalExpenses}
- Base cost: ₹${baseCost}
- Their calculated selling price with ${margin}% margin: ₹${suggestedPrice}

Product: "${description || category || 'handcrafted artisan product'}"

Based ONLY on the artisan's actual costs (do not invent market prices), provide:
1. A suggested price range that ensures the artisan earns fairly
2. A brief explanation (2-3 sentences) of why this range is appropriate
3. Any pricing tips relevant to this type of handicraft

Return ONLY valid JSON:
{
  "recommendedRange": { "minimum": 0, "maximum": 0 },
  "explanation": "2-3 sentences",
  "tips": ["tip 1", "tip 2"]
}

Important: Base the range on the actual cost of ₹${baseCost}. Do not invent market data.`;

      const result = await gemini.generateStructuredJSON(prompt, null);
      if (result.data && result.data.recommendedRange) {
        aiRange       = result.data.recommendedRange;
        aiExplanation = result.data.explanation || '';
        breakdown.aiTips = result.data.tips || [];
      }
    }

    logAIUsage({
      userId: req.user?.id,
      feature: 'price_suggestion',
      model: gemini.getModelName(),
      status: 'success',
      promptLength: 100,
      responseLength: 100,
      metadata: { suggestedPrice, category }
    });

    return res.json({
      breakdown,
      aiRange: aiRange || { minimum: Math.round(suggestedPrice * 0.9), maximum: Math.round(suggestedPrice * 1.3) },
      aiExplanation: aiExplanation || 'Price calculated from your actual costs with the specified profit margin.',
      disclaimer: 'AI-generated estimate — final pricing decision belongs to the artisan.',
    });
  } catch (err) {
    console.error('[suggestPrice] Error:', err.message);
    res.status(500).json({ error: 'Price suggestion failed. Please try again.' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 7. GENERATE ARTISAN STORY — Biography from artisan-provided info only
// ════════════════════════════════════════════════════════════════════════════

exports.generateArtisanStory = async (req, res) => {
  try {
    const { name, location, craft, yearsExperience, familyHistory, personalNote } = req.body;
    if (!name || !craft) {
      return res.status(400).json({ error: 'Please provide artisan name and craft specialization.' });
    }

    const prompt = `You are a respectful storyteller for KalaStyle AI — a platform supporting Indian artisans.

Write a professional, authentic artisan biography using ONLY the information provided below.
Do NOT invent any details, historical facts, awards, or claims not mentioned.
Do NOT exaggerate. Use warm, respectful language.

Artisan Information:
- Name: ${name}
- Location: ${location || 'India'}
- Craft Specialization: ${craft}
- Years of Experience: ${yearsExperience || 'several years'}
- Family Craft History: ${familyHistory || 'Not provided'}
- Personal Note: ${personalNote || 'Not provided'}

Write a 3-4 paragraph artisan story that:
1. Introduces the artisan warmly
2. Describes their craft and techniques
3. Mentions their connection to tradition (only if family history provided)
4. Explains what makes their work special

Return ONLY the story text — no JSON, no labels, no markdown headers.
Only include information explicitly provided above.`;

    try {
      const story = await gemini.generateText(prompt);
      logAIUsage({
        userId: req.user?.id,
        feature: 'story',
        model: gemini.getModelName(),
        status: 'success',
        promptLength: (craft || '').length + (name || '').length,
        responseLength: (story || '').length,
        metadata: { artisan: name, craft }
      });
      return res.json({ story, isAIGenerated: true });
    } catch {
      const fallback = `${name} is a skilled artisan from ${location || 'India'} specializing in ${craft}. With ${yearsExperience ? yearsExperience + ' years' : 'years'} of experience, they create authentic handcrafted products that reflect India's rich cultural heritage. ${familyHistory ? familyHistory + '.' : ''} Each piece is made with dedication to preserving traditional craftsmanship while creating meaningful products for modern customers.`;
      logAIUsage({
        userId: req.user?.id,
        feature: 'story',
        model: gemini.getModelName(),
        status: 'success',
        promptLength: (craft || '').length + (name || '').length,
        responseLength: fallback.length,
        metadata: { artisan: name, craft, fallback: true }
      });
      return res.json({ story: fallback, isAIGenerated: false });
    }
  } catch (err) {
    console.error('[generateArtisanStory] Error:', err.message);
    res.status(500).json({ error: 'Story generation failed. Please try again.' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 8. GET AI INSIGHTS — Real Supabase stats → AI trend analysis
// ════════════════════════════════════════════════════════════════════════════

exports.getAIInsights = async (req, res) => {
  try {
    const { stats } = req.body; // Passed from frontend after fetching from artisanAPI.getMyStats()

    if (!stats || typeof stats !== 'object') {
      return res.status(400).json({ error: 'Please provide artisan stats object.' });
    }

    const { totalProducts = 0, totalOrders = 0, totalRevenue = 0, recentOrders = [] } = stats;

    // Minimum data threshold — don't send to AI if insufficient
    const hasEnoughData = totalProducts >= 1 || totalOrders >= 1;

    if (!hasEnoughData) {
      return res.json({
        insights: ['Not enough data yet to generate insights. Add your first products and start selling to see AI-powered business insights here.'],
        isAIGenerated: false,
      });
    }

    // Summarize real data — never send personal identifiable info
    const dataSummary = {
      totalProducts,
      totalOrders,
      totalRevenue,
      recentOrderCount: recentOrders.length,
      categories: [...new Set(recentOrders.map(o => o.products?.category).filter(Boolean))],
    };

    const prompt = `You are a business insights assistant for KalaStyle AI — an Indian artisan marketplace.

Using ONLY the real data below, provide 3-5 specific, actionable insights for the artisan.
Do NOT invent statistics, market data, or external comparisons.
If data is limited, acknowledge it honestly.

Artisan's Real Platform Data:
- Total products listed: ${dataSummary.totalProducts}
- Total orders received: ${dataSummary.totalOrders}
- Total revenue earned: ₹${dataSummary.totalRevenue}
- Recent orders count: ${dataSummary.recentOrderCount}
- Product categories with orders: ${dataSummary.categories.join(', ') || 'none yet'}

Provide insights as a JSON array of strings — each insight is one clear, actionable sentence.
Example format:
["Insight 1 based on real data.", "Insight 2.", "Tip 3."]

Return ONLY a valid JSON array. Do not invent numbers or external market data.`;

    const result = await gemini.generateStructuredJSON(prompt, [
      'You have ' + totalProducts + ' products listed. Add more products to increase your visibility.',
      totalOrders > 0 ? `You have received ${totalOrders} orders. Keep fulfilling them on time to build your reputation.` : 'You haven\'t received orders yet. Complete your profile and add high-quality product photos to attract buyers.',
    ]);

    const insights = Array.isArray(result.data) ? result.data : [String(result.data)];

    logAIUsage({
      userId: req.user?.id,
      feature: 'insights',
      model: gemini.getModelName(),
      status: 'success',
      promptLength: 100,
      responseLength: 200
    });

    return res.json({ insights, isAIGenerated: result.isAI });
  } catch (err) {
    console.error('[getAIInsights] Error:', err.message);
    res.status(500).json({ error: 'Could not generate insights. Please try again.' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 9. SMART SEARCH — Semantic query expansion for product discovery
// ════════════════════════════════════════════════════════════════════════════

exports.smartSearch = async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'Please provide a search query.' });
    }

    const prompt = `You are a search assistant for an Indian handicrafts marketplace.

Expand this search query to find the most relevant handcrafted products.
Query: "${query}"

Return ONLY valid JSON:
{
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "categories": ["matching category from: ${SEVEN_CATEGORIES.join(', ')}"],
  "materials": ["material1", "material2"],
  "intent": "brief description of what the user is looking for"
}

Rules:
- keywords: 4-6 relevant search terms covering synonyms and related products
- categories: only from the provided list, only if genuinely relevant
- materials: common materials for these products
- Return ONLY valid JSON`;

    const fallback = {
      keywords: query.trim().split(/\s+/).slice(0, 5),
      categories: [],
      materials: [],
      intent: query,
    };

    const result = await gemini.generateStructuredJSON(prompt, fallback);

    logAIUsage({
      userId: req.user?.id,
      feature: 'smart_search',
      model: gemini.getModelName(),
      status: 'success',
      promptLength: (query || '').length,
      responseLength: JSON.stringify(result.data).length,
      metadata: { query }
    });

    return res.json({ expansion: result.data, isAIGenerated: result.isAI });
  } catch (err) {
    console.error('[smartSearch] Error:', err.message);
    res.status(500).json({ error: 'Smart search failed. Please try again.' });
  }
};

/**
 * 10. getHealth — checks backend Gemini AI configuration & connectivity safely
 * Never exposes the raw API key.
 */
exports.getHealth = async (req, res) => {
  try {
    const health = await gemini.checkHealth();
    const statusCode = health.status === 'ok' ? 200 : (health.apiKeyConfigured ? 502 : 400);
    return res.status(statusCode).json(health);
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      apiKeyConfigured: gemini.isKeyConfigured(),
      model: gemini.getModelName(),
      message: 'AI health check encountered an unexpected error.',
      details: err.message
    });
  }
};

/**
 * 11. generateProductImages
 * ─────────────────────────────────────────────────────────────────
 * Given a product's uploaded image URL + metadata, generates 3–4 additional
 * product image variations using the Gemini Imagen API, uploads each one to
 * Cloudinary, and returns the resulting URL array.
 *
 * Also updates the product's `images` column in Supabase if product_id is
 * provided, so the gallery is immediately populated for the new product.
 *
 * Body: { image_url, product_name, category, material, craft_technique, product_id? }
 */
exports.generateProductImages = async (req, res) => {
  const { image_url, product_name, category, material, craft_technique, product_id } = req.body;

  if (!image_url && !product_name) {
    return res.status(400).json({ error: 'image_url or product_name is required.' });
  }

  // ── Build image generation prompts ────────────────────────────────────────
  const baseSubject = product_name || 'Indian handicraft artisan product';
  const cat = category || 'Indian Handicraft';
  const mat = material || 'handcrafted natural materials';
  const tech = craft_technique || 'traditional Indian technique';

  const VARIANTS = [
    `Professional product photography of ${baseSubject}, a ${cat} made from ${mat} using ${tech}. Shot on a clean white background, soft studio lighting, sharp focus, high resolution, ecommerce style, 4K quality.`,
    `${baseSubject} displayed on a dark rustic wooden table with a soft bokeh background, warm golden hour lighting, lifestyle product photography, Indian artisan craft aesthetic, premium brand photography, 4K.`,
    `Close-up macro detail shot of ${baseSubject} showing intricate ${tech} texture and ${mat} quality, Indian artisan craftsmanship, shallow depth of field, rich colors, professional product photography.`,
    `${baseSubject} placed on a traditional Indian Rajasthani or Mughal-inspired decorative background, warm earthy tones, festive presentation, premium artisan marketplace product photo, beautiful and authentic.`,
  ];

  try {
    const { GoogleGenAI, Modality } = require('@google/genai');
    const { cloudinary } = require('../config/cloudinary');

    const apiKey = process.env.GEMINI_ADMIN_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI image generation is not configured on this server.' });
    }

    const genAI = new GoogleGenAI({ apiKey });
    const generatedUrls = [];

    // Always include original uploaded image first
    if (image_url) generatedUrls.push(image_url);

    // Generate up to 3 additional AI images (cap at 3 to avoid timeout)
    const targetCount = 3;
    const maxAttempts = Math.min(VARIANTS.length, targetCount + 1);

    for (let i = 0; i < maxAttempts && generatedUrls.length < targetCount + 1; i++) {
      const prompt = VARIANTS[i];
      try {
        const response = await genAI.models.generateImages({
          model: 'imagen-3.0-generate-002',
          prompt,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: '1:1',
          },
        });

        const imgData = response?.generatedImages?.[0]?.image?.imageBytes;
        if (!imgData) continue;

        // Upload generated image bytes to Cloudinary
        const base64Str = `data:image/jpeg;base64,${imgData}`;
        const uploadRes = await cloudinary.uploader.upload(base64Str, {
          folder: 'kalastyle-artisan-marketplace/ai-generated',
          resource_type: 'image',
          tags: ['ai-generated', 'product-variant'],
        });

        const url = uploadRes.secure_url || uploadRes.url;
        if (url && url !== image_url) {
          generatedUrls.push(url);
        }
      } catch (imgErr) {
        // Individual image failures are non-fatal — just skip this variant
        console.warn(`[generateProductImages] Variant ${i + 1} failed:`, imgErr.message);
      }
    }

    // Deduplicate and cap at 5
    const finalImages = [...new Set(generatedUrls)].slice(0, 5);

    // ── Persist images[] to Supabase if product_id provided ───────────────────
    if (product_id && finalImages.length > 0) {
      try {
        const supabase = require('../config/supabase');
        // 1. First attempt to update images column directly
        const { error: updateColErr } = await supabase
          .from('products')
          .update({ images: finalImages, image_url: finalImages[0] })
          .eq('id', product_id);

        if (updateColErr) {
          console.warn('[generateProductImages] images column update notice:', updateColErr.message);
          // 2. Fallback: fetch current tags, append __IMAGES__ tag, and update image_url
          const { data: prodData } = await supabase
            .from('products')
            .select('tags')
            .eq('id', product_id)
            .maybeSingle();

          const existingTags = Array.isArray(prodData?.tags)
            ? prodData.tags.filter(t => typeof t === 'string' && !t.startsWith('__IMAGES__:'))
            : [];

          existingTags.push(`__IMAGES__:${JSON.stringify(finalImages)}`);

          await supabase
            .from('products')
            .update({
              image_url: finalImages[0],
              tags: existingTags,
            })
            .eq('id', product_id);
          console.log(`[generateProductImages] Stored ${finalImages.length} images via tags fallback for product ${product_id}`);
        } else {
          console.log(`[generateProductImages] Updated images[] column for product ${product_id}`);
        }
      } catch (dbErr) {
        console.warn('[generateProductImages] DB update notice:', dbErr.message);
      }
    }

    return res.json({
      success: true,
      images: finalImages,
      count: finalImages.length,
      ai_generated_count: finalImages.length - (image_url ? 1 : 0),
    });

  } catch (err) {
    console.error('[generateProductImages] Fatal error:', err.message);
    // On total failure, return the original image at minimum so the product is still usable
    const fallback = image_url ? [image_url] : [];
    return res.status(207).json({
      success: false,
      images: fallback,
      count: fallback.length,
      error: 'AI image generation partially failed. Original image preserved.',
      details: err.message,
    });
  }
};

