/**
 * backend/services/marketingService.js
 * ─────────────────────────────────────────────────────────────────
 * KalaStyle AI Marketing Agent Service
 * Generates marketing campaigns, ad copy, and social content
 * using the existing Gemini AI infrastructure.
 * All outputs require admin approval before any publishing action.
 */

const { getClient, getModel, isConfigured } = require('../ai/geminiClient');

/**
 * Generate a complete marketing campaign for a given theme.
 *
 * @param {object} params
 * @param {string} params.theme - Campaign theme (e.g., "Diwali", "Handloom Week")
 * @param {Array} params.products - Array of product objects to feature
 * @param {string} params.audience - Target audience description
 * @param {string} params.platform - Target platform (e.g., "Instagram", "WhatsApp", "Email")
 * @returns {Promise<object>} Campaign content
 */
async function generateCampaign({ theme, products = [], audience = 'handmade craft lovers', platform = 'Social Media' }) {
  if (!isConfigured()) {
    return {
      success: false,
      mode: 'fallback',
      message: 'AI not configured. Configure GEMINI_API_KEY to enable marketing content generation.',
      campaign: null,
    };
  }

  const productList = products.slice(0, 8).map(p =>
    `- ${p.name} (₹${p.price}) — ${p.category || 'Handicraft'}`
  ).join('\n');

  const prompt = `You are a marketing expert for KalaStyle AI — India's premier heritage handicraft marketplace.

Create a complete ${theme} marketing campaign for the following products:
${productList || '(General handmade craft products)'}

Target Platform: ${platform}
Target Audience: ${audience}

Generate a STRUCTURED campaign with:
1. Campaign Title (catchy, culturally relevant)
2. Campaign Concept (2-3 sentences)
3. Primary Headline
4. Sub-headline
5. Body Copy (2-3 paragraphs, emphasizing artisan stories and craft heritage)
6. Call to Action (CTA)
7. Hashtags (10 relevant hashtags)
8. Suggested Posting Schedule (3 posts)
9. Estimated Reach Potential
10. Recommended Featured Products (from the list above)

Keep tone: Warm, authentic, culturally rich, premium yet accessible.
Language: English with optional Hindi phrases for cultural connection.
Do NOT include pricing strategies that could mislead customers.`;

  try {
    const ai = getClient();
    const model = getModel();

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { temperature: 0.7 },
    });

    return {
      success: true,
      theme,
      platform,
      audience,
      campaign: response.text || '',
      featuredProducts: products.slice(0, 5).map(p => ({ id: p.id, name: p.name, price: p.price })),
      requiresApproval: true,
      approvalNote: 'This campaign requires admin approval before publishing. No funds have been spent.',
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      message: 'Marketing content generation failed. The AI API may be temporarily unavailable.',
    };
  }
}

/**
 * Generate ad copy for a specific product.
 *
 * @param {object} product - Product object with name, description, price, category
 * @param {string} format - 'short' | 'medium' | 'long'
 * @returns {Promise<object>} Ad copy variations
 */
async function generateAdCopy(product, format = 'medium') {
  if (!isConfigured()) {
    return {
      success: false,
      mode: 'fallback',
      message: 'AI not configured.',
      adCopy: null,
    };
  }

  const wordLimit = format === 'short' ? '30-50 words' : format === 'long' ? '150-200 words' : '80-120 words';

  const prompt = `Write compelling ad copy for this handmade craft product on KalaStyle AI:

Product: ${product.name}
Category: ${product.category || 'Handicraft'}
Price: ₹${product.price}
Description: ${product.description || 'A beautiful handcrafted item by a skilled Indian artisan.'}
Artisan Material: ${product.material || 'Traditional materials'}

Create 3 variations of ad copy, each ${wordLimit}:
1. Emotional/Story-driven variation
2. Feature/Quality-focused variation  
3. Urgency/Scarcity variation

Format each clearly with the variation number and type.
Keep tone: Authentic, premium, culturally respectful.`;

  try {
    const ai = getClient();
    const model = getModel();

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { temperature: 0.8 },
    });

    return {
      success: true,
      product: { id: product.id, name: product.name },
      format,
      adCopy: response.text || '',
      requiresApproval: false,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Generate social media content for a set of products.
 *
 * @param {Array} products - Products to feature
 * @param {string} occasion - Occasion or context
 * @returns {Promise<object>} Social posts
 */
async function generateSocialContent(products = [], occasion = 'general') {
  if (!isConfigured()) {
    return { success: false, mode: 'fallback', message: 'AI not configured.' };
  }

  const productNames = products.slice(0, 5).map(p => p.name).join(', ');

  const prompt = `Create 5 ready-to-post social media captions for KalaStyle AI — India's handmade craft marketplace.

Occasion/Theme: ${occasion}
Featured Products: ${productNames || 'Various handmade crafts'}

For each post provide:
- Platform (Instagram / Facebook / Twitter / WhatsApp Status)
- Caption (with emojis)
- Hashtags
- Best posting time suggestion

Keep content: Authentic, celebration-focused, artisan-supportive.
Avoid: Misleading claims, competitor mentions, pricing manipulation.`;

  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: getModel(),
      contents: prompt,
      config: { temperature: 0.75 },
    });

    return {
      success: true,
      occasion,
      socialContent: response.text || '',
      requiresApproval: true,
      approvalNote: 'Review and approve each post before publishing.',
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Generate an AI product description for a product missing one.
 *
 * @param {object} product - Product object
 * @returns {Promise<object>} Generated description
 */
async function generateProductDescription(product) {
  if (!isConfigured()) {
    return { success: false, mode: 'fallback', message: 'AI not configured.' };
  }

  const prompt = `Write a compelling product description for this handmade craft item on KalaStyle AI:

Product Name: ${product.name}
Category: ${product.category || 'Handicraft'}
Material: ${product.material || 'Traditional materials'}
Price: ₹${product.price}
Artisan: ${product.artisan_name || 'A skilled Indian artisan'}
Tags: ${(product.tags || []).join(', ') || 'handmade, craft'}

Write a 3-paragraph description that:
1. Opens with the cultural/heritage significance
2. Describes the craftsmanship and materials
3. Explains the use-case and why customers will love it

Keep it: Warm, authentic, SEO-friendly, 150-200 words total.
Do NOT fabricate specific awards, certifications, or false claims.`;

  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: getModel(),
      contents: prompt,
      config: { temperature: 0.6 },
    });

    return {
      success: true,
      product: { id: product.id, name: product.name },
      description: response.text || '',
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  generateCampaign,
  generateAdCopy,
  generateSocialContent,
  generateProductDescription,
};
