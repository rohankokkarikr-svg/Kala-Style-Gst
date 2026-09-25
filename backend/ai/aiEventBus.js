/**
 * backend/ai/aiEventBus.js
 * ─────────────────────────────────────────────────────────────────
 * Lightweight internal event emitter for KalaStyle AI business events.
 * Bridges application domain controllers with the autonomous AI job processor.
 */

const { enqueueJob, processPendingJobs } = require('./aiJobProcessor');

/**
 * Emit a platform business event to the autonomous AI queue.
 *
 * @param {string} eventType - 'ARTISAN_REGISTERED' | 'PRODUCT_SUBMITTED' | 'ORDER_CREATED' | 'PAYMENT_UPDATED' | 'LOW_STOCK_DETECTED' | 'REVIEW_CREATED' | 'COMPLAINT_CREATED' | 'DAILY_REPORT'
 * @param {string} entityType - 'artisan' | 'product' | 'order' | 'review' | 'report'
 * @param {string} entityId - UUID / ID of the entity
 * @param {object} payload - Optional context payload
 */
async function emitEvent(eventType, entityType, entityId, payload = {}) {
  try {
    const aiControlCenter = require('./aiControlCenter');
    const settings = await aiControlCenter.getControlSettings();

    if (settings.ai_emergency_stop) {
      console.warn(`🛑 [AI EventBus] Blocked event ${eventType}: Emergency stop is active.`);
      return;
    }

    if (!settings.ai_global_enabled) {
      console.log(`[AI EventBus] AI global operations disabled; skipping event ${eventType}`);
      return;
    }

    const idempotencyKey = `${eventType}_${entityType}_${entityId}_${payload.version || Date.now()}`;

    await enqueueJob({
      eventType,
      entityType,
      entityId,
      payload,
      idempotencyKey,
    });

    // Proactively trigger a processing pass in next microtask tick
    setImmediate(() => {
      processPendingJobs().catch(e => console.error('[AI EventBus] Immediate pass error:', e.message));
    });
  } catch (err) {
    console.error(`❌ [AI EventBus] Failed to emit event ${eventType}:`, err.message);
  }
}

module.exports = {
  emitEvent,
};
