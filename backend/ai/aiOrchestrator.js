/**
 * backend/ai/aiOrchestrator.js
 * ─────────────────────────────────────────────────────────────────
 * Autonomous AI Orchestrator running the Google Gemini tool calling loop.
 * Flow: Admin / Event -> Gemini -> Tool Call -> Backend Execution ->
 *       Tool Result -> Gemini Evaluation -> Final Action & Audit Log.
 */

const { getClient, getModel, isConfigured } = require('./geminiClient');
const { SYSTEM_PROMPT } = require('./aiSystemPrompt');
const { GEMINI_TOOLS } = require('./aiTools');
const { executeTool } = require('./aiToolExecutor');
const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');

const MAX_STEPS = 8;

/**
 * Log token and invocation metrics into ai_usage_logs.
 */
async function logUsage({ feature, model, status = 'success', promptLength = 0, responseLength = 0, metadata = {} }) {
  try {
    await safeQuery(() =>
      supabase.from('ai_usage_logs').insert([{
        feature,
        model,
        status,
        prompt_length: promptLength,
        response_length: responseLength,
        metadata,
        created_at: new Date().toISOString(),
      }])
    );
  } catch (e) {}
}

/**
 * Execute an autonomous agent loop powered by Google Gemini.
 *
 * @param {object} params
 * @param {Array} params.messages - Input conversation history
 * @param {object} params.context - { conversationId, adminId, eventType }
 * @returns {Promise<object>} { message: string, toolCallsExecuted: Array, actionsCount: number }
 */
async function runAutonomousLoop({ messages = [], context = {} }) {
  const conversationId = context.conversationId || `conv-${Date.now()}`;
  const executionContext = { ...context, conversationId };
  const toolCallsExecuted = [];

  // 1. Check if Gemini is configured
  if (!isConfigured()) {
    console.warn('⚠️ [AI Orchestrator] Google Gemini is unconfigured; providing deterministic fallback response.');
    return {
      success: true,
      mode: 'deterministic_fallback',
      message: 'KalaStyle AI Operations Manager is active in secure fallback mode. Configure GEMINI_ADMIN_API_KEY / GEMINI_API_KEY in backend/.env to enable autonomous Gemini tool calling. Platform data, orders, and payments remain fully operational.',
      toolCallsExecuted: [],
      actionsCount: 0,
      conversationId,
    };
  }

  const ai = getClient();
  const model = getModel();

  try {
    // 2. Initialize Gemini multi-turn chat session with tools and system instruction
    const chat = ai.chats.create({
      model,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: GEMINI_TOOLS,
        temperature: 0.2, // Low temperature for deterministic operational decisions
      },
    });

    // Extract user prompt (last user message)
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const userPrompt = lastUserMsg?.content || 'Run operational status check';

    let currentStep = 0;
    let finalContent = '';

    // First turn: send user directive
    let response = await chat.sendMessage({ message: userPrompt });

    while (currentStep < MAX_STEPS) {
      currentStep++;

      // Check if model returned function calls
      if (response.functionCalls && response.functionCalls.length > 0) {
        const functionResponses = [];

        for (const call of response.functionCalls) {
          const fnName = call.name;
          const fnArgs = call.args || {};

          // Execute backend tool
          const toolResult = await executeTool(fnName, fnArgs, executionContext);

          toolCallsExecuted.push({
            id: call.id || `call_${Date.now()}`,
            tool: fnName,
            args: fnArgs,
            result: toolResult,
          });

          // Feed result back into Gemini's format
          functionResponses.push({
            functionResponse: {
              name: fnName,
              response: toolResult,
            },
          });
        }

        // Send function execution results back to Gemini
        response = await chat.sendMessage({ message: functionResponses });
        continue;
      }

      // No more function calls, we have the model's final response
      finalContent = response.text || 'Task completed successfully.';
      break;
    }

    logUsage({
      feature: context.eventType || 'ai_admin_orchestrator',
      model,
      status: 'success',
      promptLength: userPrompt.length,
      responseLength: finalContent.length,
      metadata: { steps: currentStep, conversationId, actionsCount: toolCallsExecuted.length },
    });

    return {
      success: true,
      message: finalContent || 'Operations review completed.',
      toolCallsExecuted,
      actionsCount: toolCallsExecuted.length,
      conversationId,
    };
  } catch (error) {
    console.error('❌ [AI Orchestrator] Google Gemini API Error:', error.message);
    logUsage({
      feature: context.eventType || 'ai_admin_orchestrator',
      model,
      status: 'failed',
      metadata: { error: error.message, conversationId },
    });

    return {
      success: false,
      error: error.message,
      message: `AI Operations Manager encountered an API error: ${error.message}. Backend safeguards remain active.`,
      toolCallsExecuted,
      actionsCount: toolCallsExecuted.length,
      conversationId,
    };
  }
}

module.exports = {
  runAutonomousLoop,
};
