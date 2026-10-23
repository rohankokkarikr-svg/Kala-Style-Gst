/**
 * backend/ai/aiScheduler.js
 * ─────────────────────────────────────────────────────────────────
 * KalaStyle AI Autonomous Operations Persistent Scheduler.
 *
 * Implements persistent recurring scheduled jobs:
 * - Every 5m:   Order fraud & velocity sentinel
 * - Every 15m:  Shipping delays & AWB assignment sentinel
 * - Every 1h:   Inventory & stock depletion sentinel
 * - Every 6h:   Payment anomalies & business metrics scan
 * - Daily:      Full autonomous daily sweep & daily report
 *
 * Server-Restart Resiliency:
 * Execution state is persisted into `ai_agent_memory` in Supabase.
 * On server boot/restart, the scheduler reconciles timestamps from
 * `ai_agent_memory` so no scheduled task is lost or permanently delayed.
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const aiControlCenter = require('./aiControlCenter');
const domainAgents = require('./domainAgents');

let schedulerInterval = null;
let isCycleRunning = false;

const SCHEDULED_TASKS = [
  {
    name: 'order_fraud_monitor',
    intervalMs: 5 * 60 * 1000, // 5 minutes
    handler: async () => {
      console.log('⏰ [AI Scheduler] Running 5-min Order Fraud & Velocity Sentinel...');
      return await domainAgents.runOrderSentinel();
    },
  },
  {
    name: 'shipping_monitor',
    intervalMs: 15 * 60 * 1000, // 15 minutes
    handler: async () => {
      console.log('⏰ [AI Scheduler] Running 15-min Shipping & Logistics Sentinel...');
      return await domainAgents.runShippingSentinel();
    },
  },
  {
    name: 'inventory_monitor',
    intervalMs: 60 * 60 * 1000, // 1 hour
    handler: async () => {
      console.log('⏰ [AI Scheduler] Running 1-hour Inventory Depletion Sentinel...');
      return await domainAgents.runInventorySentinel();
    },
  },
  {
    name: 'business_anomaly_scan',
    intervalMs: 6 * 60 * 60 * 1000, // 6 hours
    handler: async () => {
      console.log('⏰ [AI Scheduler] Running 6-hour Business Anomaly & Payment Sentinel...');
      await domainAgents.runPaymentSentinel();
      return await domainAgents.runBusinessAnalyst();
    },
  },
  {
    name: 'daily_autonomous_sweep',
    intervalMs: 24 * 60 * 60 * 1000, // 24 hours
    handler: async () => {
      console.log("⏰ [AI Scheduler] Running Daily Autonomous Operations Sweep...");
      return await domainAgents.runAutonomousDailySweep({ triggerSource: 'PERSISTENT_SCHEDULER' });
    },
  },
];

/**
 * Fetch last execution timestamp for a scheduled task from database.
 */
async function getLastRunTimestamp(taskName) {
  try {
    const memoryKey = `scheduler_last_run_${taskName}`;
    const { data } = await safeQuery(() =>
      supabase.from('ai_agent_memory').select('value').eq('key', memoryKey).maybeSingle()
    );
    if (data && data.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      return new Date(parsed).getTime();
    }
  } catch (err) {}
  return 0;
}

/**
 * Record successful run timestamp into database.
 */
async function setLastRunTimestamp(taskName, timestampMs) {
  try {
    const memoryKey = `scheduler_last_run_${taskName}`;
    await safeQuery(() =>
      supabase.from('ai_agent_memory').upsert({
        key: memoryKey,
        value: JSON.stringify(new Date(timestampMs).toISOString()),
        memory_type: 'operational',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
    );
  } catch (err) {}
}

/**
 * Run one iteration of the scheduler cycle.
 */
async function tickScheduler() {
  if (isCycleRunning) return;
  isCycleRunning = true;

  try {
    const settings = await aiControlCenter.getControlSettings();
    if (!settings.ai_global_enabled) {
      return;
    }

    const now = Date.now();

    for (const task of SCHEDULED_TASKS) {
      const lastRun = await getLastRunTimestamp(task.name);
      const elapsed = now - lastRun;

      if (elapsed >= task.intervalMs) {
        // If emergency stop is active, we skip mutating tasks but still allow read-only monitoring
        if (settings.ai_emergency_stop && task.name === 'daily_autonomous_sweep') {
          console.warn(`🛑 [AI Scheduler] Skipping mutating task ${task.name} due to active Emergency Stop.`);
          continue;
        }

        try {
          await task.handler();
          await setLastRunTimestamp(task.name, now);
        } catch (taskErr) {
          console.error(`❌ [AI Scheduler] Error executing ${task.name}:`, taskErr.message);
        }
      }
    }
  } catch (err) {
    console.error('❌ [AI Scheduler] Cycle error:', err.message);
  } finally {
    isCycleRunning = false;
  }
}

/**
 * Start the persistent background scheduler.
 */
function startScheduler(pollIntervalMs = 60000) {
  if (schedulerInterval) return;
  console.log(`🚀 [AI Scheduler] Persistent Autonomous Scheduler initialized (Poll: ${pollIntervalMs / 1000}s)`);
  // Run initial check after 5s
  setTimeout(tickScheduler, 5000);
  schedulerInterval = setInterval(tickScheduler, pollIntervalMs);
}

/**
 * Stop the scheduler.
 */
function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  tickScheduler,
  SCHEDULED_TASKS,
};
