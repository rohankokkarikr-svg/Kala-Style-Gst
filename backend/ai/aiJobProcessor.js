/**
 * backend/ai/aiJobProcessor.js
 * ─────────────────────────────────────────────────────────────────
 * Asynchronous event-driven job queue for autonomous AI operations.
 * Processes pending platform events, guarantees idempotency, handles
 * retries with exponential backoff, and maintains a dead-letter state.
 * 
 * CRITICAL SAFETY ENFORCEMENT:
 * - Checks Emergency Stop and AI mode immediately before executing each job.
 * - Idempotency key is deterministic (${eventType}_${entityType}_${entityId}).
 * - Automation rules are loaded from persistent Supabase database.
 * - Retries follow exponential backoff (+30s, +2m, +10m) and are re-polled.
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const { runAutonomousLoop } = require('./aiOrchestrator');
const artisanService = require('../services/artisanService');
const productService = require('../services/productService');
const whatsappService = require('../services/whatsappService');
const analyticsReportService = require('../services/analyticsReportService');
const aiControlCenter = require('./aiControlCenter');
const { getAutomationRules, getInMemoryRules } = require('./aiToolExecutor');
const { v4: uuidv4 } = require('uuid');

let inMemoryQueue = [];
let isProcessing = false;

/**
 * Enqueue an autonomous operational job with deterministic idempotency.
 */
async function enqueueJob({
  eventType,
  entityType,
  entityId,
  payload = {},
  idempotencyKey = null,
  scheduledAt = new Date().toISOString(),
}) {
  // Deterministic idempotency key: same event + entity -> same job
  const key = idempotencyKey || `${eventType}_${entityType}_${entityId}`;

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
      if (existing.status === 'completed' || existing.status === 'succeeded') {
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
  if (memExisting) {
    return { success: true, message: 'Job already in queue (in-memory)', job: memExisting };
  }
  inMemoryQueue.push(job);

  return { success: true, job };
}

/**
 * Process a single autonomous operational job.
 */
async function processJob(job) {
  console.log(`⚡ [AI Job Processor] Processing job ${job.id} (${job.event_type}) for ${job.entity_type}:${job.entity_id}`);

  // Load persistent rules from Supabase (with fallback to in-memory)
  const rules = await getAutomationRules();
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
Experience: ${artisan.experience_years || 0} years
Bio / Craft Heritage: ${artisan.craft_description || artisan.bio || 'None provided'}
Please evaluate this profile. If legitimate Indian heritage craft, verify or hold for human review.`;

      const aiResponse = await runAutonomousLoop({
        userMessage: prompt,
        agentName: 'ARTISAN_ONBOARDING_AGENT',
        conversationId: `artisan-verify-${job.entity_id}`,
      });

      // Safe fallback: HOLD for human review if AI didn't take an action
      if (!aiResponse.success) {
        console.warn(`[AI Job Fallback] AI unavailable for artisan ${job.entity_id}. Applying HOLD/HUMAN_REVIEW safety policy.`);
        await safeQuery(() =>
          supabase
            .from('artisan_profiles')
            .update({ verification_status: 'under_review' })
            .eq('id', job.entity_id)
        );
        result = { fallback_applied: true, action: 'HOLD_HUMAN_REVIEW', artisan_id: job.entity_id };
      } else {
        result = aiResponse;
      }
      break;
    }

    case 'PRODUCT_SUBMITTED': {
      if (rules.product_auto_approval === false) {
        return { skipped: true, reason: 'product_auto_approval rule is disabled' };
      }

      const { data: product } = await safeQuery(() =>
        supabase.from('products').select('*').eq('id', job.entity_id).single()
      );
      if (!product) throw new Error(`Product ${job.entity_id} not found`);

      const prompt = `A new handcrafted product was submitted for catalog approval:
Title: ${product.name}
Category: ${product.category}
Price: ₹${product.price}
Description: ${product.description || 'N/A'}
Stock: ${product.stock_quantity || 0}
Please review quality, pricing, and craft authenticity. If approved, approve or hold for manual review.`;

      const aiResponse = await runAutonomousLoop({
        userMessage: prompt,
        agentName: 'PRODUCT_CATALOG_AGENT',
        conversationId: `product-approval-${job.entity_id}`,
      });

      // Safe fallback: HOLD for human review
      if (!aiResponse.success) {
        console.warn(`[AI Job Fallback] AI unavailable for product ${job.entity_id}. Holding product for human review.`);
        await safeQuery(() =>
          supabase
            .from('products')
            .update({ status: 'under_review', is_in_stock: false })
            .eq('id', job.entity_id)
        );
        result = { fallback_applied: true, action: 'HOLD_HUMAN_REVIEW', product_id: job.entity_id };
      } else {
        result = aiResponse;
      }
      break;
    }

    case 'ORDER_CREATED': {
      if (rules.order_auto_processing === false) {
        return { skipped: true, reason: 'order_auto_processing rule is disabled' };
      }

      const { data: order } = await safeQuery(() =>
        supabase.from('orders').select('*').eq('id', job.entity_id).single()
      );
      if (!order) throw new Error(`Order ${job.entity_id} not found`);

      const prompt = `New order #${order.id} placed:
Total: ₹${order.total_amount}
Payment Method: ${order.payment_method || 'COD'}
Shipping Address: ${JSON.stringify(order.shipping_address || {})}
Please analyze order risk using analyze_order_risk. If high risk, hold order; otherwise confirm.`;

      const aiResponse = await runAutonomousLoop({
        userMessage: prompt,
        agentName: 'ORDER_FULFILLMENT_AGENT',
        conversationId: `order-risk-${job.entity_id}`,
      });
      result = aiResponse;
      break;
    }

    case 'LOW_STOCK_DETECTED': {
      if (rules.inventory_monitoring === false) {
        return { skipped: true, reason: 'inventory_monitoring rule is disabled' };
      }

      const { data: product } = await safeQuery(() =>
        supabase.from('products').select('*').eq('id', job.entity_id).single()
      );
      if (!product) throw new Error(`Product ${job.entity_id} not found`);

      if (rules.whatsapp_notifications && product.artisan_id) {
        await whatsappService.sendNotification({
          userId: product.artisan_id,
          type: 'LOW_STOCK_ALERT',
          data: {
            productName: product.name,
            currentStock: product.stock_quantity || 0,
            threshold: 5,
          },
        });
      }
      result = { stock_alert_sent: true, product_id: product.id, stock: product.stock_quantity };
      break;
    }

    case 'DAILY_REPORT': {
      if (rules.daily_ai_report === false) {
        return { skipped: true, reason: 'daily_ai_report rule is disabled' };
      }

      const domainAgents = require('./domainAgents');
      const sweepResult = await domainAgents.runAutonomousDailySweep();
      result = sweepResult;
      break;
    }

    case 'WEEKLY_REPORT': {
      const report = await analyticsReportService.generateWeeklyReport();
      result = report;
      break;
    }

    case 'REVIEW_CREATED': {
      if (rules.review_moderation === false) {
        return { skipped: true, reason: 'review_moderation rule is disabled' };
      }
      const { data: review } = await safeQuery(() =>
        supabase.from('reviews').select('*').eq('id', job.entity_id).maybeSingle()
      );
      if (review) {
        const text = (review.review_text || review.comment || '').toLowerCase();
        const isAbusive = ['fraud', 'scam', 'fake', 'abuse', 'stupid', 'bastard'].some(w => text.includes(w));
        if (isAbusive) {
          await safeQuery(() =>
            supabase.from('reviews').update({ status: 'flagged' }).eq('id', review.id)
          );
          result = { review_flagged: true, id: review.id, reason: 'Abusive language detected' };
        } else {
          result = { review_clean: true, id: review.id };
        }
      }
      break;
    }

    case 'COMPLAINT_CREATED': {
      if (rules.complaint_sentinel === false) {
        return { skipped: true, reason: 'complaint_sentinel rule is disabled' };
      }
      const { data: complaint } = await safeQuery(() =>
        supabase.from('reports').select('*').eq('id', job.entity_id).maybeSingle()
      );
      if (complaint) {
        const reason = (complaint.reason || '').toLowerCase();
        const isUrgent = reason.includes('urgent') || reason.includes('fraud') || reason.includes('stolen');
        result = { complaint_analyzed: true, id: complaint.id, urgent: isUrgent };
      }
      break;
    }

    case 'SHIPMENT_DELAYED': {
      if (rules.shipping_sentinel === false) {
        return { skipped: true, reason: 'shipping_sentinel rule is disabled' };
      }
      const shippingService = require('../services/shipping/shippingService');
      const shipResult = await shippingService.trackShipmentByShipmentId(job.entity_id);
      result = { shipment_monitored: true, tracking: shipResult };
      break;
    }

    default:
      console.log(`ℹ️ [AI Job Processor] Handled generic event: ${job.event_type}`);
      result = { handled: true };
  }

  return result;
}

/**
 * Execute one cycle of pending jobs from database and in-memory queue.
 * Strict safety check: Emergency Stop & AI Mode evaluated BEFORE every job execution.
 */
async function processPendingJobs() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // 1. Initial Gate Check: Do not process queue if AI is disabled or Emergency Stop is active
    const globalSettings = await aiControlCenter.getControlSettings();
    if (globalSettings.ai_emergency_stop) {
      console.warn('🛑 [AI Job Processor] Queue processing paused: ai_emergency_stop is ACTIVE.');
      return;
    }

    if (!globalSettings.ai_global_enabled || globalSettings.ai_mode === 'OFF') {
      return;
    }

    // 2. Fetch pending or retrying jobs due for execution from Supabase
    let dbJobs = [];
    try {
      const { data, error } = await safeQuery(() =>
        supabase
          .from('ai_action_queue')
          .select('*')
          .in('status', ['pending', 'retrying'])
          .lte('scheduled_at', new Date().toISOString())
          .order('priority', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(10)
      );
      if (!error && data) dbJobs = data;
    } catch (e) {}

    // Combine with pending in-memory jobs
    const memJobs = inMemoryQueue.filter(j => 
      (j.status === 'pending' || j.status === 'retrying') &&
      (!j.scheduled_at || new Date(j.scheduled_at) <= new Date())
    );
    const jobsToProcess = [...dbJobs, ...memJobs];

    for (const job of jobsToProcess) {
      // Re-check Emergency Stop and Mode immediately BEFORE executing each job
      const freshSettings = await aiControlCenter.getControlSettings(true);
      if (freshSettings.ai_emergency_stop) {
        console.warn(`🛑 [AI Job Processor] Emergency stop activated while processing queue. Halting job ${job.id}.`);
        break; // Stop immediately, leave remaining jobs pending
      }

      if (!freshSettings.ai_global_enabled || freshSettings.ai_mode === 'OFF') {
        break;
      }

      // Read-Only mode skips all mutating jobs
      if (freshSettings.ai_mode === 'READ_ONLY' && job.event_type !== 'DAILY_REPORT' && job.event_type !== 'WEEKLY_REPORT') {
        console.log(`ℹ️ [AI Job Processor] READ_ONLY mode active. Skipping mutation job ${job.id} (${job.event_type})`);
        continue;
      }

      // Check Central Policy Gate for this job's domain
      const gateCheck = await aiControlCenter.canExecuteAction(job.event_type, 2, {
        domain: job.event_type,
        entityType: job.entity_type,
        entityId: job.entity_id,
        jobId: job.id,
      });

      if (!gateCheck.allowed) {
        if (gateCheck.requiresApproval) {
          console.warn(`🛡️ [AI Job Processor] Job ${job.id} requires human approval. Setting status to waiting_approval.`);
          job.status = 'waiting_approval';
          try {
            await safeQuery(() =>
              supabase.from('ai_action_queue').update({ status: 'waiting_approval' }).eq('id', job.id)
            );
          } catch (e) {}
        } else {
          console.warn(`⏳ [AI Job Processor] Job ${job.id} paused by policy: ${gateCheck.reason}`);
        }
        continue;
      }

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
          // Exponential backoff: attempt 1 -> 30s, attempt 2 -> 120s (2m), attempt 3 -> 600s (10m)
          const backoffSec = job.attempts === 1 ? 30 : job.attempts === 2 ? 120 : 600;
          job.scheduled_at = new Date(Date.now() + backoffSec * 1000).toISOString();
        }

        try {
          await safeQuery(() =>
            supabase.from('ai_action_queue').update({
              status: job.status,
              attempts: job.attempts,
              scheduled_at: job.scheduled_at,
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
