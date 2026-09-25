/**
 * backend/services/agentApprovalService.js
 * ─────────────────────────────────────────────────────────────────
 * Robust Approval Gate & Execution Engine for AI Operations Agent.
 * All HIGH and CRITICAL risk actions wait here for explicit human admin sign-off.
 * When approved, actions are directly executed and published to the live platform.
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Strict UUID check to prevent PostgreSQL "invalid input syntax for type uuid" error
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeUuid = (val) => (typeof val === 'string' && UUID_REGEX.test(val) ? val : null);

// In-memory fallback if DB table is temporarily unreachable
let inMemoryApprovals = [];

/**
 * Execute an approved action once human admin confirms it.
 */
async function executeApprovedAction(approval, adminId) {
  const toolName = approval.tool_name || approval.action_type;
  const toolArgs = approval.tool_args || {};

  console.log(`⚡ [AI Approval Executor] Executing approved action: ${toolName}`, toolArgs);

  switch (toolName) {
    case 'add_hero_slide':
    case 'create_hero_banner_approval':
    case 'update_hero_banners': {
      const { readSettings, applySettingsUpdate } = require('../controllers/settingsController');
      const current = readSettings();
      const existingSlides = Array.isArray(current.heroSlides) ? [...current.heroSlides] : [];

      let updatedSlides;
      if (toolArgs.mode === 'replace' && Array.isArray(toolArgs.slides)) {
        updatedSlides = toolArgs.slides;
      } else if (Array.isArray(toolArgs.slides)) {
        updatedSlides = [...toolArgs.slides, ...existingSlides];
      } else {
        // Single slide addition from hero banner approval
        const newSlide = {
          id: Date.now(),
          image: toolArgs.image || 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789047566/kalastyle-artisan-marketplace/xtzypfezplersfalej58.jpg',
          badgeText: toolArgs.badgeText || (toolArgs.theme ? `✦ ${toolArgs.theme} Special` : '✦ Festive Special'),
          badgeType: toolArgs.badgeType || 'sale',
          headline: toolArgs.headline || `${toolArgs.theme || 'Festive'} Collection`,
          subtitle: toolArgs.subtitle || 'Celebrate with authentic handmade creations from Indian master artisans.',
          buttonText: toolArgs.buttonText || 'Explore Collection',
          buttonLink: toolArgs.buttonLink || '/products',
          align: toolArgs.align || 'center',
        };
        // Prepend the new banner so it is the first hero slide visitors see on the homepage!
        updatedSlides = [newSlide, ...existingSlides];
      }

      const settingsUpdate = { heroSlides: updatedSlides };
      if (toolArgs.discount_banner || toolArgs.discountBanner) {
        settingsUpdate.discountBanner = toolArgs.discount_banner || toolArgs.discountBanner;
      }

      const updated = await applySettingsUpdate(settingsUpdate);
      return {
        executed: true,
        action: 'HERO_BANNERS_UPDATED',
        slideCount: updatedSlides.length,
        headline: toolArgs.headline || 'Hero Banner',
        message: `Hero banner "${toolArgs.headline || 'Festive Collection'}" published live to the homepage!`,
      };
    }

    case 'update_discount_banner': {
      const { applySettingsUpdate } = require('../controllers/settingsController');
      await applySettingsUpdate({ discountBanner: toolArgs });
      return {
        executed: true,
        action: 'DISCOUNT_BANNER_UPDATED',
        banner: toolArgs,
        message: `Discount banner "${toolArgs.title || 'Special Deal'}" activated live across the site!`,
      };
    }

    case 'generate_marketing_campaign': {
      let bannerResult = null;
      if (toolArgs.headline || toolArgs.heroSlide) {
        const { readSettings, applySettingsUpdate } = require('../controllers/settingsController');
        const current = readSettings();
        const existingSlides = Array.isArray(current.heroSlides) ? [...current.heroSlides] : [];
        const slide = toolArgs.heroSlide || {
          id: Date.now(),
          image: toolArgs.image || 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789047566/kalastyle-artisan-marketplace/xtzypfezplersfalej58.jpg',
          badgeText: toolArgs.badgeText || `✦ ${toolArgs.theme || 'Festive'} Special`,
          badgeType: 'sale',
          headline: toolArgs.headline || `${toolArgs.theme || 'Special'} Celebration`,
          subtitle: toolArgs.subtitle || (toolArgs.campaignContentPreview ? toolArgs.campaignContentPreview.slice(0, 120) : 'Handcrafted heritage collections.'),
          buttonText: 'Shop Now',
          buttonLink: '/products',
          align: 'center',
        };
        const updatedSlides = [slide, ...existingSlides];
        await applySettingsUpdate({ heroSlides: updatedSlides });
        bannerResult = { slideAdded: true, slide };
      }
      return {
        executed: true,
        action: 'CAMPAIGN_APPROVED',
        bannerResult,
        message: `Marketing campaign for "${toolArgs.theme || 'campaign'}" approved and activated.`,
      };
    }

    case 'verify_artisan': {
      const artisanService = require('../services/artisanService');
      const res = await artisanService.verifyArtisan(toolArgs.artisan_id);
      return { executed: true, action: 'ARTISAN_VERIFIED', result: res, message: `Artisan verified successfully.` };
    }

    case 'approve_product': {
      const productService = require('../services/productService');
      const res = await productService.approveProduct(toolArgs.product_id);
      return { executed: true, action: 'PRODUCT_APPROVED', result: res, message: `Product approved and listed live in catalog.` };
    }

    case 'confirm_order': {
      const { safeQuery } = require('../config/supabase');
      const { data, error } = await safeQuery(() =>
        supabase.from('orders').update({ status: 'confirmed' }).eq('id', toolArgs.order_id).select()
      );
      return { executed: !error, action: 'ORDER_CONFIRMED', result: data, message: `Order #${toolArgs.order_id} confirmed.` };
    }

    case 'update_product_inventory': {
      const { safeQuery } = require('../config/supabase');
      const { data, error } = await safeQuery(() =>
        supabase.from('products').update({ stock_quantity: toolArgs.stock_quantity }).eq('id', toolArgs.product_id).select()
      );
      return { executed: !error, action: 'INVENTORY_UPDATED', result: data, message: `Product inventory updated.` };
    }

    default:
      return { executed: true, message: `Action "${toolName}" marked as approved.` };
  }
}

/**
 * Retrieve a single approval by ID.
 */
async function getApprovalById(approvalId) {
  try {
    const { data, error } = await safeQuery(() =>
      supabase.from('ai_agent_approvals').select('*').eq('id', approvalId).single()
    );
    if (!error && data) return data;
  } catch (e) {}

  return inMemoryApprovals.find(a => a.id === approvalId) || null;
}

/**
 * Create a new approval request for a HIGH/CRITICAL action.
 * The action does NOT execute — it waits for admin approval.
 */
async function createApproval(params = {}) {
  const toolName = params.toolName || params.actionName || params.tool_name;
  const toolArgs = params.toolArgs || params.parameters || params.tool_args || {};
  const description = params.description || params.reason || `Approval required for ${toolName}`;
  const riskLevel = params.riskLevel || params.risk_level || 'HIGH';
  const adminId = params.adminId || params.admin_id;
  const conversationId = params.conversationId || params.conversation_id;

  const approval = {
    id: uuidv4(),
    action_type: toolName,
    description,
    risk_level: riskLevel,
    requested_by: typeof adminId === 'string' && adminId.trim() ? adminId : (params.agentName || 'ai_agent'),
    admin_id: safeUuid(adminId), // Safe UUID or null
    conversation_id: conversationId || null,
    tool_name: toolName,
    tool_args: toolArgs,
    status: 'PENDING',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
  };

  try {
    const { data, error } = await safeQuery(() =>
      supabase.from('ai_agent_approvals').insert([approval]).select().single()
    );
    if (!error && data) {
      console.log(`✅ [AI Approval Service] Created approval in Supabase: ${data.id}`);
      return data;
    }
    if (error) {
      console.warn('⚠️ [AI Approval Service] Supabase insert failed, using memory fallback:', error.message);
    }
  } catch (e) {
    console.warn('⚠️ [AI Approval Service] DB insert exception:', e.message);
  }

  // Fallback to in-memory
  inMemoryApprovals.unshift(approval);
  if (inMemoryApprovals.length > 100) inMemoryApprovals.pop();
  return approval;
}

const createApprovalRequest = createApproval;

/**
 * Admin approves a pending action — atomically claims PENDING state, executes the tool, and marks EXECUTED.
 */
async function approveAction(approvalId, approvedById) {
  // 1. Atomic claim: update status from PENDING to PROCESSING
  // Ensures only one admin/worker can execute this approval (Prevents race conditions)
  let claimed = null;

  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('ai_agent_approvals')
        .update({
          status: 'PROCESSING',
          approved_by: safeUuid(approvedById),
          approved_at: new Date().toISOString(),
        })
        .eq('id', approvalId)
        .eq('status', 'PENDING')
        .select()
        .single()
    );
    if (!error && data) {
      claimed = data;
    }
  } catch (e) {}

  // In-memory fallback atomic claim
  if (!claimed) {
    const idx = inMemoryApprovals.findIndex(a => a.id === approvalId && a.status === 'PENDING');
    if (idx !== -1) {
      inMemoryApprovals[idx].status = 'PROCESSING';
      inMemoryApprovals[idx].approved_by = safeUuid(approvedById);
      inMemoryApprovals[idx].approved_at = new Date().toISOString();
      claimed = inMemoryApprovals[idx];
    }
  }

  if (!claimed) {
    const existing = await getApprovalById(approvalId);
    if (!existing) throw new Error(`Approval record ${approvalId} not found.`);
    throw new Error(`Approval ${approvalId} is not in PENDING state (Current status: ${existing.status}). Operation already claimed, processed, or expired.`);
  }

  let executionResult = null;
  let executionError = null;

  try {
    executionResult = await executeApprovedAction(claimed, approvedById);
  } catch (err) {
    console.error(`❌ [AI Approval Service] Action execution failed:`, err);
    executionError = err.message;
  }

  const finalStatus = executionError ? 'EXECUTION_FAILED' : 'EXECUTED';
  const finalUpdate = {
    status: finalStatus,
    execution_result: executionResult || { error: executionError },
  };

  try {
    const { data } = await safeQuery(() =>
      supabase
        .from('ai_agent_approvals')
        .update(finalUpdate)
        .eq('id', approvalId)
        .select()
        .single()
    );
    if (data) return { ...data, executionResult, executionMessage: executionResult?.message };
  } catch (e) {}

  const memIdx = inMemoryApprovals.findIndex(a => a.id === approvalId);
  if (memIdx !== -1) {
    inMemoryApprovals[memIdx] = { ...inMemoryApprovals[memIdx], ...finalUpdate };
    return { ...inMemoryApprovals[memIdx], executionResult, executionMessage: executionResult?.message };
  }

  return { ...claimed, ...finalUpdate, executionResult, executionMessage: executionResult?.message };
}

/**
 * Admin rejects a pending action.
 */
async function rejectAction(approvalId, rejectedById, reason = 'Rejected by admin') {
  const updatePayload = {
    status: 'REJECTED',
    approved_by: safeUuid(rejectedById),
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
 * Fetch a single approval request by ID.
 */
async function getApprovalById(approvalId) {
  try {
    const { data, error } = await safeQuery(() =>
      supabase.from('ai_agent_approvals').select('*').eq('id', approvalId).maybeSingle()
    );
    if (!error && data) return data;
  } catch (e) {}

  return inMemoryApprovals.find(a => a.id === approvalId) || null;
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
    if (!error && Array.isArray(data)) {
      const dbIds = new Set(data.map(d => d.id));
      const memoryPending = inMemoryApprovals.filter(a =>
        a.status === 'PENDING' && !dbIds.has(a.id) && new Date(a.expires_at) > new Date()
      );
      return [...data, ...memoryPending].slice(0, limit);
    }
  } catch (e) {
    console.warn('getPendingApprovals DB query failed, using memory:', e.message);
  }

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
    if (!error && Array.isArray(data)) {
      const dbIds = new Set(data.map(d => d.id));
      const memoryAll = inMemoryApprovals.filter(a => !dbIds.has(a.id));
      return [...data, ...memoryAll].slice(0, limit);
    }
  } catch (e) {
    console.warn('getAllApprovals DB query failed, using memory:', e.message);
  }

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
  createApprovalRequest,
  approveAction,
  rejectAction,
  getApprovalById,
  getPendingApprovals,
  getAllApprovals,
  expireOldApprovals,
};
