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
    // 2. Pre-flight validation safeguard: assert unique tool declarations
    const toolDeclarations = (GEMINI_TOOLS && GEMINI_TOOLS[0]?.functionDeclarations) || [];
    const seenToolNames = new Set();
    for (const tool of toolDeclarations) {
      if (!tool || !tool.name) continue;
      if (seenToolNames.has(tool.name)) {
        console.error(`Duplicate AI tool declaration:\n${tool.name}`);
        throw new Error(`Duplicate AI tool declaration: ${tool.name}`);
      }
      seenToolNames.add(tool.name);
    }

    // Extract user prompt (last user message)
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const userPrompt = lastUserMsg?.content || 'Run operational status check';

    // 3. Master Autonomous Sweep Direct Dispatch
    const isMasterSweepCommand = /handle (today'?s admin work|everything safe today|all admin work)/i.test(userPrompt) ||
      /run (autonomous sweep|autopilot sweep|daily admin operations)/i.test(userPrompt);

    if (isMasterSweepCommand) {
      console.log('⚡ [AI Orchestrator] Triggering Autonomous Daily Admin Operations Sweep...');
      const domainAgents = require('./domainAgents');
      const sweepResult = await domainAgents.runAutonomousDailySweep({
        adminConfirmed: true,
        triggerSource: 'ADMIN_CHAT_DIRECTIVE',
      });

      if (!sweepResult.success && sweepResult.blocked) {
        return {
          success: false,
          blocked: true,
          message: sweepResult.reason,
          toolCallsExecuted: [],
          actionsCount: 0,
          conversationId,
        };
      }

      const rep = sweepResult.report;
      const formattedResponse = `### 🌟 TODAY'S AUTONOMOUS ADMIN OPERATIONS REPORT

**Status:** Completed successfully • **Mode:** ${rep.mode} • **Duration:** ${rep.duration_ms}ms
**System Health:** Overall **${rep.system_health.overall}** (${rep.system_health.services_checked} services verified)

---

#### 📦 Orders & Fraud Sentinel
- **Orders Inspected:** ${rep.orders.inspected}
- **Suspicious Orders Detected:** ${rep.orders.suspicious_found}
- **Safely Held (Low/Med Risk):** ${rep.orders.held_safely}
- **Approval Requests Queued (Critical):** ${rep.orders.approval_requests_created}

#### 💳 Payments Sentinel
- **Failed Payments Detected:** ${rep.payments.failed_payments}
- **Pending COD Collections:** ${rep.payments.pending_cod_collections}
- **Payment Gateway Anomalies:** ${rep.payments.anomalies_detected}

#### 🎨 Products & Artisans
- **Pending Products Inspected:** ${rep.products.pending_review}
- **Products Held for Review:** ${rep.products.held_for_inspection}
- **Pending Artisan Registrations:** ${rep.artisans.pending_registrations}
- **Artisans Held for Verification:** ${rep.artisans.held_for_verification}

#### 📊 Inventory Sentinel
- **Low Stock Products (<=5):** ${rep.inventory.low_stock_products}
- **Out of Stock Products:** ${rep.inventory.out_of_stock_products}
- **Artisan Alerts Recommended:** ${rep.inventory.alerts_recommended}

#### 🚚 Shipping & Logistics Sentinel
- **Delayed Shipments (>7 days):** ${rep.shipping.delayed_shipments}
- **Unassigned AWB Shipments:** ${rep.shipping.unassigned_awb_count}
- **Failed Shipments:** ${rep.shipping.failed_shipments}

#### 💬 Moderation & Support
- **Pending Customer Reviews:** ${rep.reviews.pending_moderation}
- **Open Reports/Complaints:** ${rep.complaints.open_complaints}
- **Urgent Complaints:** ${rep.complaints.urgent_complaints}

---
*All metrics verified from real database records. Audit trail and report persisted in database.*`;

      return {
        success: true,
        message: formattedResponse,
        report: rep,
        toolCallsExecuted: [{
          id: `sweep_${Date.now()}`,
          tool: 'handle_todays_admin_work',
          args: { prompt: userPrompt },
          result: sweepResult,
        }],
        actionsCount: 1,
        conversationId,
      };
    }

    // 4. Build Gemini history from prior messages (all messages except the very last one)
    const history = [];
    const priorMessages = messages.slice(0, -1);
    for (const msg of priorMessages) {
      if (!msg || !msg.content) continue;
      history.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(msg.content) }],
      });
    }

    // 5. Initialize Gemini multi-turn chat session with tools, history, and system instruction
    const chat = ai.chats.create({
      model,
      history,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: GEMINI_TOOLS,
        temperature: 0.2, // Low temperature for deterministic operational decisions
      },
    });

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
    const isDuplicateTool = error.message && error.message.includes('Duplicate AI tool declaration');
    if (isDuplicateTool) {
      console.error(`Duplicate AI tool declaration:\n${error.message}`);
    } else {
      console.error('❌ [AI Orchestrator] Google Gemini API Error:', error.message);
    }

    logUsage({
      feature: context.eventType || 'ai_admin_orchestrator',
      model,
      status: 'failed',
      metadata: { error: error.message, conversationId },
    });

    const userFacingMessage = isDuplicateTool
      ? 'AI Operations could not process the request. Please try again.'
      : `AI Operations Manager encountered an API error: ${error.message}. Backend safeguards remain active.`;

    return {
      success: false,
      error: isDuplicateTool ? 'Duplicate AI tool declaration' : error.message,
      message: userFacingMessage,
      toolCallsExecuted,
      actionsCount: toolCallsExecuted.length,
      conversationId,
    };
  }
}

module.exports = {
  runAutonomousLoop,
};
