/**
 * backend/ai/geminiClient.js
 * ─────────────────────────────────────────────────────────────────
 * Secure Google Gemini client factory and connectivity manager.
 * Prioritizes GEMINI_ADMIN_API_KEY, falling back to GEMINI_API_KEY.
 * NEVER exposes raw secrets to callers or error payloads.
 */

const { GoogleGenAI } = require('@google/genai');

let geminiInstance = null;
let lastApiKey = null;

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/**
 * Resolves the active Gemini API key (prioritizing dedicated admin key).
 */
function getApiKey() {
  const adminKey = process.env.GEMINI_ADMIN_API_KEY;
  if (adminKey && adminKey.trim().length > 10 && !adminKey.startsWith('your_')) {
    return adminKey.trim();
  }
  const generalKey = process.env.GEMINI_API_KEY;
  if (generalKey && generalKey.trim().length > 10 && !generalKey.startsWith('your_')) {
    return generalKey.trim();
  }
  return null;
}

/**
 * Returns whether Gemini is configured with a valid API key.
 */
function isConfigured() {
  return Boolean(getApiKey());
}

/**
 * Returns configured model identifier (defaults to gemini-3.5-flash-lite).
 */
function getModel() {
  return (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
}

/**
 * Returns initialized GoogleGenAI client singleton.
 */
function getClient() {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  if (!geminiInstance || lastApiKey !== apiKey) {
    geminiInstance = new GoogleGenAI({ apiKey });
    lastApiKey = apiKey;
  }

  return geminiInstance;
}

/**
 * Test Gemini connectivity and model availability.
 */
async function testConnection() {
  if (!isConfigured()) {
    return {
      status: 'unconfigured',
      model: getModel(),
      message: 'GEMINI_ADMIN_API_KEY / GEMINI_API_KEY is not configured in backend/.env. AI will operate in deterministic fallback mode.',
    };
  }

  try {
    const client = getClient();
    const model = getModel();
    const response = await client.models.generateContent({
      model,
      contents: 'ping',
    });

    return {
      status: 'online',
      provider: 'Google Gemini',
      model,
      responseSnippet: (response.text || '').trim().substring(0, 50),
      message: 'Google Gemini client connected successfully and operational.',
    };
  } catch (error) {
    console.error('⚠️ [Gemini Client] Connectivity check failed:', error.message);
    return {
      status: 'error',
      provider: 'Google Gemini',
      model: getModel(),
      message: error.message || 'Failed to reach Gemini API',
      code: error.status || 'API_ERROR',
    };
  }
}

module.exports = {
  getClient,
  getApiKey,
  getModel,
  isConfigured,
  testConnection,
};
