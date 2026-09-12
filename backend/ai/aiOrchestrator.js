/**
 * backend/ai/aiOrchestrator.js
 * ─────────────────────────────────────────────────────────────────
 * Autonomous AI Orchestrator running the OpenAI tool calling loop.
 * Flow: Admin / Event -> OpenAI -> Tool Call -> Backend Execution ->
 *       Tool Result -> OpenAI Evaluation -> Final Action & Audit Log.
 */

const { getClient, getModel, isConfigured } = require('./openaiClient');
const { SYSTEM_PROMPT } = require('./aiSystemPrompt');
const { AI_TOOLS } = require('./aiTools');
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
 * Execute an autonomous agent loop powered by OpenAI.
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

  // 1. Check if OpenAI is configured
  if (!isConfigured()) {
    console.warn('⚠️ [AI Orchestrator] OpenAI is unconfigured; providing deterministic fallback response.');
    return {
      success: true,
      mode: 'deterministic_fallback',
      message: 'KalaStyle AI Operations Manager is active in secure fallback mode. Configure OPENAI_API_KEY in backend/.env to enable autonomous GPT-4o tool calling. Platform data, orders, and payments remain fully operational.',
      toolCallsExecuted: [],
      actionsCount: 0,
      conversationId,
    };
  }

  const client = getClient();
  const model = getModel();

  // 2. Prepare message history with master system prompt
  const fullMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages,
  ];

  let currentStep = 0;
  let finalContent = '';

  while (currentStep < MAX_STEPS) {
    currentStep++;

    try {
      const response = await client.chat.completions.create({
        model,
        messages: fullMessages,
        tools: AI_TOOLS,
        tool_choice: 'auto',
        temperature: 0.2, // Low temperature for deterministic operational decisions
      });

      const choice = response.choices[0];
      const message = choice.message;

      // Track token usage
      if (response.usage) {
        logUsage({
          feature: context.eventType || 'ai_admin_orchestrator',
          model,
          promptLength: response.usage.prompt_tokens || 0,
          responseLength: response.usage.completion_tokens || 0,
          metadata: { step: currentStep, conversationId },
        });
      }

      // Append assistant's response to history
      fullMessages.push(message);

      // Check if model returned tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          const fnName = toolCall.function.name;
          let fnArgs = {};
          try {
            fnArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch (e) {
            console.error(`Failed to parse arguments for tool ${fnName}:`, toolCall.function.arguments);
          }

          // Execute backend tool
          const toolResult = await executeTool(fnName, fnArgs, executionContext);

          toolCallsExecuted.push({
            id: toolCall.id,
            tool: fnName,
            args: fnArgs,
            result: toolResult,
          });

          // Feed result back into conversation history for OpenAI to review
          fullMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }
        // Continue loop so OpenAI can evaluate tool results and formulate next step or final answer
        continue;
      }

      // If no further tool calls, we have the model's final response
      finalContent = message.content || 'Task completed successfully.';
      break;
    } catch (error) {
      console.error('❌ [AI Orchestrator] OpenAI API Error:', error.message);
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

  return {
    success: true,
    message: finalContent || 'Operations review completed.',
    toolCallsExecuted,
    actionsCount: toolCallsExecuted.length,
    conversationId,
  };
}

module.exports = {
  runAutonomousLoop,
};
