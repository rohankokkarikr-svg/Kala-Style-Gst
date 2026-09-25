/**
 * backend/ai/aiControlCenter.js
 * ─────────────────────────────────────────────────────────────────
 * Central Autonomous Governance, Emergency Stop & Policy Controller.
 * 
 * Implements the authoritative single source of control for all AI operations:
 * - ai_global_enabled: Master switch for AI operations
 * - ai_autonomous_enabled: Allows automated background actions
 * - ai_emergency_stop: Immediate freeze on all mutation tools (Admin safety control)
 * - ai_mode: OFF | READ_ONLY | ASSISTED | AUTONOMOUS | FULL_AUTONOMOUS
 * - action_budget: Hourly and daily rate limits for autonomous operations
 * - domain_controls: Granular switches per domain subsystem
 * 
 * CRITICAL FIXES IMPLEMENTED:
 * 1. JSONB Boolean Bug Resolution: parseSafeBoolean handles true/false/"true"/"false"/1/0
 *    and prevents "false" -> Boolean("false") === true corruption.
 * 2. Native JSONB values saved directly to Supabase without double JSON.stringify.
 * 3. Domain normalization handles both string ("orders", "order") and object arguments.
 * 4. Authoritative gate evaluates Emergency Stop, Mode, Domain switches, Risk Levels, and Budgets.
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');

const CONTROL_KEY = 'ai_control_center_state';

/**
 * Robust Boolean parser preventing the JSONB string "false" -> true bug.
 * Supports legacy formats: true, false, "true", "false", '"true"', '"false"', 1, 0.
 */
function parseSafeBoolean(val, defaultVal = false) {
  if (val === true || val === false) return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const cleaned = val.trim().toLowerCase().replace(/['"]/g, '');
    if (cleaned === 'true' || cleaned === '1' || cleaned === 'yes' || cleaned === 'on') return true;
    if (cleaned === 'false' || cleaned === '0' || cleaned === 'no' || cleaned === 'off') return false;
  }
  return defaultVal;
}

/**
 * Standardize domain names whether passed as singular/plural or inside an object.
 */
function normalizeDomain(input) {
  let domain = 'general';
  if (typeof input === 'string') {
    domain = input;
  } else if (typeof input === 'object' && input !== null) {
    domain = input.domain || input.entityType || input.toolDomain || input.agent || 'general';
  }
  domain = String(domain).toLowerCase().trim();
  if (domain === 'orders' || domain === 'order') return 'order';
  if (domain === 'notifications' || domain === 'notification') return 'notification';
  if (domain === 'shippings' || domain === 'shipping' || domain === 'shipment' || domain === 'shipments') return 'shipping';
  if (domain === 'campaigns' || domain === 'campaign' || domain === 'marketing') return 'campaign';
  if (domain === 'products' || domain === 'product') return 'product';
  if (domain === 'artisans' || domain === 'artisan') return 'artisan';
  if (domain === 'payments' || domain === 'payment') return 'payment';
  if (domain === 'reviews' || domain === 'review') return 'review';
  if (domain === 'complaints' || domain === 'complaint') return 'complaint';
  if (domain === 'inventory' || domain === 'stock') return 'inventory';
  return domain;
}

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
    max_shipping_actions_per_hour: 20,
    max_campaign_actions_per_day: 5,
  },
  domain_controls: {
    orders_enabled: true,
    fraud_detection_enabled: true,
    payments_enabled: true,
    products_enabled: true,
    inventory_enabled: true,
    artisans_enabled: true,
    shipping_enabled: true,
    reviews_enabled: true,
    complaints_enabled: true,
    customers_enabled: true,
    marketing_enabled: true,
    notifications_enabled: true,
    reports_enabled: true,
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
 * Fetch control settings from database with resilient boolean parsing.
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
        .in('key', [
          'ai_global_enabled',
          'ai_autonomous_enabled',
          'ai_emergency_stop',
          'ai_mode',
          'action_budget',
          'domain_controls',
        ])
    );

    if (!error && Array.isArray(data) && data.length > 0) {
      for (const row of data) {
        if (row.key === 'ai_global_enabled') {
          activeSettings.ai_global_enabled = parseSafeBoolean(row.value, true);
        }
        if (row.key === 'ai_autonomous_enabled') {
          activeSettings.ai_autonomous_enabled = parseSafeBoolean(row.value, true);
        }
        if (row.key === 'ai_emergency_stop') {
          activeSettings.ai_emergency_stop = parseSafeBoolean(row.value, false);
        }
        if (row.key === 'ai_mode') {
          const raw = typeof row.value === 'string' ? row.value.replace(/['"]/g, '').toUpperCase().trim() : String(row.value);
          const validModes = ['OFF', 'READ_ONLY', 'ASSISTED', 'AUTONOMOUS', 'FULL_AUTONOMOUS'];
          if (validModes.includes(raw)) activeSettings.ai_mode = raw;
        }
        if (row.key === 'action_budget') {
          let budget = row.value;
          if (typeof budget === 'string') {
            try { budget = JSON.parse(budget); } catch (e) {}
          }
          if (typeof budget === 'object' && budget !== null) {
            activeSettings.action_budget = { ...activeSettings.action_budget, ...budget };
          }
        }
        if (row.key === 'domain_controls') {
          let domains = row.value;
          if (typeof domains === 'string') {
            try { domains = JSON.parse(domains); } catch (e) {}
          }
          if (typeof domains === 'object' && domains !== null) {
            activeSettings.domain_controls = { ...activeSettings.domain_controls, ...domains };
          }
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
 * Saves native JSONB values to Postgres without double stringification.
 */
async function updateControlSettings(updates = {}, adminId = null) {
  const current = await getControlSettings(true);
  const next = { ...current };

  if (updates.ai_global_enabled !== undefined) {
    next.ai_global_enabled = parseSafeBoolean(updates.ai_global_enabled, true);
  }
  if (updates.ai_autonomous_enabled !== undefined) {
    next.ai_autonomous_enabled = parseSafeBoolean(updates.ai_autonomous_enabled, true);
  }
  if (updates.ai_emergency_stop !== undefined) {
    next.ai_emergency_stop = parseSafeBoolean(updates.ai_emergency_stop, false);
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
  if (typeof updates.domain_controls === 'object' && updates.domain_controls !== null) {
    next.domain_controls = { ...next.domain_controls, ...updates.domain_controls };
  }

  activeSettings = { ...next, last_loaded_at: Date.now() };

  // Persist directly as native JSONB values to PostgreSQL Supabase
  try {
    const memoryRows = [
      { memory_type: 'control', key: 'ai_global_enabled', value: next.ai_global_enabled, updated_at: new Date().toISOString() },
      { memory_type: 'control', key: 'ai_autonomous_enabled', value: next.ai_autonomous_enabled, updated_at: new Date().toISOString() },
      { memory_type: 'control', key: 'ai_emergency_stop', value: next.ai_emergency_stop, updated_at: new Date().toISOString() },
      { memory_type: 'control', key: 'ai_mode', value: next.ai_mode, updated_at: new Date().toISOString() },
      { memory_type: 'control', key: 'action_budget', value: next.action_budget, updated_at: new Date().toISOString() },
      { memory_type: 'control', key: 'domain_controls', value: next.domain_controls, updated_at: new Date().toISOString() },
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
function checkActionBudget(domainInput = 'general', riskLevel = 2) {
  pruneActionLog();
  const domain = normalizeDomain(domainInput);
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const actionsLastHour = actionLog.filter(a => a.timestamp >= oneHourAgo).length;
  const orderActionsLastHour = actionLog.filter(a => a.timestamp >= oneHourAgo && a.domain === 'order').length;
  const shippingActionsLastHour = actionLog.filter(a => a.timestamp >= oneHourAgo && a.domain === 'shipping').length;
  const notificationActionsLastHour = actionLog.filter(a => a.timestamp >= oneHourAgo && a.domain === 'notification').length;
  const campaignActionsLastDay = actionLog.filter(a => a.timestamp >= oneDayAgo && a.domain === 'campaign').length;

  const budget = activeSettings.action_budget || {};

  const maxTotalPerHour = budget.max_actions_per_hour || 60;
  const maxOrdersPerHour = budget.max_order_actions_per_hour || 20;
  const maxShippingPerHour = budget.max_shipping_actions_per_hour || 20;
  const maxNotificationsPerHour = budget.max_notifications_per_hour || 30;
  const maxCampaignsPerDay = budget.max_campaign_actions_per_day || 5;

  if (actionsLastHour >= maxTotalPerHour) {
    return { allowed: false, reason: `Hourly autonomous action limit reached (${actionsLastHour}/${maxTotalPerHour})` };
  }
  if (domain === 'order' && orderActionsLastHour >= maxOrdersPerHour) {
    return { allowed: false, reason: `Hourly order mutation limit reached (${orderActionsLastHour}/${maxOrdersPerHour})` };
  }
  if (domain === 'shipping' && shippingActionsLastHour >= maxShippingPerHour) {
    return { allowed: false, reason: `Hourly shipping mutation limit reached (${shippingActionsLastHour}/${maxShippingPerHour})` };
  }
  if (domain === 'notification' && notificationActionsLastHour >= maxNotificationsPerHour) {
    return { allowed: false, reason: `Hourly notification limit reached (${notificationActionsLastHour}/${maxNotificationsPerHour})` };
  }
  if (domain === 'campaign' && campaignActionsLastDay >= maxCampaignsPerDay) {
    return { allowed: false, reason: `Daily marketing campaign limit reached (${campaignActionsLastDay}/${maxCampaignsPerDay})` };
  }

  return { allowed: true };
}

/**
 * Record a completed mutation in the action velocity tracker.
 * Accepts string domain ('order', 'orders', 'shipping') or object ({ domain: '...' }).
 */
function recordActionUsage(domainInput = 'general') {
  const domain = normalizeDomain(domainInput);
  actionLog.push({ timestamp: Date.now(), domain });
  pruneActionLog();
}

/**
 * Authoritative Policy & Permission Gate.
 * Evaluates whether a tool execution is permitted under current settings and policy.
 *
 * @param {string|object} param1 - toolName or full context object
 * @param {number} param2 - riskLevel (1: Read-only, 2: Controlled mutation, 3: High risk, 4: Critical)
 * @param {object} param3 - context ({ eventType, adminId, isChatDirective, domain })
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
  const domain = normalizeDomain(context.domain || toolName);

  // 1. Read-only tools (Risk Level 1) are always allowed unless global AI is completely OFF
  if (riskLevel === 1) {
    if (!settings.ai_global_enabled && settings.ai_mode === 'OFF') {
      return { allowed: false, reason: 'AI operations are globally disabled by administrator.' };
    }
    return { allowed: true };
  }

  // 2. Direct Admin Chat Directives explicitly issued by authenticated admin in interactive chat
  if (context.eventType === 'ADMIN_CHAT_DIRECTIVE' || context.isChatDirective) {
    // If emergency stop is active, even chat directives cannot perform autonomous mutations
    if (settings.ai_emergency_stop) {
      return { allowed: false, reason: 'BLOCKED_BY_EMERGENCY_STOP: Emergency stop active. All mutation operations frozen.' };
    }
    return { allowed: true };
  }

  // 3. Server-side Emergency Stop (Stops ALL mutations immediately)
  if (settings.ai_emergency_stop) {
    return { allowed: false, reason: 'BLOCKED_BY_EMERGENCY_STOP: Emergency stop active. All mutations blocked.' };
  }

  // 4. Global AI Disabled
  if (!settings.ai_global_enabled || settings.ai_mode === 'OFF') {
    return { allowed: false, reason: 'AI operations are disabled by administrator.' };
  }

  // 5. Read-Only Mode (Prohibits all mutations)
  if (settings.ai_mode === 'READ_ONLY') {
    return { allowed: false, reason: 'AI is operating in READ_ONLY mode. Mutation actions prohibited.' };
  }

  // 6. Granular Domain Controls
  const domainSwitches = settings.domain_controls || {};
  if (domain === 'order' && domainSwitches.orders_enabled === false) {
    return { allowed: false, reason: 'Order autonomous operations are disabled in Admin Settings.' };
  }
  if (domain === 'shipping' && domainSwitches.shipping_enabled === false) {
    return { allowed: false, reason: 'Shipping autonomous operations are disabled in Admin Settings.' };
  }
  if (domain === 'product' && domainSwitches.products_enabled === false) {
    return { allowed: false, reason: 'Product autonomous operations are disabled in Admin Settings.' };
  }
  if (domain === 'artisan' && domainSwitches.artisans_enabled === false) {
    return { allowed: false, reason: 'Artisan autonomous operations are disabled in Admin Settings.' };
  }
  if (domain === 'review' && domainSwitches.reviews_enabled === false) {
    return { allowed: false, reason: 'Review autonomous operations are disabled in Admin Settings.' };
  }
  if (domain === 'complaint' && domainSwitches.complaints_enabled === false) {
    return { allowed: false, reason: 'Complaint autonomous operations are disabled in Admin Settings.' };
  }
  if (domain === 'campaign' && domainSwitches.marketing_enabled === false) {
    return { allowed: false, reason: 'Marketing autonomous operations are disabled in Admin Settings.' };
  }

  // 7. Assisted Mode (requires human approval for all mutations)
  if (settings.ai_mode === 'ASSISTED' && riskLevel >= 2) {
    return { allowed: false, requiresApproval: true, reason: 'ASSISTED mode requires admin approval before mutation execution.' };
  }

  // 8. Check Action Velocity Budget
  const budgetCheck = checkActionBudget(domain, riskLevel);
  if (!budgetCheck.allowed) {
    return { allowed: false, reason: budgetCheck.reason };
  }

  // 9. Risk Level 3 & 4 (High Risk / Critical / Destructive) always require human approval in background autonomous mode
  if (riskLevel >= 3 && settings.ai_mode !== 'FULL_AUTONOMOUS') {
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
  parseSafeBoolean,
  normalizeDomain,
};
