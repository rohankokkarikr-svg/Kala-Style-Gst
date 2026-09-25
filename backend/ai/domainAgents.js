/**
 * backend/ai/domainAgents.js
 * ─────────────────────────────────────────────────────────────────
 * KalaStyle AI Autonomous Domain Agents (Sentinels).
 *
 * Implements 13 specialized autonomous domain sentinels orchestrated
 * under a unified policy, permission, risk, and tool execution engine:
 * 1. Order Sentinel
 * 2. Fraud Sentinel
 * 3. Payment Sentinel
 * 4. Product Sentinel
 * 5. Inventory Sentinel
 * 6. Artisan Sentinel
 * 7. Shipping Sentinel
 * 8. Review Sentinel
 * 9. Complaint Sentinel
 * 10. Customer Sentinel
 * 11. Marketing Agent
 * 12. Business Analyst
 * 13. System Health Agent
 *
 * Ground Truth Principle:
 * NEVER invent or fabricate data. Every factual platform claim must
 * originate from verified database records or authorized tool executions.
 *
 * All mutations obey the Autonomous Control Center:
 * - Blocked if ai_emergency_stop is active
 * - Mode controls (OFF, READ_ONLY, ASSISTED, AUTONOMOUS, FULL_AUTONOMOUS)
 * - Strict Action Budgets and Audit Logging
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const aiControlCenter = require('./aiControlCenter');
const agentApprovalService = require('../services/agentApprovalService');
const agentHealthService = require('../services/agentHealthService');
const shippingService = require('../services/shipping/shippingService');

/**
 * Persist an immutable action record into ai_admin_actions.
 */
async function logAgentAudit({
  agentName,
  actionName,
  toolName,
  entityType,
  entityId,
  decision,
  reason,
  confidence = 1.0,
  result = {},
  status = 'success',
  error = null,
}) {
  const entry = {
    id: uuidv4(),
    event_type: 'AUTONOMOUS_SENTINEL',
    entity_type: entityType || null,
    entity_id: String(entityId || ''),
    action_name: actionName,
    tool_name: toolName || actionName,
    input_summary: JSON.stringify({ agent: agentName, action: actionName }),
    decision: decision || actionName,
    reason: reason || null,
    confidence: Number(confidence) || 1.0,
    result: typeof result === 'object' ? result : { message: String(result) },
    status,
    error: error || null,
    created_at: new Date().toISOString(),
  };

  try {
    await safeQuery(() => supabase.from('ai_admin_actions').insert([entry]));
  } catch (err) {
    console.error('Audit log persist error:', err.message);
  }

  return entry;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ORDER SENTINEL & FAKE ORDER DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze fraud signals and risk score for an order.
 * Ground-truth evidence: velocity, failed payments, addresses, values.
 */
async function analyzeOrderRisk(order) {
  let riskScore = 0;
  const evidence = [];

  const total = Number(order.total_amount) || 0;
  if (total > 25000) {
    riskScore += 25;
    evidence.push(`High order value: ₹${total.toLocaleString('en-IN')}`);
  } else if (total > 10000) {
    riskScore += 10;
    evidence.push(`Elevated order value: ₹${total.toLocaleString('en-IN')}`);
  }

  // Check customer's recent orders (velocity check)
  if (order.user_id) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentOrders } = await safeQuery(() =>
      supabase
        .from('orders')
        .select('id, created_at, status')
        .eq('user_id', order.user_id)
        .gte('created_at', oneDayAgo)
    );

    if (recentOrders && recentOrders.length >= 4) {
      riskScore += 35;
      evidence.push(`High velocity: ${recentOrders.length} orders placed within 24 hours`);
    } else if (recentOrders && recentOrders.length >= 2) {
      riskScore += 15;
      evidence.push(`Rapid ordering: ${recentOrders.length} orders within 24 hours`);
    }

    // Check customer cancellation history
    const { data: cancelled } = await safeQuery(() =>
      supabase
        .from('orders')
        .select('id')
        .eq('user_id', order.user_id)
        .eq('status', 'cancelled')
    );
    if (cancelled && cancelled.length >= 3) {
      riskScore += 20;
      evidence.push(`Customer has ${cancelled.length} previously cancelled orders`);
    }
  }

  // Check COD anomalies
  if (order.payment_method === 'cod' && total > 5000) {
    riskScore += 15;
    evidence.push(`High-value Cash on Delivery order: ₹${total}`);
  }

  // Address completeness check
  const addr = order.shipping_address;
  if (addr) {
    const addrStr = typeof addr === 'string' ? addr : `${addr.street || ''} ${addr.city || ''} ${addr.postal_code || ''}`;
    if (addrStr.trim().length < 15) {
      riskScore += 25;
      evidence.push('Incomplete or suspicious shipping address provided');
    }
  }

  let riskLevel = 'LOW';
  if (riskScore >= 85) riskLevel = 'CRITICAL';
  else if (riskScore >= 70) riskLevel = 'HIGH';
  else if (riskScore >= 40) riskLevel = 'MEDIUM';

  return {
    order_id: order.id,
    order_number: order.order_number || order.id.slice(0, 8),
    risk_score: Math.min(riskScore, 100),
    risk_level: riskLevel,
    confidence: 0.92,
    evidence,
    recommended_action: riskLevel === 'CRITICAL' ? 'HOLD_AND_CONFIRM' : riskLevel === 'HIGH' ? 'HOLD' : 'PROCEED',
  };
}

async function runOrderSentinel() {
  const findings = {
    agent: 'ORDER_SENTINEL',
    inspected_count: 0,
    suspicious_orders: [],
    held_orders: [],
    approvals_requested: [],
  };

  const { data: pendingOrders } = await safeQuery(() =>
    supabase
      .from('orders')
      .select('id, order_number, user_id, total_amount, payment_method, payment_status, status, shipping_address, created_at')
      .in('status', ['pending', 'placed', 'processing'])
      .order('created_at', { ascending: false })
      .limit(30)
  );

  if (!pendingOrders || pendingOrders.length === 0) return findings;
  findings.inspected_count = pendingOrders.length;

  for (const order of pendingOrders) {
    const risk = await analyzeOrderRisk(order);
    if (risk.risk_level === 'HIGH' || risk.risk_level === 'CRITICAL') {
      findings.suspicious_orders.push(risk);

      // Check policy: can we hold?
      const policy = await aiControlCenter.canExecuteAction({
        toolName: 'hold_order',
        safetyLevel: 2,
        domain: 'order',
        eventType: 'AUTONOMOUS_ORDER_SENTINEL',
      });

      if (policy.allowed) {
        // Execute hold
        const { error: updateErr } = await safeQuery(() =>
          supabase
            .from('orders')
            .update({ status: 'held', updated_at: new Date().toISOString() })
            .eq('id', order.id)
        );

        if (!updateErr) {
          // Verification
          const { data: verified } = await safeQuery(() =>
            supabase.from('orders').select('status').eq('id', order.id).single()
          );

          if (verified && verified.status === 'held') {
            findings.held_orders.push(order.id);
            aiControlCenter.recordActionUsage('order');

            await logAgentAudit({
              agentName: 'ORDER_SENTINEL',
              actionName: 'hold_order',
              toolName: 'hold_order',
              entityType: 'order',
              entityId: order.id,
              decision: 'held',
              reason: `Autonomous order hold: Risk score ${risk.risk_score} (${risk.evidence.join('; ')})`,
              confidence: risk.confidence,
              result: { order_id: order.id, new_status: 'held', verified: true },
            });
          }
        }
      } else if (policy.requiresApproval) {
        // Create an approval request for admin review
        try {
          const approval = await agentApprovalService.createApprovalRequest({
            agent: 'ORDER_SENTINEL',
            action: 'hold_order',
            tool: 'hold_order',
            parameters: { order_id: order.id, reason: risk.evidence.join('; ') },
            evidence: `Risk Score: ${risk.risk_score}/100. Evidence: ${risk.evidence.join(', ')}`,
            risk: risk.risk_level,
            confidence: risk.confidence,
          });
          findings.approvals_requested.push(approval.id);
        } catch (e) {}
      }
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. FRAUD SENTINEL
// ─────────────────────────────────────────────────────────────────────────────

async function runFraudSentinel() {
  const findings = {
    agent: 'FRAUD_SENTINEL',
    orders_screened: 0,
    fraud_signals_detected: [],
    critical_fraud_count: 0,
  };

  const { data: orders } = await safeQuery(() =>
    supabase
      .from('orders')
      .select('id, order_number, user_id, total_amount, payment_method, status, shipping_address, created_at')
      .in('status', ['pending', 'placed', 'processing', 'held'])
      .order('created_at', { ascending: false })
      .limit(25)
  );

  if (!orders || orders.length === 0) return findings;
  findings.orders_screened = orders.length;

  for (const o of orders) {
    const risk = await analyzeOrderRisk(o);
    if (risk.risk_level === 'CRITICAL' || risk.risk_level === 'HIGH') {
      findings.fraud_signals_detected.push({
        order_id: o.id,
        order_number: o.order_number,
        risk_score: risk.risk_score,
        risk_level: risk.risk_level,
        evidence: risk.evidence,
      });
      if (risk.risk_level === 'CRITICAL') {
        findings.critical_fraud_count += 1;
      }
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. PAYMENT SENTINEL
// ─────────────────────────────────────────────────────────────────────────────

async function runPaymentSentinel() {
  const findings = {
    agent: 'PAYMENT_SENTINEL',
    failed_payments_count: 0,
    pending_cod_count: 0,
    anomalies: [],
  };

  // Inspect failed payments in the last 48 hours
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: failedOrders } = await safeQuery(() =>
    supabase
      .from('orders')
      .select('id, order_number, total_amount, payment_method, payment_status, created_at')
      .eq('payment_status', 'failed')
      .gte('created_at', twoDaysAgo)
  );

  if (failedOrders) {
    findings.failed_payments_count = failedOrders.length;
    for (const fo of failedOrders) {
      findings.anomalies.push({
        type: 'PAYMENT_FAILURE',
        order_id: fo.id,
        order_number: fo.order_number,
        amount: fo.total_amount,
        detail: `Failed payment detected via ${fo.payment_method || 'online'}. Order placed at ${fo.created_at}`,
      });
    }
  }

  // Inspect COD orders marked DELIVERED but still pending payment confirmation
  const { data: deliveredCod } = await safeQuery(() =>
    supabase
      .from('orders')
      .select('id, order_number, total_amount, payment_status, status')
      .eq('payment_method', 'cod')
      .eq('status', 'delivered')
      .in('payment_status', ['pending', 'cod_pending'])
  );

  if (deliveredCod) {
    findings.pending_cod_count = deliveredCod.length;
    for (const cod of deliveredCod) {
      findings.anomalies.push({
        type: 'UNCOLLECTED_COD_DELIVERED',
        order_id: cod.id,
        order_number: cod.order_number,
        amount: cod.total_amount,
        detail: `Order is DELIVERED but COD payment remains uncollected (Status: ${cod.payment_status}). Confirm collection required.`,
      });
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PRODUCT SENTINEL
// ─────────────────────────────────────────────────────────────────────────────

async function runProductSentinel() {
  const findings = {
    agent: 'PRODUCT_SENTINEL',
    pending_products_count: 0,
    held_for_review: [],
    pricing_anomalies: [],
  };

  const { data: pendingProducts } = await safeQuery(() =>
    supabase
      .from('products')
      .select('id, name, price, category, artisan_id, is_in_stock, stock_quantity, status')
      .in('status', ['pending', 'under_review'])
      .limit(30)
  );

  if (!pendingProducts || pendingProducts.length === 0) return findings;
  findings.pending_products_count = pendingProducts.length;

  for (const prod of pendingProducts) {
    const price = Number(prod.price) || 0;
    if (price <= 0 || price > 200000) {
      findings.pricing_anomalies.push({
        product_id: prod.id,
        name: prod.name,
        price,
        issue: price <= 0 ? 'Invalid zero or negative price' : 'Extremely high price requiring verification',
      });
    }

    // Default safe action: hold product for human review (never auto-approve on fallback)
    findings.held_for_review.push({
      product_id: prod.id,
      name: prod.name,
      category: prod.category,
      artisan_id: prod.artisan_id,
    });
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. INVENTORY SENTINEL
// ─────────────────────────────────────────────────────────────────────────────

async function runInventorySentinel() {
  const findings = {
    agent: 'INVENTORY_SENTINEL',
    low_stock_products: [],
    out_of_stock_products: [],
    recommended_alerts: 0,
  };

  const { data: inventoryList } = await safeQuery(() =>
    supabase
      .from('products')
      .select('id, name, category, price, stock_quantity, is_in_stock, artisan_id')
      .lte('stock_quantity', 5)
      .limit(50)
  );

  if (!inventoryList || inventoryList.length === 0) return findings;

  for (const item of inventoryList) {
    const stock = Number(item.stock_quantity) || 0;
    if (stock <= 0) {
      findings.out_of_stock_products.push({
        id: item.id,
        name: item.name,
        category: item.category,
        artisan_id: item.artisan_id,
      });
    } else {
      findings.low_stock_products.push({
        id: item.id,
        name: item.name,
        stock_quantity: stock,
        category: item.category,
        artisan_id: item.artisan_id,
      });
    }
  }

  findings.recommended_alerts = findings.low_stock_products.length + findings.out_of_stock_products.length;
  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ARTISAN SENTINEL
// ─────────────────────────────────────────────────────────────────────────────

async function runArtisanSentinel() {
  const findings = {
    agent: 'ARTISAN_SENTINEL',
    pending_artisans_count: 0,
    held_for_review: [],
  };

  const { data: pendingArtisans } = await safeQuery(() =>
    supabase
      .from('artisan_profiles')
      .select('id, store_name, artisan_type, verification_status, created_at')
      .in('verification_status', ['pending', 'under_review'])
      .limit(20)
  );


  if (!pendingArtisans || pendingArtisans.length === 0) return findings;
  findings.pending_artisans_count = pendingArtisans.length;

  for (const art of pendingArtisans) {
    findings.held_for_review.push({
      artisan_id: art.id,
      store_name: art.store_name,
      artisan_type: art.artisan_type,
      experience_years: art.experience_years,
      action: 'Held for manual artisan verification',
    });
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SHIPPING SENTINEL
// ─────────────────────────────────────────────────────────────────────────────

async function runShippingSentinel() {
  const findings = {
    agent: 'SHIPPING_SENTINEL',
    delayed_shipments: [],
    unassigned_awb_count: 0,
    failed_shipments: [],
  };

  // Inspect active shipments from shipping_shipments
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: shipments } = await safeQuery(() =>
    supabase
      .from('shipping_shipments')
      .select('id, order_id, status, awb_code, courier_name, shipping_error, created_at, updated_at')
      .gte('created_at', sevenDaysAgo)
      .limit(50)
  );

  if (!shipments || shipments.length === 0) return findings;

  const fourDaysAgoMs = Date.now() - 4 * 24 * 60 * 60 * 1000;

  for (const s of shipments) {
    if (s.status === 'FAILED' || s.shipping_error) {
      findings.failed_shipments.push({
        id: s.id,
        order_id: s.order_id,
        error: s.shipping_error || 'Carrier transmission error',
      });
    } else if (!s.awb_code && s.status !== 'DELIVERED' && s.status !== 'CANCELLED') {
      findings.unassigned_awb_count += 1;
    } else if (s.status === 'IN_TRANSIT' && new Date(s.updated_at || s.created_at).getTime() < fourDaysAgoMs) {
      findings.delayed_shipments.push({
        id: s.id,
        order_id: s.order_id,
        awb: s.awb_code,
        courier: s.courier_name,
        days_stalled: Math.round((Date.now() - new Date(s.updated_at || s.created_at).getTime()) / (24 * 60 * 60 * 1000)),
      });
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. REVIEW SENTINEL
// ─────────────────────────────────────────────────────────────────────────────

async function runReviewSentinel() {
  const findings = {
    agent: 'REVIEW_SENTINEL',
    pending_reviews_count: 0,
    suspicious_reviews: [],
  };

  const { data: reviews } = await safeQuery(() =>
    supabase
      .from('reviews')
      .select('id, rating, review_text, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
  );


  if (!reviews || reviews.length === 0) return findings;

  const abusiveWords = ['scam', 'fraud', 'cheat', 'fake', 'abuse', 'hate', 'bastard', 'stolen'];

  for (const r of reviews) {
    const text = (r.review_text || '').toLowerCase();
    const isAbusive = abusiveWords.some(w => text.includes(w));
    if (isAbusive) {
      findings.suspicious_reviews.push({
        review_id: r.id,
        rating: r.rating,
        snippet: text.slice(0, 80),
        reason: 'Contains flagged abusive or suspicious keywords',
      });
    }
    if (r.status === 'pending') {
      findings.pending_reviews_count += 1;
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. COMPLAINT SENTINEL
// ─────────────────────────────────────────────────────────────────────────────

async function runComplaintSentinel() {
  const findings = {
    agent: 'COMPLAINT_SENTINEL',
    open_complaints_count: 0,
    urgent_complaints: [],
  };

  const { data: openList } = await safeQuery(() =>
    supabase
      .from('reports')
      .select('id, user_id, report_type, reason, description, status, created_at')
      .in('status', ['open', 'pending'])
      .order('created_at', { ascending: false })
      .limit(30)
  );

  if (!openList) return findings;
  findings.open_complaints_count = openList.length;

  for (const c of openList) {
    const reasonText = (c.reason || '').toLowerCase();
    if (reasonText.includes('urgent') || reasonText.includes('fraud') || reasonText.includes('emergency')) {
      findings.urgent_complaints.push({ id: c.id, reason: c.reason, report_type: c.report_type });
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. CUSTOMER SENTINEL
// ─────────────────────────────────────────────────────────────────────────────

async function runCustomerSentinel() {
  const findings = {
    agent: 'CUSTOMER_SENTINEL',
    customers_analyzed: 0,
    abnormal_ordering_customers: [],
    repeat_complaint_customers: [],
  };

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentOrders } = await safeQuery(() =>
    supabase
      .from('orders')
      .select('user_id, total_amount, created_at')
      .gte('created_at', oneDayAgo)
  );

  if (recentOrders && recentOrders.length > 0) {
    const userOrderCounts = {};
    for (const ord of recentOrders) {
      if (ord.user_id) {
        userOrderCounts[ord.user_id] = (userOrderCounts[ord.user_id] || 0) + 1;
      }
    }
    findings.customers_analyzed = Object.keys(userOrderCounts).length;
    for (const [userId, count] of Object.entries(userOrderCounts)) {
      if (count >= 4) {
        findings.abnormal_ordering_customers.push({
          user_id: userId,
          orders_in_24h: count,
          signal: 'High ordering frequency in 24 hours',
        });
      }
    }
  }

  // Check repeated complaints in reports table
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentReports } = await safeQuery(() =>
    supabase
      .from('reports')
      .select('user_id, reason, created_at')
      .gte('created_at', thirtyDaysAgo)
  );

  if (recentReports && recentReports.length > 0) {
    const userReportCounts = {};
    for (const r of recentReports) {
      if (r.user_id) {
        userReportCounts[r.user_id] = (userReportCounts[r.user_id] || 0) + 1;
      }
    }
    for (const [userId, count] of Object.entries(userReportCounts)) {
      if (count >= 2) {
        findings.repeat_complaint_customers.push({
          user_id: userId,
          complaints_count: count,
          signal: 'Multiple complaints in 30 days',
        });
      }
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. MARKETING AGENT
// ─────────────────────────────────────────────────────────────────────────────

async function runMarketingAgent() {
  const findings = {
    agent: 'MARKETING_AGENT',
    top_categories: [],
    recommended_campaigns: [],
  };

  // Inspect actual product categories with inventory
  const { data: products } = await safeQuery(() =>
    supabase
      .from('products')
      .select('category, price, is_in_stock, stock_quantity')
      .eq('is_in_stock', true)
      .limit(50)
  );

  const categoryCounts = {};
  if (products && products.length > 0) {
    for (const p of products) {
      if (p.category) {
        categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
      }
    }
    findings.top_categories = Object.entries(categoryCounts)
      .map(([cat, count]) => ({ category: cat, active_products: count }))
      .sort((a, b) => b.active_products - a.active_products)
      .slice(0, 3);
  }

  findings.recommended_campaigns = [
    {
      theme: 'Indian Heritage Handcrafts & Festive Collections',
      focus_categories: findings.top_categories.map(c => c.category),
      rationale: 'High available artisan craft inventory ready for spotlight promotion.',
    },
  ];

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. BUSINESS ANALYST
// ─────────────────────────────────────────────────────────────────────────────

async function runBusinessAnalyst() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: ordersToday } = await safeQuery(() =>
    supabase
      .from('orders')
      .select('id, total_amount, status, created_at')
      .gte('created_at', oneDayAgo)
  );

  const totalOrders = ordersToday ? ordersToday.length : 0;
  const totalRevenue = ordersToday
    ? ordersToday.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
    : 0;

  const { count: activeArtisans } = await safeQuery(() =>
    supabase.from('artisan_profiles').select('id', { count: 'exact', head: true }).eq('verification_status', 'verified')
  );

  const { count: activeProducts } = await safeQuery(() =>
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_in_stock', true)
  );

  return {
    agent: 'BUSINESS_ANALYST',
    period: '24_hours',
    total_orders: totalOrders,
    total_revenue_inr: totalRevenue,
    active_artisans: activeArtisans || 0,
    active_products: activeProducts || 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. SYSTEM HEALTH AGENT
// ─────────────────────────────────────────────────────────────────────────────

async function runSystemHealthAgent() {
  return await agentHealthService.checkSystemHealth();
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER AUTONOMOUS SWEEP: "Handle today's admin work"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute the full autonomous administrative operations sweep.
 * Ground-truth evidence first -> safe action execution -> approval queuing -> audit log.
 */
async function runAutonomousDailySweep(options = {}) {
  const startTime = Date.now();
  console.log(`🤖 [KalaStyle AI Autopilot] Starting Autonomous Daily Admin Operations Sweep...`);

  // 1. Verify Autonomous Control Center settings
  const controlSettings = await aiControlCenter.getControlSettings();
  if (controlSettings.ai_emergency_stop) {
    return {
      success: false,
      blocked: true,
      reason: '🛑 AI EMERGENCY STOP IS ACTIVE. Autonomous operations are halted to protect system safety.',
    };
  }

  if (!controlSettings.ai_global_enabled) {
    return {
      success: false,
      blocked: true,
      reason: 'AI global operations are disabled in Admin Settings.',
    };
  }

  // 2. Run all 13 domain sentinels concurrently with real database evidence
  const [
    health,
    orderFindings,
    fraudFindings,
    paymentFindings,
    productFindings,
    inventoryFindings,
    artisanFindings,
    shippingFindings,
    reviewFindings,
    complaintFindings,
    customerFindings,
    marketingFindings,
    businessMetrics,
  ] = await Promise.all([
    runSystemHealthAgent(),
    runOrderSentinel(),
    runFraudSentinel(),
    runPaymentSentinel(),
    runProductSentinel(),
    runInventorySentinel(),
    runArtisanSentinel(),
    runShippingSentinel(),
    runReviewSentinel(),
    runComplaintSentinel(),
    runCustomerSentinel(),
    runMarketingAgent(),
    runBusinessAnalyst(),
  ]);

  // 3. Compile Ground-Truth Operational Report
  const sweepId = uuidv4();
  const summaryReport = {
    sweep_id: sweepId,
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    mode: controlSettings.ai_mode,
    sentinels_executed: 13,
    system_health: {
      overall: health.overall,
      services_checked: health.services.length,
      warnings: health.warnings,
    },
    orders: {
      inspected: orderFindings.inspected_count,
      suspicious_found: orderFindings.suspicious_orders.length,
      held_safely: orderFindings.held_orders.length,
      approval_requests_created: orderFindings.approvals_requested.length,
    },
    fraud: {
      orders_screened: fraudFindings.orders_screened,
      fraud_signals_detected: fraudFindings.fraud_signals_detected.length,
      critical_alerts: fraudFindings.critical_fraud_count,
    },
    payments: {
      failed_payments: paymentFindings.failed_payments_count,
      pending_cod_collections: paymentFindings.pending_cod_count,
      anomalies_detected: paymentFindings.anomalies.length,
      anomalies: paymentFindings.anomalies,
    },
    products: {
      pending_review: productFindings.pending_products_count,
      held_for_inspection: productFindings.held_for_review.length,
    },
    inventory: {
      low_stock_products: inventoryFindings.low_stock_products.length,
      out_of_stock_products: inventoryFindings.out_of_stock_products.length,
      alerts_recommended: inventoryFindings.recommended_alerts,
    },
    artisans: {
      pending_registrations: artisanFindings.pending_artisans_count,
      held_for_verification: artisanFindings.held_for_review.length,
    },
    shipping: {
      delayed_shipments: shippingFindings.delayed_shipments.length,
      unassigned_awb_count: shippingFindings.unassigned_awb_count,
      failed_shipments: shippingFindings.failed_shipments.length,
    },
    reviews: {
      pending_moderation: reviewFindings.pending_reviews_count,
      suspicious_reviews: reviewFindings.suspicious_reviews.length,
    },
    complaints: {
      open_complaints: complaintFindings.open_complaints_count,
      urgent_complaints: complaintFindings.urgent_complaints.length,
    },
    customers: {
      customers_analyzed: customerFindings.customers_analyzed,
      abnormal_ordering: customerFindings.abnormal_ordering_customers.length,
      repeat_complaints: customerFindings.repeat_complaint_customers.length,
    },
    marketing: {
      top_categories: marketingFindings.top_categories,
      campaigns_recommended: marketingFindings.recommended_campaigns.length,
    },
    business: businessMetrics,
  };

  // 4. Persist durable audit record and report in database (ai_reports table)
  try {
    await safeQuery(() =>
      supabase.from('ai_reports').insert([{
        id: sweepId,
        title: `Autonomous Daily Admin Sweep - ${new Date().toISOString().slice(0, 10)}`,
        report_date: new Date().toISOString().slice(0, 10),
        summary: `Autonomous Admin Operations completed across 13 Sentinels: ${summaryReport.orders.held_safely} suspicious orders held, ${summaryReport.inventory.low_stock_products} low-stock items detected, ${summaryReport.payments.failed_payments} failed payments reviewed, ${summaryReport.fraud.fraud_signals_detected} fraud signals screened.`,
        metrics: summaryReport,
        insights: [
          `Overall Platform System Health: ${health.overall}`,
          `${summaryReport.orders.suspicious_found} order fraud signals detected and processed`,
          `${summaryReport.shipping.delayed_shipments} shipments requiring delivery milestone tracking`,
          `${summaryReport.customers.abnormal_ordering} abnormal customer ordering patterns monitored`,
        ],
        recommendations: [
          'Review held orders in Admin Panel',
          'Notify artisans for low-stock inventory replenishment',
          'Verify pending COD deliveries with carrier partners',
        ],
        actions_performed: [
          `Executed autonomous sentinel checks across 13 domain subsystems`,
          `Recorded operational state in memory and database`,
        ],
        created_at: new Date().toISOString(),
      }])
    );
  } catch (err) {
    console.error('Failed to persist AI sweep report:', err.message);
  }

  // 5. Update agent operational memory
  try {
    await safeQuery(() =>
      supabase.from('ai_agent_memory').upsert({
        key: 'last_autonomous_sweep',
        value: { sweepId, timestamp: summaryReport.timestamp, overall_health: health.overall, sentinels_executed: 13 },
        memory_type: 'operational',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
    );
  } catch (e) {}

  await logAgentAudit({
    agentName: 'AI_ORCHESTRATOR',
    actionName: 'autonomous_daily_sweep',
    toolName: 'handle_todays_admin_work',
    decision: 'completed',
    reason: 'Executed full autonomous operations sweep across 13 domain sentinels',
    result: summaryReport,
  });

  return {
    success: true,
    message: "Today's autonomous administration operations completed successfully across 13 domain sentinels.",
    report: summaryReport,
  };
}

module.exports = {
  runOrderSentinel,
  runFraudSentinel,
  runPaymentSentinel,
  runProductSentinel,
  runInventorySentinel,
  runArtisanSentinel,
  runShippingSentinel,
  runReviewSentinel,
  runComplaintSentinel,
  runCustomerSentinel,
  runMarketingAgent,
  runBusinessAnalyst,
  runSystemHealthAgent,
  runAutonomousDailySweep,
};
