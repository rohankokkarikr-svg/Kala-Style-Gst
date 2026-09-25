/**
 * backend/services/complaintService.js
 * ─────────────────────────────────────────────────────────────────
 * Customer & artisan complaint handling and resolution operations.
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');

/**
 * Fetch reports/complaints with status filter.
 */
exports.getComplaints = async ({ status = 'all', limit = 20 } = {}) => {
  let query = supabase
    .from('reports')
    .select('*, users(name, email)')
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 50));

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await safeQuery(() => query);
  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(`Failed to fetch complaints: ${error.message}`);
  }

  return data || [];
};

/**
 * Resolve or update complaint status.
 */
exports.resolveComplaint = async (complaintId, newStatus = 'resolved', resolutionNotes = 'Resolved by AI Admin Manager') => {
  if (!complaintId) throw new Error('complaint_id is required');

  const { data, error } = await safeQuery(() =>
    supabase
      .from('reports')
      .update({
        status: newStatus,
        admin_notes: resolutionNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', complaintId)
      .select()
      .single()
  );

  if (error) throw new Error(`Database error updating complaint: ${error.message}`);

  return {
    success: true,
    complaint_id: complaintId,
    status: newStatus,
    resolution_notes: resolutionNotes,
  };
};

/**
 * File a new customer/artisan complaint or platform report.
 */
exports.createComplaint = async ({ userId, reportType = 'general', reason, description, targetId = null } = {}) => {
  const { data, error } = await safeQuery(() =>
    supabase
      .from('reports')
      .insert([{
        user_id: userId || null,
        report_type: reportType,
        reason: reason || 'Customer dispute or product concern',
        description: description || null,
        target_id: targetId,
        status: 'open',
        created_at: new Date().toISOString(),
      }])
      .select()
      .single()
  );

  if (error) throw new Error(`Database error filing complaint: ${error.message}`);

  try {
    const { emitEvent } = require('../ai/aiEventBus');
    emitEvent('COMPLAINT_CREATED', 'report', data.id, {
      report_type: reportType,
      reason,
      user_id: userId,
    });
  } catch (e) {}

  return data;
};
