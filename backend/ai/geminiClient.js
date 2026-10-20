/**
 * backend/ai/geminiClient.js
 * ─────────────────────────────────────────────────────────────────
 * Secure Google Gemini client factory and connectivity manager.
 * Prioritizes GEMINI_ADMIN_API_KEY, falling back to GEMINI_API_KEY.
 * Automatic multi-model fallback across candidate models.
 * Health-check caching prevents burning free-tier API quotas.
 * Clean error message parsing ensures human-readable diagnostics.
 * NEVER exposes raw secrets to callers or error payloads.
 */

const { GoogleGenAI } = require('@google/genai');

let geminiInstance = null;
let lastApiKey = null;

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
];

let activeWorkingModel = null;
let cachedHealthResult = null;
let lastHealthCheckTime = 0;
const HEALTH_CACHE_TTL = 60 * 1000; // Cache connectivity status for 60s to protect API quota

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
  if (activeWorkingModel) return activeWorkingModel;
  return (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
}

function setActiveModel(model) {
  if (model) activeWorkingModel = model.trim();
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
 * Cleanly format error message from Google GenAI API.
 */
function formatErrorMessage(error) {
  let msg = error?.message || 'Failed to reach Gemini API';
  try {
    if (msg.includes('{') && msg.includes('"error"')) {
      const match = msg.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.error?.message) {
          msg = parsed.error.message;
        }
      }
    }
  } catch (_) {}

  if (msg.includes('Quota exceeded') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    const waitMatch = msg.match(/retry in ([^\.]+)/i);
    const retryTime = waitMatch ? waitMatch[1] : 'shortly';
    return `Gemini free tier daily quota reached. Please retry in ${retryTime} or upgrade API plan at ai.google.dev. System operates safely with autonomous safeguards.`;
  }

  return msg;
}

/**
 * Test Gemini connectivity and model availability with intelligent fallback.
 */
async function testConnection(forceRefresh = false) {
  if (!isConfigured()) {
    return {
      status: 'unconfigured',
      model: getModel(),
      message: 'GEMINI_ADMIN_API_KEY / GEMINI_API_KEY is not configured in backend/.env. AI will operate in deterministic fallback mode.',
    };
  }

  // Quota conservation guard: return cached health status within 60 seconds
  if (!forceRefresh && cachedHealthResult && (Date.now() - lastHealthCheckTime < HEALTH_CACHE_TTL)) {
    return cachedHealthResult;
  }

  const client = getClient();
  const preferredModel = (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  const modelsToTry = Array.from(new Set([
    preferredModel,
    DEFAULT_MODEL,
    ...CANDIDATE_MODELS,
  ]));

  let lastError = null;

  for (const modelToTest of modelsToTry) {
    try {
      const response = await client.models.generateContent({
        model: modelToTest,
        contents: 'ping',
      });

      activeWorkingModel = modelToTest;
      cachedHealthResult = {
        status: 'online',
        provider: 'Google Gemini',
        model: modelToTest,
        responseSnippet: (response.text || '').trim().substring(0, 50),
        message: modelToTest === preferredModel
          ? `Google Gemini client connected successfully and operational (${modelToTest}).`
          : `Google Gemini operational using auto-fallback model (${modelToTest}).`,
      };
      lastHealthCheckTime = Date.now();
      return cachedHealthResult;
    } catch (error) {
      lastError = error;
      const cleanErr = formatErrorMessage(error);
      console.warn(`⚠️ [Gemini Client] Model ${modelToTest} test failed:`, cleanErr);
    }
  }

  const userFacingMsg = formatErrorMessage(lastError);
  console.error('⚠️ [Gemini Client] All candidate models failed connectivity check:', userFacingMsg);

  cachedHealthResult = {
    status: 'error',
    provider: 'Google Gemini',
    model: getModel(),
    message: userFacingMsg,
    code: lastError?.status || 'API_ERROR',
  };
  lastHealthCheckTime = Date.now();
  return cachedHealthResult;
}

module.exports = {
  getClient,
  getApiKey,
  getModel,
  setActiveModel,
  isConfigured,
  testConnection,
  formatErrorMessage,
  CANDIDATE_MODELS,
};
