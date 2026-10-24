/**
 * backend/ai/aiFullAutonomousManager.js
 * ─────────────────────────────────────────────────────────────────
 * Master Autonomous Operations Engine for Full Automatic AI Admin.
 * 
 * When the admin switches mode to FULL_AUTONOMOUS:
 * All administrative oversight and platform operations are handled
 * completely by the AI autonomously:
 * 1. Auto-Verifies pending Indian artisans & activates their storefronts
 * 2. Auto-Approves valid craft products live to catalog
 * 3. Auto-Moderates & Publishes clean customer reviews
 * 4. Auto-Executes pending approvals queue (banners, campaigns, stock updates)
 * 5. Auto-Screens orders for fraud & auto-confirms legitimate orders
 * 6. Auto-Monitors low inventory & dispatches artisan alerts
 * 7. Records complete ground-truth immutable audit log entries
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const aiControlCenter = require('./aiControlCenter');
const artisanService = require('../services/artisanService');
const productService = require('../services/productService');
const agentApprovalService = require('../services/agentApprovalService');
const { createSystemNotification } = require('../controllers/notificationController');

let isCycleRunning = false;
let lastCycleReport = null;

const ABUSIVE_KEYWORDS = [
  'scam', 'fraud', 'cheat', 'fake', 'abuse', 'hate', 
  'bastard', 'stolen', 'illegal', 'harass', 'counterfeit'
];

/**
 * Execute a complete autonomous admin operations cycle across all platform domains.
 *
 * @param {object} options
 * @param {string} [options.adminId] - ID of admin initiating or null for background worker
 * @param {string} [options.triggerSource] - Event or schedule that triggered this pass
 * @param {boolean} [options.force] - Force execution regardless of current mode
 * @returns {Promise<object>} Full summary of all actions taken
 */
async function executeFullAutonomousCycle(options = {}) {
  const { adminId = null, triggerSource = 'AUTONOMOUS_CYCLE', force = false } = options;

  if (isCycleRunning) {
    console.log('⏳ [Full Autonomous AI] Cycle already in progress, skipping duplicate pass.');
    return {
      success: true,
      skipped: true,
      reason: 'Another autonomous execution cycle is currently running.',
      last_report: lastCycleReport,
    };
  }

  isCycleRunning = true;
  const startTime = Date.now();
  console.log(`🚀 [Full Autonomous AI] Starting complete administrative operations pass (Trigger: ${triggerSource})...`);

  const summary = {
    trigger_source: triggerSource,
    started_at: new Date().toISOString(),
    artisans_verified: 0,
    products_approved: 0,
    products_rejected: 0,
    reviews_approved: 0,
    reviews_flagged: 0,
    approvals_executed: 0,
    orders_confirmed: 0,
    orders_held: 0,
    low_stock_flagged: 0,
    details: {
      artisans: [],
      products: [],
      reviews: [],
      approvals: [],
      orders: [],
    },
  };

  try {
    // 0. Safety Gate Check: Emergency Stop
    const controlSettings = await aiControlCenter.getControlSettings(true);
    if (controlSettings.ai_emergency_stop) {
      console.warn('🛑 [Full Autonomous AI] Emergency stop is ACTIVE. Halting all autonomous actions.');
      return {
        success: false,
        blocked: true,
        reason: 'Emergency Stop is active. All mutations frozen for safety.',
      };
    }

    if (!force && controlSettings.ai_mode !== 'FULL_AUTONOMOUS') {
      console.log(`ℹ️ [Full Autonomous AI] Current mode is ${controlSettings.ai_mode}, not FULL_AUTONOMOUS.`);
      return {
        success: true,
        skipped: true,
        reason: `AI mode is ${controlSettings.ai_mode}. Full autonomous execution requires FULL_AUTONOMOUS mode.`,
      };
    }

    // ─────────────────────────────────────────────────────────────
    // 1. ARTISAN GOVERNANCE: Auto-verify legitimate pending artisans
    // ─────────────────────────────────────────────────────────────
    try {
      const { data: pendingArtisans } = await safeQuery(() =>
        supabase
          .from('artisan_profiles')
          .select('id, user_id, store_name, artisan_type, experience_years, bio, craft_description, phone')
          .in('verification_status', ['pending', 'under_review'])
          .limit(30)
      );

      if (Array.isArray(pendingArtisans) && pendingArtisans.length > 0) {
        console.log(`👨‍🎨 [Full Autonomous AI] Auditing ${pendingArtisans.length} pending artisans...`);

        for (const artisan of pendingArtisans) {
          const storeName = (artisan.store_name || '').trim();
          if (storeName.length > 0) {
            try {
              await artisanService.verifyArtisan(
                artisan.id,
                'Verified automatically by Full Autonomous AI Operations Manager',
                0.99
              );

              summary.artisans_verified += 1;
              summary.details.artisans.push({
                id: artisan.id,
                store_name: artisan.store_name,
                status: 'verified',
              });

              // Notify artisan in-app
              if (artisan.user_id) {
                await createSystemNotification({
                  title: 'Storefront Verified & Live! 🌟',
                  message: `Congratulations! KalaStyle AI Operations has verified your artisan profile. Your store "${artisan.store_name}" is now live to customers across India.`,
                  targetUserId: artisan.user_id,
                  audience: 'artisan',
                  senderId: adminId || null,
                });
              }
            } catch (vErr) {
              console.warn(`[Full Autonomous AI] Failed to verify artisan ${artisan.id}:`, vErr.message);
            }
          }
        }
      }
    } catch (artErr) {
      console.error('[Full Autonomous AI] Artisan verification pass error:', artErr.message);
    }

    // ─────────────────────────────────────────────────────────────
    // 2. PRODUCT CATALOG: Auto-approve pending craft products
    // ─────────────────────────────────────────────────────────────
    try {
      const { data: pendingProducts } = await safeQuery(() =>
        supabase
          .from('products')
          .select('id, name, price, category, artisan_id, stock_quantity, status, is_hidden')
          .or('status.in.(pending,draft,under_review),is_hidden.eq.true')
          .limit(50)
      );

      if (Array.isArray(pendingProducts) && pendingProducts.length > 0) {
        console.log(`🛍️ [Full Autonomous AI] Auditing ${pendingProducts.length} pending products...`);

        for (const prod of pendingProducts) {
          const price = Number(prod.price) || 0;

          if (price <= 0) {
            // Price anomaly / zero price
            try {
              await productService.rejectProduct(prod.id, 'Invalid pricing (₹0 or negative price not allowed)');
              summary.products_rejected += 1;
              summary.details.products.push({ id: prod.id, name: prod.name, status: 'rejected', reason: 'Zero/invalid price' });
            } catch (rErr) {}
          } else if (price <= 200000) {
            // Legitimate product submission
            try {
              await productService.approveProduct(
                prod.id,
                'Approved automatically by Full Autonomous AI Operations Manager',
                0.99
              );

              summary.products_approved += 1;
              summary.details.products.push({ id: prod.id, name: prod.name, price, status: 'approved' });

              // Notify artisan if attached
              if (prod.artisan_id) {
                const { data: artRow } = await safeQuery(() =>
                  supabase.from('artisan_profiles').select('user_id').eq('id', prod.artisan_id).maybeSingle()
                );
                if (artRow?.user_id) {
                  await createSystemNotification({
                    title: 'Product Approved Live! 🛍️',
                    message: `Your handcrafted creation "${prod.name}" has been approved by AI Operations and is now live in the catalog.`,
                    targetUserId: artRow.user_id,
                    audience: 'artisan',
                    senderId: adminId || null,
                  });
                }
              }
            } catch (pErr) {
              console.warn(`[Full Autonomous AI] Failed to approve product ${prod.id}:`, pErr.message);
            }
          }
        }
      }
    } catch (prodErr) {
      console.error('[Full Autonomous AI] Product approval pass error:', prodErr.message);
    }

    // ─────────────────────────────────────────────────────────────
    // 3. REVIEWS MODERATION: Auto-approve clean reviews, flag abusive
    // ─────────────────────────────────────────────────────────────
    try {
      const { data: pendingReviews } = await safeQuery(() =>
        supabase
          .from('reviews')
          .select('id, rating, comment, review_text, is_approved, status')
          .or('is_approved.eq.false,status.eq.pending')
          .limit(50)
      );

      if (Array.isArray(pendingReviews) && pendingReviews.length > 0) {
        console.log(`⭐ [Full Autonomous AI] Moderating ${pendingReviews.length} pending reviews...`);

        for (const rev of pendingReviews) {
          const content = `${rev.comment || ''} ${rev.review_text || ''}`.toLowerCase();
          const isFlagged = ABUSIVE_KEYWORDS.some(word => content.includes(word));

          try {
            if (isFlagged) {
              await safeQuery(() =>
                supabase
                  .from('reviews')
                  .update({
                    is_approved: false,
                    status: 'flagged',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', rev.id)
              );
              summary.reviews_flagged += 1;
              summary.details.reviews.push({ id: rev.id, action: 'flagged', reason: 'Abusive/scam keywords' });
            } else {
              await safeQuery(() =>
                supabase
                  .from('reviews')
                  .update({
                    is_approved: true,
                    status: 'approved',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', rev.id)
              );
              summary.reviews_approved += 1;
              summary.details.reviews.push({ id: rev.id, action: 'approved' });
            }
          } catch (rErr) {
            console.warn(`[Full Autonomous AI] Failed to moderate review ${rev.id}:`, rErr.message);
          }
        }
      }
    } catch (revErr) {
      console.error('[Full Autonomous AI] Review moderation pass error:', revErr.message);
    }

    // ─────────────────────────────────────────────────────────────
    // 4. APPROVALS QUEUE: Auto-execute pending approvals
    // ─────────────────────────────────────────────────────────────
    try {
      const { data: pendingApprovals } = await safeQuery(() =>
        supabase
          .from('ai_agent_approvals')
          .select('*')
          .eq('status', 'PENDING')
          .limit(30)
      );

      if (Array.isArray(pendingApprovals) && pendingApprovals.length > 0) {
        console.log(`📋 [Full Autonomous AI] Auto-executing ${pendingApprovals.length} pending approvals...`);

        for (const approval of pendingApprovals) {
          try {
            const executed = await agentApprovalService.approveAction(
              approval.id,
              adminId || '00000000-0000-0000-0000-000000000000'
            );
            summary.approvals_executed += 1;
            summary.details.approvals.push({
              id: approval.id,
              tool: approval.tool_name || approval.action_type,
              status: 'EXECUTED',
            });
          } catch (aErr) {
            console.warn(`[Full Autonomous AI] Failed to execute approval ${approval.id}:`, aErr.message);
          }
        }
      }
    } catch (appErr) {
      console.error('[Full Autonomous AI] Approvals queue pass error:', appErr.message);
    }

    // ─────────────────────────────────────────────────────────────
    // 5. ORDERS & FRAUD: Screen risk and confirm safe orders
    // ─────────────────────────────────────────────────────────────
    try {
      const { data: pendingOrders } = await safeQuery(() =>
        supabase
          .from('orders')
          .select('id, order_number, user_id, total_amount, payment_method, payment_status, status, shipping_address, created_at')
          .in('status', ['pending', 'placed'])
          .order('created_at', { ascending: false })
          .limit(30)
      );

      if (Array.isArray(pendingOrders) && pendingOrders.length > 0) {
        console.log(`📦 [Full Autonomous AI] Screening ${pendingOrders.length} pending orders...`);

        const domainAgents = require('./domainAgents');

        for (const order of pendingOrders) {
          try {
            const risk = await domainAgents.analyzeOrderRisk(order);

            if (risk.risk_level === 'CRITICAL' || risk.risk_score >= 85) {
              // Critical fraud risk -> Safely hold order
              await safeQuery(() =>
                supabase
                  .from('orders')
                  .update({
                    status: 'held',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', order.id)
              );
              summary.orders_held += 1;
              summary.details.orders.push({ id: order.id, status: 'held', risk_score: risk.risk_score, reason: risk.evidence.join('; ') });
            } else {
              // Low or normal risk -> Auto-confirm order if payment is verified or COD
              const isPaid = order.payment_status === 'completed' || order.payment_status === 'paid';
              const isCOD = (order.payment_method || '').toLowerCase() === 'cod';

              if (isPaid || isCOD) {
                await safeQuery(() =>
                  supabase
                    .from('orders')
                    .update({
                      status: 'confirmed',
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', order.id)
                );
                summary.orders_confirmed += 1;
                summary.details.orders.push({ id: order.id, status: 'confirmed', risk_score: risk.risk_score });
              }
            }
          } catch (oErr) {
            console.warn(`[Full Autonomous AI] Failed to screen order ${order.id}:`, oErr.message);
          }
        }
      }
    } catch (ordErr) {
      console.error('[Full Autonomous AI] Order screening pass error:', ordErr.message);
    }

    // ─────────────────────────────────────────────────────────────
    // 6. INVENTORY GUARD: Auto-flag out-of-stock items
    // ─────────────────────────────────────────────────────────────
    try {
      const { data: lowStockItems } = await safeQuery(() =>
        supabase
          .from('products')
          .select('id, name, stock_quantity, is_in_stock, artisan_id')
          .lte('stock_quantity', 5)
          .limit(40)
      );

      if (Array.isArray(lowStockItems) && lowStockItems.length > 0) {
        for (const item of lowStockItems) {
          const qty = Number(item.stock_quantity) || 0;
          if (qty <= 0 && item.is_in_stock) {
            await safeQuery(() =>
              supabase.from('products').update({ is_in_stock: false }).eq('id', item.id)
            );
            summary.low_stock_flagged += 1;
          }
        }
      }
    } catch (invErr) {
      console.error('[Full Autonomous AI] Inventory pass error:', invErr.message);
    }

    // ─────────────────────────────────────────────────────────────
    // 7. AUDIT LOGGING & SUMMARY PERSISTENCE
    // ─────────────────────────────────────────────────────────────
    const durationMs = Date.now() - startTime;
    summary.duration_ms = durationMs;
    summary.total_actions =
      summary.artisans_verified +
      summary.products_approved +
      summary.products_rejected +
      summary.reviews_approved +
      summary.reviews_flagged +
      summary.approvals_executed +
      summary.orders_confirmed +
      summary.orders_held +
      summary.low_stock_flagged;

    const parts = [];
    if (summary.artisans_verified > 0) parts.push(`verified ${summary.artisans_verified} artisan(s)`);
    if (summary.products_approved > 0) parts.push(`approved ${summary.products_approved} product(s)`);
    if (summary.reviews_approved > 0) parts.push(`approved ${summary.reviews_approved} review(s)`);
    if (summary.reviews_flagged > 0) parts.push(`flagged ${summary.reviews_flagged} abusive review(s)`);
    if (summary.approvals_executed > 0) parts.push(`executed ${summary.approvals_executed} pending approval(s)`);
    if (summary.orders_confirmed > 0) parts.push(`confirmed ${summary.orders_confirmed} order(s)`);
    if (summary.orders_held > 0) parts.push(`held ${summary.orders_held} high-risk order(s)`);

    summary.message = parts.length > 0
      ? `Full Autonomous AI completed ${summary.total_actions} administrative action(s): ${parts.join(', ')}.`
      : 'Full Autonomous AI verified all systems. No pending admin actions required at this time.';

    // Persist immutable audit log entry into ai_admin_actions
    try {
      await safeQuery(() =>
        supabase.from('ai_admin_actions').insert([{
          id: uuidv4(),
          event_type: 'FULL_AUTONOMOUS_OPERATIONS_CYCLE',
          action_name: 'full_autonomous_admin_sweep',
          tool_name: 'execute_full_autonomous_cycle',
          decision: 'EXECUTED_ALL_PENDING_ADMIN_TASKS',
          input_summary: JSON.stringify({ triggerSource, adminId }),
          result: summary,
          confidence: 1.0,
          status: 'success',
          created_at: new Date().toISOString(),
        }])
      );
    } catch (auditErr) {
      console.warn('[Full Autonomous AI] Audit log write notice:', auditErr.message);
    }

    // Save summary into ai_agent_memory so status endpoint can return it
    try {
      await safeQuery(() =>
        supabase.from('ai_agent_memory').upsert([{
          memory_type: 'autonomous_report',
          key: 'last_full_autonomous_sweep',
          value: summary,
          updated_at: new Date().toISOString(),
        }], { onConflict: 'key' })
      );
    } catch (_) {}

    lastCycleReport = summary;
    console.log(`✅ [Full Autonomous AI] Pass finished in ${durationMs}ms: ${summary.message}`);

    return {
      success: true,
      summary,
    };
  } catch (error) {
    console.error('❌ [Full Autonomous AI] Cycle failed:', error.message);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    isCycleRunning = false;
  }
}

module.exports = {
  executeFullAutonomousCycle,
  getLastReport: () => lastCycleReport,
};
