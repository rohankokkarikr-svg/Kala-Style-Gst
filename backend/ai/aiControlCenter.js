/**
 * backend/ai/aiControlCenter.js
 * ─────────────────────────────────────────────────────────────────
 * Central Autonomous Governance, Emergency Stop & Policy Controller.
 * Controls:
 * - ai_global_enabled: Master switch for AI operations
 * - ai_autonomous_enabled: Allows automated background actions
 * - ai_emergency_stop: Immediate freeze on all mutation tools
 * - ai_mode: OFF | READ_ONLY | ASSISTED | AUTONOMOUS | FULL_AUTONOMOUS
 * - action_budget: Hourly and daily rate limits for autonomous operations
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');

const CONTROL_KEY = 'ai_control_center_state';

// In-memory active cache
let activeSettings = {
  ai_global_enabled: true,
  ai_autonomous_enabled: true,
  ai_emergency_stop: false,
  ai_mode: 'AUTONOMOUS', // OFF | READ_ONLY | ASSISTED | AUTONOMOUS | FULL_AUTONOMOUS
  action_budget: {
    max_actions_per_hour: 60,
    max_notifications_per_hour: 30,
    max_order_actions_per_hour: 20,
    max_campaign_actions_per_day: 5,
  },
  last_loaded_at: 0,
};

// In-memory action velocity tracking (sliding 1-hour / 24-hour windows)
const actionLog = [];

/**
 * Clean up velocity log older than 24 hours.
 */
function pruneActionLog() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  while (actionLog.length > 0 && actionLog[0].timestamp < cutoff) {
    actionLog.shift();
  }
}

/**
 * Fetch control settings from database or return cached active settings.
 */
async function getControlSettings(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && now - activeSettings.last_loaded_at < 15000) {
    return activeSettings;
  }

  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('ai_agent_memory')
        .select('key, value')
        .in('key', ['ai_global_enabled', 'ai_autonomous_enabled', 'ai_emergency_stop', 'ai_mode', 'action_budget'])
    );

    if (!error && Array.isArray(data) && data.length > 0) {
      for (const row of data) {
        if (row.key === 'ai_global_enabled') activeSettings.ai_global_enabled = Boolean(row.value);
        if (row.key === 'ai_autonomous_enabled') activeSettings.ai_autonomous_enabled = Boolean(row.value);
        if (row.key === 'ai_emergency_stop') activeSettings.ai_emergency_stop = Boolean(row.value);
        if (row.key === 'ai_mode') activeSettings.ai_mode = String(row.value).replace(/['"]/g, '');
        if (row.key === 'action_budget' && typeof row.value === 'object') {
          activeSettings.action_budget = { ...activeSettings.action_budget, ...row.value };
        }
      }
    }
  } catch (err) {
    console.warn('[AI Control Center] DB settings load notice:', err.message);
  }

  activeSettings.last_loaded_at = now;
  return activeSettings;
}

/**
 * Update autonomous control settings (Admin-only).
 */
async function updateControlSettings(updates = {}, adminId = null) {
  const current = await getControlSettings(true);
  const next = { ...current };

  if (typeof updates.ai_global_enabled === 'boolean') {
    next.ai_global_enabled = updates.ai_global_enabled;
  }
  if (typeof updates.ai_autonomous_enabled === 'boolean') {
    next.ai_autonomous_enabled = updates.ai_autonomous_enabled;
  }
  if (typeof updates.ai_emergency_stop === 'boolean') {
    next.ai_emergency_stop = updates.ai_emergency_stop;
  }
  if (typeof updates.ai_mode === 'string') {
    const validModes = ['OFF', 'READ_ONLY', 'ASSISTED', 'AUTONOMOUS', 'FULL_AUTONOMOUS'];
    const modeUpper = updates.ai_mode.toUpperCase().trim();
    if (validModes.includes(modeUpper)) {
      next.ai_mode = modeUpper;
    }
  }
  if (typeof updates.action_budget === 'object' && updates.action_budget !== null) {
    next.action_budget = { ...next.action_budget, ...updates.action_budget };
  }

  activeSettings = { ...next, last_loaded_at: Date.now() };

  // Persist to ai_agent_memory table
  try {
    const memoryRows = [
      { memory_type: 'control', key: 'ai_global_enabled', value: JSON.stringify(next.ai_global_enabled), updated_at: new Date().toISOString() },
      { memory_type: 'control', key: 'ai_autonomous_enabled', value: JSON.stringify(next.ai_autonomous_enabled), updated_at: new Date().toISOString() },
      { memory_type: 'control', key: 'ai_emergency_stop', value: JSON.stringify(next.ai_emergency_stop), updated_at: new Date().toISOString() },
      { memory_type: 'control', key: 'ai_mode', value: JSON.stringify(next.ai_mode), updated_at: new Date().toISOString() },
      { memory_type: 'control', key: 'action_budget', value: JSON.stringify(next.action_budget), updated_at: new Date().toISOString() },
    ];

    for (const row of memoryRows) {
      await safeQuery(() =>
        supabase.from('ai_agent_memory').upsert([row], { onConflict: 'key' })
      );
    }
  } catch (err) {
    console.error('❌ [AI Control Center] Failed to persist settings to DB:', err.message);
  }

  return activeSettings;
}

/**
 * Check if the autonomous action budget is exceeded.
 */
function checkActionBudget(domain = 'general', riskLevel = 2) {
  pruneActionLog();
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const actionsLastHour = actionLog.filter(a => a.timestamp >= oneHourAgo).length;
  const orderActionsLastHour = actionLog.filter(a => a.timestamp >= oneHourAgo && a.domain === 'order').length;
  const campaignActionsLastDay = actionLog.filter(a => a.timestamp >= oneDayAgo && a.domain === 'campaign').length;

  const budget = activeSettings.action_budget || {};

  if (actionsLastHour >= (budget.max_actions_per_hour || 60)) {
    return { allowed: false, reason: `Hourly autonomous action limit reached (${actionsLastHour}/${budget.max_actions_per_hour || 60})` };
  }
  if (domain === 'order' && orderActionsLastHour >= (budget.max_order_actions_per_hour || 20)) {
    return { allowed: false, reason: `Hourly order mutation limit reached (${orderActionsLastHour}/${budget.max_order_actions_per_hour || 20})` };
  }
  if (domain === 'campaign' && campaignActionsLastDay >= (budget.max_campaign_actions_per_day || 5)) {
    return { allowed: false, reason: `Daily marketing campaign limit reached (${campaignActionsLastDay}/${budget.max_campaign_actions_per_day || 5})` };
  }

  return { allowed: true };
}

/**
 * Record a completed mutation in the action velocity tracker.
 */
function recordActionUsage(domain = 'general') {
  actionLog.push({ timestamp: Date.now(), domain });
  pruneActionLog();
}

/**
 * Authoritative Policy & Permission Gate.
 * Evaluates whether a tool execution is permitted under current settings and policy.
 *
 * @param {string} toolName
 * @param {number} riskLevel (1: Read-only, 2: Controlled mutation, 3: High risk, 4: Critical)
 * @param {object} context ({ eventType, adminId, isChatDirective })
 * @returns {Promise<{ allowed: boolean, reason?: string, requiresApproval?: boolean }>}
 */
async function canExecuteAction(param1, param2 = 1, param3 = {}) {
  let toolName;
  let riskLevel;
  let context;

  if (typeof param1 === 'object' && param1 !== null) {
    toolName = param1.toolName || param1.tool_name || param1.actionName;
    riskLevel = param1.safetyLevel || param1.riskLevel || param1.risk_level || 2;
    context = param1;
  } else {
    toolName = param1;
    riskLevel = typeof param2 === 'number' ? param2 : 1;
    context = typeof param3 === 'object' && param3 !== null ? param3 : {};
  }

  const settings = await getControlSettings();

  // 1. Read-only tools (Risk Level 1) are always allowed unless global AI is completely OFF
  if (riskLevel === 1) {
    if (!settings.ai_global_enabled && settings.ai_mode === 'OFF') {
      return { allowed: false, reason: 'AI operations are globally disabled by administrator.' };
    }
    return { allowed: true };
  }

  // 2. Direct Admin Chat Directives explicitly issued by the human admin in interactive chat
  if (context.eventType === 'ADMIN_CHAT_DIRECTIVE' || context.isChatDirective) {
    // If emergency stop is active, even chat directives cannot perform autonomous mutations
    if (settings.ai_emergency_stop) {
      return { allowed: false, reason: 'BLOCKED_BY_EMERGENCY_STOP: Emergency stop active. All mutation operations frozen.' };
    }
    return { allowed: true };
  }

  // 3. Server-side Emergency Stop
  if (settings.ai_emergency_stop) {
    return { allowed: false, reason: 'BLOCKED_BY_EMERGENCY_STOP: Emergency stop active. All mutations blocked.' };
  }

  // 4. Global AI Disabled
  if (!settings.ai_global_enabled || settings.ai_mode === 'OFF') {
    return { allowed: false, reason: 'AI operations are disabled by administrator.' };
  }

  // 5. Read-Only Mode
  if (settings.ai_mode === 'READ_ONLY') {
    return { allowed: false, reason: 'AI is operating in READ_ONLY mode. Mutation actions prohibited.' };
  }

  // 6. Assisted Mode (requires human approval for all mutations)
  if (settings.ai_mode === 'ASSISTED' && riskLevel >= 2) {
    return { allowed: false, requiresApproval: true, reason: 'ASSISTED mode requires admin approval before mutation execution.' };
  }

  // 7. Check Action Velocity Budget
  const budgetCheck = checkActionBudget(context.domain || 'general', riskLevel);
  if (!budgetCheck.allowed) {
    return { allowed: false, reason: budgetCheck.reason };
  }

  // 8. Risk Level 3 & 4 (Destructive / Critical) always require approval in background autonomous mode
  if (riskLevel >= 3) {
    return { allowed: false, requiresApproval: true, reason: `Action is classified as Risk Level ${riskLevel}. Human approval required.` };
  }

  return { allowed: true };
}

module.exports = {
  getControlSettings,
  updateControlSettings,
  canExecuteAction,
  recordActionUsage,
  checkActionBudget,
};
