/**
 * backend/controllers/aiAdminController.js
 * ─────────────────────────────────────────────────────────────────
 * Admin Controller for Autonomous AI Operations Manager.
 * Strictly restricted to authenticated Administrators.
 */

const { runAutonomousLoop } = require('../ai/aiOrchestrator');
const { isConfigured, getModel, testConnection } = require('../ai/geminiClient');
const { getInMemoryAuditLogs, getInMemoryRules } = require('../ai/aiToolExecutor');
const { processPendingJobs, getInMemoryQueue } = require('../ai/aiJobProcessor');
const analyticsReportService = require('../services/analyticsReportService');
const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');

/**
 * Interactive chat endpoint with the OpenAI Business Manager.
 * Executes backend tools on behalf of the admin.
 */
exports.chat = async (req, res) => {
  try {
    const { message, conversationId, history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    const messages = [
      ...history.map(m => ({ role: m.role || 'user', content: m.content })),
      { role: 'user', content: message.trim() },
    ];

    const result = await runAutonomousLoop({
      messages,
      context: {
        conversationId: conversationId || `conv-${Date.now()}`,
        adminId: req.user?.id || null,
        adminName: req.user?.name || 'Admin',
        eventType: 'ADMIN_CHAT_DIRECTIVE',
      },
    });

    res.json(result);
  } catch (error) {
    console.error('❌ [AI Admin Controller] Chat error:', error.message);
    res.status(500).json({ error: error.message || 'Internal AI manager error' });
  }
};

/**
 * Fetch immutable audit trail of autonomous AI actions.
 */
exports.getActions = async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const { data, error } = await safeQuery(() =>
      supabase
        .from('ai_admin_actions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Math.min(parseInt(limit, 10) || 50, 100))
    );

    if (!error && data && data.length > 0) {
      return res.json(data);
    }

    res.json(getInMemoryAuditLogs().slice(0, parseInt(limit, 10) || 50));
  } catch (error) {
    console.error('❌ [AI Admin Controller] getActions error:', error.message);
    res.json(getInMemoryAuditLogs());
  }
};

/**
 * Fetch background AI job queue status and jobs.
 */
exports.getQueue = async (req, res) => {
  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('ai_action_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
    );

    let jobs = (!error && data) ? data : getInMemoryQueue();

    const counts = {
      pending: jobs.filter(j => j.status === 'pending').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed' || j.status === 'dead_letter').length,
    };

    res.json({
      counts,
      jobs,
    });
  } catch (error) {
    res.json({
      counts: { pending: 0, processing: 0, completed: 0, failed: 0 },
      jobs: getInMemoryQueue(),
    });
  }
};

/**
 * Retry a failed or dead-letter job in the queue.
 */
exports.retryQueueJob = async (req, res) => {
  try {
    const { id } = req.params;

    // Update in Supabase
    await safeQuery(() =>
      supabase
        .from('ai_action_queue')
        .update({ status: 'pending', attempts: 0, last_error: null })
        .eq('id', id)
    );

    // Update in-memory if present
    const memJob = getInMemoryQueue().find(j => j.id === id);
    if (memJob) {
      memJob.status = 'pending';
      memJob.attempts = 0;
      memJob.last_error = null;
    }

    // Trigger immediate pass
    setImmediate(processPendingJobs);

    res.json({ success: true, message: `Job ${id} re-enqueued for processing.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Fetch automation rules and toggles.
 */
exports.getRules = async (req, res) => {
  try {
    const { data, error } = await safeQuery(() =>
      supabase.from('ai_automation_rules').select('*')
    );

    if (!error && data && data.length > 0) {
      return res.json(data);
    }

    const memRules = getInMemoryRules();
    res.json(
      Object.entries(memRules).map(([id, is_enabled]) => ({
        id,
        name: id.replace(/_/g, ' ').toUpperCase(),
        is_enabled,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update automation rule status.
 */
exports.updateRule = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_enabled, config } = req.body;

    const memRules = getInMemoryRules();
    memRules[id] = Boolean(is_enabled);

    const updatePayload = {
      is_enabled: Boolean(is_enabled),
      updated_at: new Date().toISOString(),
    };
    if (config) updatePayload.config = config;

    await safeQuery(() =>
      supabase.from('ai_automation_rules').update(updatePayload).eq('id', id)
    );

    res.json({ success: true, rule_id: id, is_enabled: Boolean(is_enabled) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Fetch daily intelligence reports.
 */
exports.getReports = async (req, res) => {
  try {
    const reports = await analyticsReportService.getReports();
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Trigger an on-demand daily report generation.
 */
exports.generateReport = async (req, res) => {
  try {
    const report = await analyticsReportService.generateDailyReport();
    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Trigger manual background job processing cycle.
 */
exports.processEvents = async (req, res) => {
  try {
    await processPendingJobs();
    res.json({ success: true, message: 'Job processing cycle triggered.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Overall AI Operations Manager System Health & Connectivity.
 */
exports.getStatus = async (req, res) => {
  try {
    const connection = await testConnection();
    res.json({
      configured: isConfigured(),
      model: getModel(),
      autonomousMode: process.env.AI_AUTONOMOUS_MODE !== 'false',
      connection,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── New Controllers ──────────────────────────────────────────────────────────

/**
 * Real-time system health check across all platform services.
 */
exports.getSystemHealth = async (req, res) => {
  try {
    const agentHealthService = require('../services/agentHealthService');
    const health = await agentHealthService.checkSystemHealth();
    res.json(health);
  } catch (error) {
    console.error('❌ [AI Admin] Health check error:', error.message);
    res.status(500).json({ error: error.message, overall: 'UNKNOWN' });
  }
};

/**
 * List all pending approval requests.
 */
exports.getApprovals = async (req, res) => {
  try {
    const agentApprovalService = require('../services/agentApprovalService');
    const { all } = req.query;
    const approvals = all === 'true'
      ? await agentApprovalService.getAllApprovals(100)
      : await agentApprovalService.getPendingApprovals(50);
    res.json(approvals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Approve a pending HIGH-risk AI action.
 */
exports.approveAction = async (req, res) => {
  try {
    const agentApprovalService = require('../services/agentApprovalService');
    const { id } = req.params;
    const adminId = req.user?.id;

    const updated = await agentApprovalService.approveAction(id, adminId);
    console.log(`✅ [AI Approval] Approval ${id} approved & executed by admin ${adminId}`);

    res.json({
      success: true,
      approval: updated,
      message: updated.executionMessage || 'Action approved and executed live successfully!',
    });
  } catch (error) {
    console.error('❌ [AI Approval] Approve error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Reject a pending HIGH-risk AI action.
 */
exports.rejectAction = async (req, res) => {
  try {
    const agentApprovalService = require('../services/agentApprovalService');
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user?.id;

    const updated = await agentApprovalService.rejectAction(id, adminId, reason || 'Rejected by admin');
    res.json({ success: true, approval: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Retrieve agent memory entries.
 */
exports.getAgentMemory = async (req, res) => {
  try {
    const supabase = require('../config/supabase');
    const { safeQuery } = require('../config/supabase');
    const { memory_type } = req.query;

    let query = supabase.from('ai_agent_memory').select('id, memory_type, key, description, updated_at');
    if (memory_type && memory_type !== 'all') {
      query = query.eq('memory_type', memory_type);
    }

    const { data, error } = await safeQuery(() => query.limit(50));
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

