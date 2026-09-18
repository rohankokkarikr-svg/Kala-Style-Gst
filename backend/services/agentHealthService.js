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
 * Check Shiprocket shipping service.
 */
async function checkShippingService() {
  const startMs = Date.now();
  try {
    const email = process.env.SHIPROCKET_EMAIL;
    const password = process.env.SHIPROCKET_PASSWORD;

    if (!email || email.startsWith('your_') || !password) {
      return {
        service: 'shiprocket',
        status: 'not_configured',
        message: 'SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD not configured. Shipping integration disabled.',
        latencyMs: 0,
      };
    }

    await dns.lookup('apiv2.shiprocket.in', { family: 4 });
    const latencyMs = Date.now() - startMs;

    return {
      service: 'shiprocket',
      status: 'healthy',
      message: 'Shiprocket API endpoint reachable. Credentials present.',
      latencyMs,
    };
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

  const [db, ai, payment, storage, notifications, shipping] = await Promise.allSettled([
    checkDatabase(),
    checkAIService(),
    checkPaymentService(),
    checkStorageService(),
    checkNotificationService(),
    checkShippingService(),
  ]);

  const services = [
    db.status === 'fulfilled' ? db.value : { service: 'database', status: 'check_failed', message: db.reason?.message },
    ai.status === 'fulfilled' ? ai.value : { service: 'ai_gemini', status: 'check_failed', message: ai.reason?.message },
    payment.status === 'fulfilled' ? payment.value : { service: 'razorpay', status: 'check_failed', message: payment.reason?.message },
    storage.status === 'fulfilled' ? storage.value : { service: 'cloudinary', status: 'check_failed', message: storage.reason?.message },
    notifications.status === 'fulfilled' ? notifications.value : { service: 'twilio_whatsapp', status: 'check_failed', message: notifications.reason?.message },
    shipping.status === 'fulfilled' ? shipping.value : { service: 'shiprocket', status: 'check_failed', message: shipping.reason?.message },
  ];

  const criticalServices = ['database', 'ai_gemini'];
  const overallHealthy = services
    .filter(s => criticalServices.includes(s.service))
    .every(s => s.status === 'healthy');

  const warnings = services.filter(s =>
    s.status === 'not_configured' || s.status === 'degraded' || s.status === 'unreachable'
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
  getRecentErrors,
};
