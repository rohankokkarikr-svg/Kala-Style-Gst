/**
 * backend/ai/openaiClient.js
 * ─────────────────────────────────────────────────────────────────
 * Secure OpenAI client factory and connectivity manager.
 * NEVER exposes raw secrets to callers or error payloads.
 */

const OpenAI = require('openai');

let openaiInstance = null;
let lastApiKey = null;

/**
 * Returns whether OpenAI is configured with a valid key.
 */
function isConfigured() {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && !key.startsWith('your_') && key.trim().length > 10);
}

/**
 * Get active OpenAI model name from environment or fallback.
 */
function getModel() {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

/**
 * Get or initialize the singleton OpenAI instance.
 */
function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!isConfigured()) {
    return null;
  }

  if (!openaiInstance || lastApiKey !== apiKey) {
    openaiInstance = new OpenAI({
      apiKey: apiKey.trim(),
      timeout: 30000,
      maxRetries: 2,
    });
    lastApiKey = apiKey;
  }

  return openaiInstance;
}

/**
 * Test OpenAI connectivity and model availability.
 */
async function testConnection() {
  if (!isConfigured()) {
    return {
      status: 'unconfigured',
      model: getModel(),
      message: 'OPENAI_API_KEY is not configured in backend/.env. AI will operate in deterministic fallback mode.',
    };
  }

  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5,
    });

    return {
      status: 'online',
      model: getModel(),
      responseId: response.id,
      message: 'OpenAI client connected successfully and operational.',
    };
  } catch (error) {
    console.error('⚠️ [OpenAI Client] Connectivity check failed:', error.message);
    return {
      status: 'error',
      model: getModel(),
      message: error.message || 'Failed to reach OpenAI API',
      code: error.code || error.status || 'API_ERROR',
    };
  }
}

module.exports = {
  getClient,
  isConfigured,
  getModel,
  testConnection,
};
