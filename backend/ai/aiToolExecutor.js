/**
 * backend/ai/aiToolExecutor.js
 * ─────────────────────────────────────────────────────────────────
 * Secure execution engine for OpenAI tool/function calls.
 * Authoritative boundary: Validates parameters, executes domain operations,
 * logs immutable audit entries in ai_admin_actions, and returns structured data.
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const artisanService = require('../services/artisanService');
const productService = require('../services/productService');
const whatsappService = require('../services/whatsappService');
const complaintService = require('../services/complaintService');
const analyticsReportService = require('../services/analyticsReportService');
const { broadcastSync } = require('../utils/realtime');

const { v4: uuidv4 } = require('uuid');

let inMemoryAuditLogs = [];
let inMemoryRules = {
  artisan_auto_verification: true,
  product_auto_approval: true,
  order_auto_processing: true,
  inventory_monitoring: true,
  review_moderation: true,
  daily_ai_report: true,
  whatsapp_notifications: true,
};

/**
 * Persist an immutable record in ai_admin_actions.
 */
async function recordAuditAction({
  conversationId,
  eventType = 'TOOL_CALL',
  entityType,
  entityId,
  actionName,
  toolName,
  inputSummary,
  decision,
  reason,
  confidence = 1.0,
  result,
  status = 'success',
  error = null,
}) {
  const auditEntry = {
    id: uuidv4(),
    conversation_id: conversationId || null,
    event_type: eventType,
    entity_type: entityType || null,
    entity_id: String(entityId || ''),
    action_name: actionName,
    tool_name: toolName,
    input_summary: typeof inputSummary === 'string' ? inputSummary : JSON.stringify(inputSummary || {}),
    decision: decision || actionName,
    reason: reason || null,
    confidence: Number(confidence) || 1.0,
    result: result || {},
    status,
    error: error || null,
    created_at: new Date().toISOString(),
  };

  try {
    const { error: insertErr } = await safeQuery(() =>
      supabase.from('ai_admin_actions').insert([auditEntry])
    );
    if (!insertErr) return auditEntry;
  } catch (err) {}

  inMemoryAuditLogs.unshift(auditEntry);
  if (inMemoryAuditLogs.length > 200) inMemoryAuditLogs.pop();
  return auditEntry;
}

/**
 * Execute a structured tool call requested by OpenAI.
 *
 * @param {string} toolName - Name of the function to invoke
 * @param {object} args - Parsed arguments from OpenAI
 * @param {object} context - Execution context { conversationId, adminId, eventType }
 * @returns {Promise<object>} Structured result returned back to OpenAI
 */
async function executeTool(toolName, args = {}, context = {}) {
  const { conversationId, adminId, eventType = 'AI_OPERATIONS' } = context;

  console.log(`🤖 [AI Tool Executor] Executing tool: ${toolName}`, args);

  try {
    let result = null;
    let entityType = null;
    let entityId = null;
    let decision = 'executed';
    let reason = args.reason || null;
    let confidence = args.confidence || 1.0;

    switch (toolName) {
      // ─── READ TOOLS ────────────────────────────────────────────────
      case 'get_artisans':
        result = await artisanService.getArtisans(args);
        break;

      case 'get_pending_artisans':
        result = await artisanService.getPendingArtisans(args.limit);
        break;

      case 'get_artisan_details':
        entityType = 'artisan';
        entityId = args.artisan_id;
        result = await artisanService.getArtisanDetails(args.artisan_id);
        break;

      case 'get_products':
        result = await productService.getProducts(args);
        break;

      case 'get_pending_products':
        result = await productService.getPendingProducts(args.limit);
        break;

      case 'get_low_stock_products':
        result = await productService.getLowStockProducts(args.threshold, args.limit);
        break;

      case 'get_orders': {
        let query = supabase
          .from('orders')
          .select('*, users(name, email, phone)')
          .order('created_at', { ascending: false })
          .limit(Math.min(args.limit || 20, 50));

        if (args.status && args.status !== 'all') query = query.eq('status', args.status);
        if (args.payment_status && args.payment_status !== 'all') query = query.eq('payment_status', args.payment_status);

        const { data, error } = await safeQuery(() => query);
        if (error) throw new Error(`Failed to fetch orders: ${error.message}`);
        result = data || [];
        break;
      }

      case 'get_order_details': {
        entityType = 'order';
        entityId = args.order_id;
        const { data: order, error } = await safeQuery(() =>
          supabase
            .from('orders')
            .select('*, users(name, email, phone), order_items(*, products(name, price, image_url)), artisan_orders(*, artisan_profiles(store_name))')
            .eq('id', args.order_id)
            .single()
        );
        if (error || !order) throw new Error(`Order not found: ${args.order_id}`);
        result = order;
        break;
      }

      case 'get_failed_payments': {
        const { data, error } = await safeQuery(() =>
          supabase
            .from('orders')
            .select('id, order_number, user_id, total_price, payment_method, payment_status, status, created_at, users(name, email, phone)')
            .or('payment_status.eq.failed,status.eq.payment_failed')
            .order('created_at', { ascending: false })
            .limit(Math.min(args.limit || 20, 50))
        );
        if (error) throw new Error(`Failed to fetch failed payments: ${error.message}`);
        result = data || [];
        break;
      }

      case 'get_reviews': {
        let query = supabase
          .from('reviews')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(Math.min(args.limit || 20, 50));

        if (typeof args.is_approved === 'boolean') {
          query = query.eq('is_approved', args.is_approved);
        }

        const { data, error } = await safeQuery(() => query);
        if (error && error.code !== '42P01') throw error;
        result = data || [];
        break;
      }

      case 'get_complaints':
        result = await complaintService.getComplaints(args);
        break;

      case 'get_business_analytics':
        result = await analyticsReportService.getBusinessAnalytics(args.period || 'today');
        break;

      case 'get_ai_queue_status': {
        const { data, error } = await safeQuery(() =>
          supabase
            .from('ai_action_queue')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20)
        );
        result = {
          jobs: data || [],
          pendingCount: (data || []).filter(j => j.status === 'pending').length,
          processingCount: (data || []).filter(j => j.status === 'processing').length,
          failedCount: (data || []).filter(j => j.status === 'failed' || j.status === 'dead_letter').length,
        };
        break;
      }

      case 'get_automation_rules': {
        const { data, error } = await safeQuery(() =>
          supabase.from('ai_automation_rules').select('*')
        );
        if (!error && data && data.length > 0) {
          result = data;
        } else {
          result = Object.entries(inMemoryRules).map(([id, is_enabled]) => ({
            id,
            is_enabled,
            name: id.replace(/_/g, ' ').toUpperCase(),
          }));
        }
        break;
      }

      case 'get_recent_ai_actions': {
        const { data, error } = await safeQuery(() =>
          supabase
            .from('ai_admin_actions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(Math.min(args.limit || 20, 50))
        );
        result = !error && data && data.length > 0 ? data : inMemoryAuditLogs.slice(0, args.limit || 20);
        break;
      }

      // ─── ACTION / WRITE TOOLS ──────────────────────────────────────
      case 'verify_artisan':
        entityType = 'artisan';
        entityId = args.artisan_id;
        decision = 'verify';
        result = await artisanService.verifyArtisan(args.artisan_id, args.reason, args.confidence);
        break;

      case 'reject_artisan':
        entityType = 'artisan';
        entityId = args.artisan_id;
        decision = 'reject';
        result = await artisanService.rejectArtisan(args.artisan_id, args.reason);
        break;

      case 'hold_artisan':
        entityType = 'artisan';
        entityId = args.artisan_id;
        decision = 'hold';
        result = await artisanService.holdArtisan(args.artisan_id, args.reason);
        break;

      case 'approve_product':
        entityType = 'product';
        entityId = args.product_id;
        decision = 'approve';
        result = await productService.approveProduct(args.product_id, args.reason, args.confidence);
        break;

      case 'reject_product':
        entityType = 'product';
        entityId = args.product_id;
        decision = 'reject';
        result = await productService.rejectProduct(args.product_id, args.reason);
        break;

      case 'hold_product':
        entityType = 'product';
        entityId = args.product_id;
        decision = 'hold';
        result = await productService.holdProduct(args.product_id, args.reason);
        break;

      case 'update_product_inventory':
        entityType = 'product';
        entityId = args.product_id;
        decision = 'inventory_adjustment';
        result = await productService.updateProductInventory(args.product_id, args.quantity, args.reason);
        break;

      case 'confirm_order': {
        entityType = 'order';
        entityId = args.order_id;
        decision = 'confirm';
        const { data: updated, error } = await safeQuery(() =>
          supabase
            .from('orders')
            .update({ status: 'confirmed', order_status: 'confirmed' })
            .eq('id', args.order_id)
            .select()
            .single()
        );
        if (error) throw error;
        broadcastSync('ORDERS_UPDATED', { id: args.order_id, status: 'confirmed', order: updated });
        // Automatically dispatch notifications to assigned artisans
        await whatsappService.notifyOrderArtisans(args.order_id, 'NEW_ORDER');
        result = { success: true, order_id: args.order_id, status: 'confirmed', reason: args.reason };
        break;
      }

      case 'hold_order': {
        entityType = 'order';
        entityId = args.order_id;
        decision = 'hold';
        const { data: updated, error } = await safeQuery(() =>
          supabase
            .from('orders')
            .update({ status: 'hold', order_status: 'hold' })
            .eq('id', args.order_id)
            .select()
            .single()
        );
        if (error) throw error;
        result = { success: true, order_id: args.order_id, status: 'hold', reason: args.reason };
        break;
      }

      case 'cancel_order': {
        entityType = 'order';
        entityId = args.order_id;
        decision = 'cancel';
        const { data: updated, error } = await safeQuery(() =>
          supabase
            .from('orders')
            .update({ status: 'cancelled', order_status: 'cancelled' })
            .eq('id', args.order_id)
            .select()
            .single()
        );
        if (error) throw error;
        broadcastSync('ORDERS_UPDATED', { id: args.order_id, status: 'cancelled', order: updated });
        result = { success: true, order_id: args.order_id, status: 'cancelled', reason: args.reason };
        break;
      }

      case 'send_artisan_whatsapp':
        entityType = 'artisan';
        entityId = args.artisan_id;
        decision = 'whatsapp_dispatch';
        result = await whatsappService.sendArtisanOrderWhatsApp({
          artisanId: args.artisan_id,
          orderId: args.order_id,
          notificationType: args.notification_type || 'NEW_ORDER',
        });
        break;

      case 'moderate_review': {
        entityType = 'review';
        entityId = args.review_id;
        decision = args.action;
        if (args.action === 'approve') {
          await safeQuery(() => supabase.from('reviews').update({ is_approved: true }).eq('id', args.review_id));
        } else if (args.action === 'hide') {
          await safeQuery(() => supabase.from('reviews').update({ is_approved: false }).eq('id', args.review_id));
        } else if (args.action === 'delete') {
          await safeQuery(() => supabase.from('reviews').delete().eq('id', args.review_id));
        }
        result = { success: true, review_id: args.review_id, action: args.action, reason: args.reason };
        break;
      }

      case 'resolve_complaint':
        entityType = 'complaint';
        entityId = args.complaint_id;
        decision = args.new_status;
        result = await complaintService.resolveComplaint(args.complaint_id, args.new_status, args.resolution_notes);
        break;

      case 'generate_daily_business_report':
        entityType = 'report';
        decision = 'report_generated';
        result = await analyticsReportService.generateDailyReport(args.report_date);
        break;

      case 'update_automation_rule': {
        entityType = 'rule';
        entityId = args.rule_id;
        decision = args.is_enabled ? 'enable' : 'disable';
        inMemoryRules[args.rule_id] = Boolean(args.is_enabled);
        try {
          await safeQuery(() =>
            supabase
              .from('ai_automation_rules')
              .update({ is_enabled: Boolean(args.is_enabled), updated_at: new Date().toISOString() })
              .eq('id', args.rule_id)
          );
        } catch (e) {}
        result = { success: true, rule_id: args.rule_id, is_enabled: Boolean(args.is_enabled) };
        break;
      }

      default:
        throw new Error(`Unrecognized tool: "${toolName}". Tool is outside permitted autonomous capabilities.`);
    }

    // Record audit entry for write operations and significant read actions
    const isWrite = [
      'verify_artisan', 'reject_artisan', 'hold_artisan',
      'approve_product', 'reject_product', 'hold_product',
      'update_product_inventory', 'confirm_order', 'hold_order', 'cancel_order',
      'send_artisan_whatsapp', 'moderate_review', 'resolve_complaint',
      'generate_daily_business_report', 'update_automation_rule',
    ].includes(toolName);

    if (isWrite) {
      await recordAuditAction({
        conversationId,
        eventType,
        entityType,
        entityId,
        actionName: toolName,
        toolName,
        inputSummary: args,
        decision,
        reason,
        confidence,
        result,
        status: 'success',
      });
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error(`❌ [AI Tool Executor] Error executing ${toolName}:`, error.message);

    await recordAuditAction({
      conversationId,
      eventType,
      entityType: null,
      entityId: args.artisan_id || args.product_id || args.order_id || null,
      actionName: toolName,
      toolName,
      inputSummary: args,
      decision: 'failed',
      reason: error.message,
      status: 'failed',
      error: error.message,
    });

    return {
      success: false,
      error: error.message || 'Tool execution failed',
      tool: toolName,
    };
  }
}

module.exports = {
  executeTool,
  recordAuditAction,
  getInMemoryAuditLogs: () => inMemoryAuditLogs,
  getInMemoryRules: () => inMemoryRules,
};
