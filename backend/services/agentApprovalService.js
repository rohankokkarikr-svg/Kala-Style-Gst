/**
 * backend/services/agentApprovalService.js
 * ─────────────────────────────────────────────────────────────────
 * Approval gate service for HIGH and CRITICAL AI agent actions.
 * All destructive/financial operations must pass through this system.
 * Human admin must explicitly approve before execution proceeds.
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// In-memory fallback if DB table not yet created
let inMemoryApprovals = [];

/**
 * Create a new approval request for a HIGH/CRITICAL action.
 * The action does NOT execute — it waits for admin approval.
 *
 * @param {object} params
 * @param {string} params.toolName - Tool that requires approval
 * @param {object} params.toolArgs - Arguments the tool was called with
 * @param {string} params.description - Human-readable description of what this does
 * @param {string} params.riskLevel - 'HIGH' | 'CRITICAL'
 * @param {string} params.adminId - ID of the admin making the request
 * @param {string} params.conversationId - Chat conversation ID
 * @returns {Promise<object>} Created approval record
 */
async function createApproval({ toolName, toolArgs, description, riskLevel = 'HIGH', adminId, conversationId }) {
  const approval = {
    id: uuidv4(),
    action_type: toolName,
    description,
    risk_level: riskLevel,
    requested_by: adminId || 'ai_agent',
    admin_id: adminId || null,
    conversation_id: conversationId || null,
    tool_name: toolName,
    tool_args: toolArgs || {},
    status: 'PENDING',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
  };

  try {
    const { data, error } = await safeQuery(() =>
      supabase.from('ai_agent_approvals').insert([approval]).select().single()
    );
    if (!error && data) return data;
  } catch (e) {}

  // Fallback to in-memory
  inMemoryApprovals.unshift(approval);
  if (inMemoryApprovals.length > 100) inMemoryApprovals.pop();
  return approval;
}

/**
 * Admin approves a pending action — records the approval and marks ready for execution.
 *
 * @param {string} approvalId - UUID of the approval record
 * @param {string} approvedById - Admin user ID who approved
 * @returns {Promise<object>} Updated approval record
 */
async function approveAction(approvalId, approvedById) {
  const updatePayload = {
    status: 'APPROVED',
    approved_by: approvedById || null,
    approved_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('ai_agent_approvals')
        .update(updatePayload)
        .eq('id', approvalId)
        .select()
        .single()
    );
    if (!error && data) return data;
  } catch (e) {}

  // Fallback in-memory
  const idx = inMemoryApprovals.findIndex(a => a.id === approvalId);
  if (idx !== -1) {
    inMemoryApprovals[idx] = { ...inMemoryApprovals[idx], ...updatePayload };
    return inMemoryApprovals[idx];
  }
  throw new Error(`Approval ${approvalId} not found`);
}

/**
 * Admin rejects a pending action.
 *
 * @param {string} approvalId - UUID of the approval record
 * @param {string} rejectedById - Admin user ID who rejected
 * @param {string} reason - Rejection reason
 * @returns {Promise<object>} Updated approval record
 */
async function rejectAction(approvalId, rejectedById, reason = 'Rejected by admin') {
  const updatePayload = {
    status: 'REJECTED',
    approved_by: rejectedById || null,
    rejection_reason: reason,
    rejected_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('ai_agent_approvals')
        .update(updatePayload)
        .eq('id', approvalId)
        .select()
        .single()
    );
    if (!error && data) return data;
  } catch (e) {}

  const idx = inMemoryApprovals.findIndex(a => a.id === approvalId);
  if (idx !== -1) {
    inMemoryApprovals[idx] = { ...inMemoryApprovals[idx], ...updatePayload };
    return inMemoryApprovals[idx];
  }
  throw new Error(`Approval ${approvalId} not found`);
}

/**
 * Get all pending approvals (not expired).
 */
async function getPendingApprovals(limit = 50) {
  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('ai_agent_approvals')
        .select('*')
        .eq('status', 'PENDING')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(limit)
    );
    if (!error && data) return data;
  } catch (e) {}

  return inMemoryApprovals.filter(a =>
    a.status === 'PENDING' && new Date(a.expires_at) > new Date()
  ).slice(0, limit);
}

/**
 * Get all approvals (all statuses) for the audit trail.
 */
async function getAllApprovals(limit = 100) {
  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('ai_agent_approvals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
    );
    if (!error && data && data.length > 0) return data;
  } catch (e) {}

  return inMemoryApprovals.slice(0, limit);
}

/**
 * Mark expired approvals as EXPIRED.
 */
async function expireOldApprovals() {
  try {
    await safeQuery(() =>
      supabase
        .from('ai_agent_approvals')
        .update({ status: 'EXPIRED' })
        .eq('status', 'PENDING')
        .lt('expires_at', new Date().toISOString())
    );
  } catch (e) {}

  const now = new Date();
  inMemoryApprovals = inMemoryApprovals.map(a =>
    a.status === 'PENDING' && new Date(a.expires_at) < now
      ? { ...a, status: 'EXPIRED' }
      : a
  );
}

module.exports = {
  createApproval,
  approveAction,
  rejectAction,
  getPendingApprovals,
  getAllApprovals,
  expireOldApprovals,
};
