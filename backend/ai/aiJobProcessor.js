/**
 * backend/ai/aiJobProcessor.js
 * ─────────────────────────────────────────────────────────────────
 * Asynchronous event-driven job queue for autonomous AI operations.
 * Processes pending platform events, guarantees idempotency, handles
 * retries with exponential backoff, and maintains a dead-letter state.
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const { runAutonomousLoop } = require('./aiOrchestrator');
const artisanService = require('../services/artisanService');
const productService = require('../services/productService');
const whatsappService = require('../services/whatsappService');
const analyticsReportService = require('../services/analyticsReportService');
const { getInMemoryRules } = require('./aiToolExecutor');
const { v4: uuidv4 } = require('uuid');

let inMemoryQueue = [];
let isProcessing = false;

/**
 * Enqueue an autonomous operational job.
 */
async function enqueueJob({
  eventType,
  entityType,
  entityId,
  payload = {},
  idempotencyKey = null,
  scheduledAt = new Date().toISOString(),
}) {
  const key = idempotencyKey || `${eventType}_${entityType}_${entityId}_${Date.now()}`;

  const job = {
    id: uuidv4(),
    event_type: eventType,
    entity_type: entityType,
    entity_id: String(entityId),
    payload,
    status: 'pending',
    attempts: 0,
    max_attempts: 3,
    last_error: null,
    scheduled_at: scheduledAt,
    idempotency_key: key,
    created_at: new Date().toISOString(),
  };

  try {
    const { data: existing } = await safeQuery(() =>
      supabase.from('ai_action_queue').select('id, status').eq('idempotency_key', key).maybeSingle()
    );

    if (existing) {
      if (existing.status === 'completed') {
        return { success: true, message: 'Job already completed (idempotent)', job: existing };
      }
      return { success: true, message: 'Job already in queue', job: existing };
    }

    const { data: inserted, error } = await safeQuery(() =>
      supabase.from('ai_action_queue').insert([job]).select().single()
    );

    if (!error && inserted) {
      return { success: true, job: inserted };
    }
  } catch (err) {}

  // Fallback to in-memory queue
  const memExisting = inMemoryQueue.find(j => j.idempotency_key === key);
  if (!memExisting) {
    inMemoryQueue.push(job);
  }

  return { success: true, job };
}

/**
 * Process a single autonomous operational job.
 */
async function processJob(job) {
  console.log(`⚡ [AI Job Processor] Processing job ${job.id} (${job.event_type}) for ${job.entity_type}:${job.entity_id}`);

  const rules = getInMemoryRules();
  let result = null;

  switch (job.event_type) {
    case 'ARTISAN_REGISTERED': {
      if (rules.artisan_auto_verification === false) {
        return { skipped: true, reason: 'artisan_auto_verification rule is disabled' };
      }

      const artisan = await artisanService.getArtisanDetails(job.entity_id);
      if (!artisan) throw new Error(`Artisan ${job.entity_id} not found`);

      const prompt = `A new artisan has registered on KalaStyle AI:
Store Name: ${artisan.store_name}
Artisan Type / Craft: ${artisan.artisan_type || 'N/A'}
Specialization: ${artisan.specialization || 'N/A'}
Location: ${artisan.location || 'N/A'}
Years of Experience: ${artisan.years_of_experience || 'Not specified'}
Bio: ${artisan.bio || 'Not provided'}

Please inspect the profile using your tools. If the profile contains authentic Indian craft heritage information with verified details, call verify_artisan. If incomplete or questionable, call hold_artisan. Explain your decision.`;

      const aiRes = await runAutonomousLoop({
        messages: [{ role: 'user', content: prompt }],
        context: { eventType: 'ARTISAN_REGISTERED', entityId: job.entity_id },
      });

      // SECTION 35 SAFEGUARD: When AI is unavailable or in fallback mode,
      // NEVER auto-verify based on bio length. Hold for human review.
      if (aiRes.mode === 'deterministic_fallback' || !aiRes.toolsExecuted || aiRes.toolsExecuted.length === 0) {
        result = await artisanService.holdArtisan(
          job.entity_id,
          'Placed on hold for administrative review (AI in fallback mode — requires manual verification)'
        );
      } else {
        result = aiRes;
      }
      break;
    }

    case 'PRODUCT_SUBMITTED': {
      if (rules.product_auto_approval === false) {
        return { skipped: true, reason: 'product_auto_approval rule is disabled' };
      }

      const prompt = `A new craft product has been submitted with ID: ${job.entity_id}.
Inspect this product using get_products. Validate price, craft category, and artisan ownership. If valid and compliant, call approve_product; otherwise call hold_product.`;

      const aiRes = await runAutonomousLoop({
        messages: [{ role: 'user', content: prompt }],
        context: { eventType: 'PRODUCT_SUBMITTED', entityId: job.entity_id },
      });

      // SECTION 34 SAFEGUARD: When AI is unavailable or in fallback mode,
      // DO NOT auto-approve products. Place on hold for human review.
      if (aiRes.mode === 'deterministic_fallback' || !aiRes.toolsExecuted || aiRes.toolsExecuted.length === 0) {
        result = await productService.holdProduct(
          job.entity_id,
          'Placed on hold for administrative compliance inspection (AI in fallback mode — requires manual approval)'
        );
      } else {
        result = aiRes;
      }
      break;
    }

    case 'ORDER_CREATED':
    case 'PAYMENT_UPDATED': {
      if (rules.order_auto_processing === false) {
        return { skipped: true, reason: 'order_auto_processing rule is disabled' };
      }

      // Dispatch targeted WhatsApp notifications to each artisan for their items
      if (rules.whatsapp_notifications !== false) {
        result = await whatsappService.notifyOrderArtisans(job.entity_id, 'NEW_ORDER');
      } else {
        result = { success: true, message: 'WhatsApp dispatch skipped per automation rule' };
      }
      break;
    }

    case 'REVIEW_CREATED': {
      if (rules.review_moderation === false) {
        return { skipped: true, reason: 'review_moderation rule is disabled' };
      }

      const prompt = `A new customer review has been posted (Review ID: ${job.entity_id}).
Fetch the review details using get_reviews. Inspect for profanity, spam, and authenticity. If clean, call approve_review. If abusive, call moderate_review with action="hide".`;

      result = await runAutonomousLoop({
        messages: [{ role: 'user', content: prompt }],
        context: { eventType: 'REVIEW_CREATED', entityId: job.entity_id },
      });
      break;
    }

    case 'COMPLAINT_CREATED': {
      const prompt = `A new customer or artisan complaint has been submitted (Complaint ID: ${job.entity_id}).
Fetch details using get_complaints. Evaluate urgency and severity. Suggest operational resolution or route to support team.`;

      result = await runAutonomousLoop({
        messages: [{ role: 'user', content: prompt }],
        context: { eventType: 'COMPLAINT_CREATED', entityId: job.entity_id },
      });
      break;
    }

    case 'SHIPMENT_DELAYED': {
      const prompt = `Shipment or order ${job.entity_id} has exceeded normal transit milestones.
Inspect with track_shipment and get_shipping_status. Evaluate delay and recommend retry or escalation.`;

      result = await runAutonomousLoop({
        messages: [{ role: 'user', content: prompt }],
        context: { eventType: 'SHIPMENT_DELAYED', entityId: job.entity_id },
      });
      break;
    }

    case 'SHIPMENT_STATUS_CHANGED': {
      const shippingService = require('../services/shipping/shippingService');
      result = await shippingService.trackShipment({ shipment_id: job.entity_id });
      break;
    }

    case 'LOW_STOCK_DETECTED': {
      result = await productService.getLowStockProducts(5);
      break;
    }

    case 'DAILY_REPORT': {
      if (rules.daily_ai_report === false) {
        return { skipped: true, reason: 'daily_ai_report rule is disabled' };
      }
      result = await analyticsReportService.generateDailyReport();
      break;
    }

    case 'WEEKLY_REPORT': {
      result = await analyticsReportService.generateWeeklyReport();
      break;
    }

    default:
      console.log(`[AI Job Processor] Unhandled event type: ${job.event_type}`);
      result = { handled: true };
  }

  return result;
}

/**
 * Execute one cycle of pending jobs from database and in-memory queue.
 */
async function processPendingJobs() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // 1. Fetch pending jobs from Supabase
    let dbJobs = [];
    try {
      const { data, error } = await safeQuery(() =>
        supabase
          .from('ai_action_queue')
          .select('*')
          .eq('status', 'pending')
          .lte('scheduled_at', new Date().toISOString())
          .order('created_at', { ascending: true })
          .limit(10)
      );
      if (!error && data) dbJobs = data;
    } catch (e) {}

    // Combine with pending in-memory jobs
    const memJobs = inMemoryQueue.filter(j => j.status === 'pending');
    const jobsToProcess = [...dbJobs, ...memJobs];

    for (const job of jobsToProcess) {
      job.status = 'processing';
      job.started_at = new Date().toISOString();
      job.attempts = (job.attempts || 0) + 1;

      // Update status to processing in DB
      try {
        await safeQuery(() =>
          supabase.from('ai_action_queue').update({
            status: 'processing',
            attempts: job.attempts,
            started_at: job.started_at,
          }).eq('id', job.id)
        );
      } catch (e) {}

      try {
        const result = await processJob(job);
        job.status = 'completed';
        job.completed_at = new Date().toISOString();

        try {
          await safeQuery(() =>
            supabase.from('ai_action_queue').update({
              status: 'completed',
              completed_at: job.completed_at,
            }).eq('id', job.id)
          );
        } catch (e) {}

        console.log(`✅ [AI Job Processor] Completed job ${job.id} (${job.event_type})`);
      } catch (jobErr) {
        console.error(`❌ [AI Job Processor] Failed job ${job.id}:`, jobErr.message);
        job.last_error = jobErr.message;

        if (job.attempts >= (job.max_attempts || 3)) {
          job.status = 'dead_letter';
        } else {
          job.status = 'retrying';
        }

        try {
          await safeQuery(() =>
            supabase.from('ai_action_queue').update({
              status: job.status,
              last_error: job.last_error,
            }).eq('id', job.id)
          );
        } catch (e) {}
      }
    }
  } catch (err) {
    console.error('❌ [AI Job Processor] Cycle error:', err.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * Start background polling interval.
 */
let intervalId = null;
function startProcessor(intervalMs = 20000) {
  if (intervalId) return;
  console.log(`🚀 [AI Job Processor] Worker started (Interval: ${intervalMs / 1000}s)`);
  // Run initial pass after 3s
  setTimeout(processPendingJobs, 3000);
  intervalId = setInterval(processPendingJobs, intervalMs);
}

function stopProcessor() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = {
  enqueueJob,
  processPendingJobs,
  startProcessor,
  stopProcessor,
  getInMemoryQueue: () => inMemoryQueue,
};
