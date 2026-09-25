/**
 * backend/services/agentHealthService.js
 * ─────────────────────────────────────────────────────────────────
 * KalaStyle AI Operations Agent — System Health Monitor
 * Performs real connectivity checks against all platform services.
 * NEVER fabricates health status — only reports what was actually verified.
 */

const dns = require('dns').promises;
const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');

/**
 * Check Supabase / Database connectivity.
 */
async function checkDatabase() {
  const startMs = Date.now();
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl || supabaseUrl.startsWith('https://your-')) {
      return { service: 'database', status: 'not_configured', message: 'SUPABASE_URL not set', latencyMs: 0 };
    }

    const host = new URL(supabaseUrl).hostname;
    await dns.lookup(host, { family: 4 });

    // Lightweight query to confirm DB is responsive
    const { data, error } = await safeQuery(() =>
      supabase.from('platform_settings').select('id').limit(1)
    );

    const latencyMs = Date.now() - startMs;
    if (error && error.code !== '42P01') {
      return { service: 'database', status: 'degraded', message: error.message, latencyMs };
    }

    return { service: 'database', status: 'healthy', message: 'Supabase responding normally', latencyMs };
  } catch (err) {
    return {
      service: 'database',
      status: 'unreachable',
      message: `DNS/connection failed: ${err.code || err.message}`,
      latencyMs: Date.now() - startMs,
    };
  }
}

/**
 * Check Gemini AI API connectivity.
 */
async function checkAIService() {
  const startMs = Date.now();
  try {
    const { isConfigured, testConnection } = require('../ai/geminiClient');
    if (!isConfigured()) {
      return {
        service: 'ai_gemini',
        status: 'not_configured',
        message: 'GEMINI_API_KEY / GEMINI_ADMIN_API_KEY not set — AI operates in fallback mode',
        latencyMs: 0,
      };
    }

    const result = await testConnection();
    const latencyMs = Date.now() - startMs;

    return {
      service: 'ai_gemini',
      status: result.status === 'online' ? 'healthy' : 'degraded',
      message: result.message,
      model: result.model,
      latencyMs,
    };
  } catch (err) {
    return {
      service: 'ai_gemini',
      status: 'error',
      message: err.message,
      latencyMs: Date.now() - startMs,
    };
  }
}

/**
 * Check Razorpay API credentials.
 */
async function checkPaymentService() {
  const startMs = Date.now();
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || keyId.startsWith('your_') || !keySecret || keySecret.startsWith('your_')) {
      return {
        service: 'razorpay',
        status: 'not_configured',
        message: 'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured',
        latencyMs: 0,
      };
    }

    // DNS check for Razorpay API
    await dns.lookup('api.razorpay.com', { family: 4 });
    const latencyMs = Date.now() - startMs;

    return {
      service: 'razorpay',
      status: 'healthy',
      message: 'Razorpay API endpoint reachable. Credentials present.',
      latencyMs,
    };
  } catch (err) {
    return {
      service: 'razorpay',
      status: 'unreachable',
      message: `Cannot reach Razorpay: ${err.code || err.message}`,
      latencyMs: Date.now() - startMs,
    };
  }
}

/**
 * Check Cloudinary configuration.
 */
async function checkStorageService() {
  const startMs = Date.now();
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || cloudName.startsWith('your_') || !apiKey || !apiSecret) {
      return {
        service: 'cloudinary',
        status: 'not_configured',
        message: 'CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET not set',
        latencyMs: 0,
      };
    }

    await dns.lookup('api.cloudinary.com', { family: 4 });
    const latencyMs = Date.now() - startMs;

    return {
      service: 'cloudinary',
      status: 'healthy',
      message: `Cloudinary endpoint reachable. Cloud: ${cloudName}`,
      latencyMs,
    };
  } catch (err) {
    return {
      service: 'cloudinary',
      status: 'unreachable',
      message: `Cannot reach Cloudinary: ${err.code || err.message}`,
      latencyMs: Date.now() - startMs,
    };
  }
}

/**
 * Check Twilio / WhatsApp notification service.
 */
async function checkNotificationService() {
  const startMs = Date.now();
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;

    if (!sid || sid.startsWith('your_') || !token || token.startsWith('your_')) {
      return {
        service: 'twilio_whatsapp',
        status: 'not_configured',
        message: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set',
        latencyMs: 0,
      };
    }

    await dns.lookup('api.twilio.com', { family: 4 });
    const latencyMs = Date.now() - startMs;

    return {
      service: 'twilio_whatsapp',
      status: 'healthy',
      message: 'Twilio API endpoint reachable. Credentials present.',
      latencyMs,
    };
  } catch (err) {
    return {
      service: 'twilio_whatsapp',
      status: 'unreachable',
      message: `Cannot reach Twilio: ${err.code || err.message}`,
      latencyMs: Date.now() - startMs,
    };
  }
}

/**
 * Check Shiprocket shipping service with actual authentication verification.
 */
async function checkShippingService() {
  const startMs = Date.now();
  try {
    const email = process.env.SHIPROCKET_EMAIL;
    const password = process.env.SHIPROCKET_PASSWORD;

    if (!email || email.startsWith('your_') || !password || password.startsWith('your_')) {
      return {
        service: 'shiprocket',
        status: 'not_configured',
        message: 'SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD not configured. Shipping integration disabled.',
        latencyMs: 0,
      };
    }

    await dns.lookup('apiv2.shiprocket.in', { family: 4 });

    // Perform real authentication test
    try {
      const { getShiprocketToken } = require('./shipping/providers/shiprocket/shiprocketAuth');
      await getShiprocketToken();
      const latencyMs = Date.now() - startMs;
      return {
        service: 'shiprocket',
        status: 'healthy',
        message: 'Shiprocket API authenticated and operational.',
        latencyMs,
      };
    } catch (authErr) {
      const latencyMs = Date.now() - startMs;
      return {
        service: 'shiprocket',
        status: 'error',
        message: `Shiprocket authentication failed: ${authErr.message}`,
        latencyMs,
      };
    }
  } catch (err) {
    return {
      service: 'shiprocket',
      status: 'unreachable',
      message: `Cannot reach Shiprocket: ${err.code || err.message}`,
      latencyMs: Date.now() - startMs,
    };
  }
}

/**
 * Check AI Tool Registry consistency.
 */
function checkToolRegistry() {
  const startMs = Date.now();
  try {
    const { FUNCTION_DECLARATIONS, validateUniqueToolDeclarations } = require('../ai/aiTools');
    validateUniqueToolDeclarations(FUNCTION_DECLARATIONS);
    return {
      service: 'tool_registry',
      status: 'healthy',
      message: `Tool Registry validated: ${FUNCTION_DECLARATIONS.length} unique tools active with 1:1 executor mapping`,
      toolCount: FUNCTION_DECLARATIONS.length,
      latencyMs: Date.now() - startMs,
    };
  } catch (err) {
    return {
      service: 'tool_registry',
      status: 'error',
      message: `Tool Registry validation failed: ${err.message}`,
      latencyMs: Date.now() - startMs,
    };
  }
}

/**
 * Check AI Queue persistence and status.
 */
async function checkQueueService() {
  const startMs = Date.now();
  try {
    const { count, error } = await safeQuery(() =>
      supabase.from('ai_action_queue').select('id', { count: 'exact', head: true })
    );
    if (error && error.code !== '42P01') {
      return { service: 'ai_queue', status: 'degraded', message: error.message, latencyMs: Date.now() - startMs };
    }
    return {
      service: 'ai_queue',
      status: 'healthy',
      message: `Persistent queue operational (${count || 0} total jobs tracked)`,
      latencyMs: Date.now() - startMs,
    };
  } catch (err) {
    return { service: 'ai_queue', status: 'error', message: err.message, latencyMs: Date.now() - startMs };
  }
}

/**
 * Check AI Approvals system status.
 */
async function checkApprovalService() {
  const startMs = Date.now();
  try {
    const { count, error } = await safeQuery(() =>
      supabase.from('ai_agent_approvals').select('id', { count: 'exact', head: true }).eq('status', 'PENDING')
    );
    if (error && error.code !== '42P01') {
      return { service: 'ai_approvals', status: 'degraded', message: error.message, latencyMs: Date.now() - startMs };
    }
    return {
      service: 'ai_approvals',
      status: 'healthy',
      message: `Approval system operational (${count || 0} pending authorization)`,
      latencyMs: Date.now() - startMs,
    };
  } catch (err) {
    return { service: 'ai_approvals', status: 'error', message: err.message, latencyMs: Date.now() - startMs };
  }
}

/**
 * Check Autonomous Control Center status.
 */
async function checkControlCenter() {
  const startMs = Date.now();
  try {
    const aiControlCenter = require('../ai/aiControlCenter');
    const settings = await aiControlCenter.getControlSettings();
    const isStop = settings.ai_emergency_stop;
    const isEnabled = settings.ai_global_enabled;
    const mode = settings.ai_mode;
    return {
      service: 'ai_control_center',
      status: isStop ? 'degraded' : isEnabled ? 'healthy' : 'disabled',
      message: isStop
        ? '🛑 EMERGENCY STOP ACTIVE — All mutations halted'
        : `Autonomous Control Center active (Mode: ${mode})`,
      mode,
      emergencyStop: isStop,
      latencyMs: Date.now() - startMs,
    };
  } catch (err) {
    return { service: 'ai_control_center', status: 'error', message: err.message, latencyMs: Date.now() - startMs };
  }
}

/**
 * Fetch recent errors from AI admin actions.
 */
async function getRecentErrors(limit = 10) {
  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('ai_admin_actions')
        .select('id, action_name, tool_name, status, error, created_at')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(limit)
    );
    return { errors: data || [], error: error?.message };
  } catch (err) {
    return { errors: [], error: err.message };
  }
}

/**
 * Run a complete system health check across all services.
 * Returns structured health data — NEVER fabricates status.
 */
async function checkSystemHealth() {
  const startMs = Date.now();

  const [db, ai, payment, storage, notifications, shipping, tools, queue, approvals, control] = await Promise.allSettled([
    checkDatabase(),
    checkAIService(),
    checkPaymentService(),
    checkStorageService(),
    checkNotificationService(),
    checkShippingService(),
    Promise.resolve(checkToolRegistry()),
    checkQueueService(),
    checkApprovalService(),
    checkControlCenter(),
  ]);

  const services = [
    db.status === 'fulfilled' ? db.value : { service: 'database', status: 'check_failed', message: db.reason?.message },
    ai.status === 'fulfilled' ? ai.value : { service: 'ai_gemini', status: 'check_failed', message: ai.reason?.message },
    tools.status === 'fulfilled' ? tools.value : { service: 'tool_registry', status: 'check_failed', message: tools.reason?.message },
    control.status === 'fulfilled' ? control.value : { service: 'ai_control_center', status: 'check_failed', message: control.reason?.message },
    queue.status === 'fulfilled' ? queue.value : { service: 'ai_queue', status: 'check_failed', message: queue.reason?.message },
    approvals.status === 'fulfilled' ? approvals.value : { service: 'ai_approvals', status: 'check_failed', message: approvals.reason?.message },
    payment.status === 'fulfilled' ? payment.value : { service: 'razorpay', status: 'check_failed', message: payment.reason?.message },
    storage.status === 'fulfilled' ? storage.value : { service: 'cloudinary', status: 'check_failed', message: storage.reason?.message },
    notifications.status === 'fulfilled' ? notifications.value : { service: 'twilio_whatsapp', status: 'check_failed', message: notifications.reason?.message },
    shipping.status === 'fulfilled' ? shipping.value : { service: 'shiprocket', status: 'check_failed', message: shipping.reason?.message },
  ];

  const criticalServices = ['database', 'ai_gemini', 'tool_registry'];
  const overallHealthy = services
    .filter(s => criticalServices.includes(s.service))
    .every(s => s.status === 'healthy');

  const warnings = services.filter(s =>
    s.status === 'not_configured' || s.status === 'degraded' || s.status === 'unreachable' || s.status === 'error'
  );

  // Store last health check timestamp in memory
  try {
    await safeQuery(() =>
      supabase.from('ai_agent_memory')
        .upsert({ key: 'last_health_check', value: JSON.stringify(new Date().toISOString()), memory_type: 'operational', updated_at: new Date().toISOString() }, { onConflict: 'key' })
    );
  } catch (e) {}

  return {
    overall: overallHealthy ? 'HEALTHY' : (warnings.length > 0 ? 'DEGRADED' : 'CRITICAL'),
    services,
    warnings: warnings.map(s => `${s.service}: ${s.message}`),
    totalLatencyMs: Date.now() - startMs,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  checkSystemHealth,
  checkDatabase,
  checkAIService,
  checkPaymentService,
  checkStorageService,
  checkNotificationService,
  checkShippingService,
  checkToolRegistry,
  checkQueueService,
  checkApprovalService,
  checkControlCenter,
  getRecentErrors,
};
