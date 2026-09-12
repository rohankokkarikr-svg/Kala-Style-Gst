/**
 * backend/services/suspiciousOrderService.js
 * ─────────────────────────────────────────────────────────────────
 * AI-assisted suspicious order and transaction analysis engine.
 * Computes multi-signal behavioral risk scores without biased accusations.
 * Classifies orders into: normal, review_required, high_risk.
 */

const supabase = require('../config/supabase');

/**
 * Evaluate operational risk signals for an order.
 *
 * @param {object} order - Master order object with user_id, total_amount, payment_method, shipping_address, phone, items
 * @returns {Promise<{ riskScore: number, riskStatus: string, reasons: string[], recommendedAction: string }>}
 */
exports.evaluateOrderRisk = async (order) => {
  let score = 0;
  const reasons = [];

  const userId = order.user_id;
  const paymentMethod = (order.payment_method || 'cod').toLowerCase();
  const totalAmount = Number(order.total_amount || order.total_price || 0);
  const phone = String(order.phone || '').replace(/[^\d]/g, '');
  const address = String(order.shipping_address || '').trim();

  // 1. Signal: Abnormal High Order Value on COD
  if (paymentMethod === 'cod' && totalAmount > 15000) {
    score += 35;
    reasons.push(`High COD basket value (₹${totalAmount.toLocaleString('en-IN')}) exceeds standard ₹15,000 threshold.`);
  } else if (paymentMethod === 'cod' && totalAmount > 25000) {
    score += 55;
    reasons.push(`Very high COD basket value (₹${totalAmount.toLocaleString('en-IN')}) requires manual merchant verification.`);
  }

  // 2. Signal: Phone number length / format validation
  if (phone.length < 10 || phone.length > 13) {
    score += 25;
    reasons.push(`Non-standard phone number format provided: ${order.phone || 'None'}`);
  }

  // 3. Signal: Address sanity
  if (address.length < 12) {
    score += 30;
    reasons.push('Incomplete or extremely brief shipping address detected.');
  }

  // Check for repeated sequential characters or dummy words in address
  if (/(test|dummy|fake|asdf|qwerty|123456)/i.test(address)) {
    score += 40;
    reasons.push('Address contains placeholder test terms.');
  }

  // 4. Signal: Historical User Order Behavior (if user is authenticated)
  if (userId) {
    try {
      // Check previous cancellations
      const { data: pastOrders } = await supabase
        .from('orders')
        .select('id, order_status, status, payment_method, payment_status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (pastOrders && pastOrders.length > 0) {
        const cancelledCount = pastOrders.filter(o => (o.order_status || o.status) === 'cancelled').length;
        const failedPayments = pastOrders.filter(o => o.payment_status === 'failed').length;
        const codPendingCount = pastOrders.filter(o => o.payment_method === 'cod' && (o.order_status || o.status) === 'pending').length;

        if (cancelledCount >= 3) {
          score += 25;
          reasons.push(`User has ${cancelledCount} recently cancelled orders.`);
        }

        if (failedPayments >= 3) {
          score += 20;
          reasons.push(`User account has ${failedPayments} recorded failed payment attempts.`);
        }

        if (codPendingCount >= 2 && paymentMethod === 'cod') {
          score += 25;
          reasons.push(`Customer already has ${codPendingCount} pending unfulfilled COD orders.`);
        }

        // Positive signal: frequent good history reduces risk!
        const deliveredCount = pastOrders.filter(o => (o.order_status || o.status) === 'delivered').length;
        if (deliveredCount >= 2) {
          score = Math.max(0, score - 20); // Trust bonus
        }
      }
    } catch (e) {
      // Non-fatal query catch
    }
  }

  // Final scoring & classification
  score = Math.min(100, Math.max(0, score));

  let riskStatus = 'normal';
  let recommendedAction = 'PROCEED';

  if (score >= 70) {
    riskStatus = 'high_risk';
    recommendedAction = 'MANUAL_ADMIN_CONFIRMATION_REQUIRED';
  } else if (score >= 35) {
    riskStatus = 'review_required';
    recommendedAction = 'PHONE_VERIFICATION_RECOMMENDED';
  }

  return {
    riskScore: score,
    riskStatus,
    reasons: reasons.length > 0 ? reasons : ['All standard transaction signals verify normally.'],
    recommendedAction,
  };
};

/**
 * Retrieve list of orders flagged for review or high risk.
 */
exports.getSuspiciousOrders = async ({ limit = 20, status = 'review_required' }) => {
  try {
    let query = supabase
      .from('orders')
      .select(`
        id, order_number, user_id, total_amount, payment_method, payment_status,
        order_status, status, shipping_name, shipping_address, phone,
        risk_status, risk_score, risk_reasons, created_at,
        users (name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status === 'all') {
      query = query.in('risk_status', ['review_required', 'high_risk']);
    } else if (status) {
      query = query.eq('risk_status', status);
    }

    let { data, error } = await query;

    // Fallback: If risk_status column is not yet migrated in database, evaluate dynamically
    if (error && (error.message.includes('risk_status') || error.code === '42703')) {
      const { data: rawOrders } = await supabase
        .from('orders')
        .select(`
          id, order_number, user_id, total_amount, payment_method, payment_status,
          order_status, status, shipping_address, phone, created_at,
          users (name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(Math.max(limit * 2, 30));

      const dynamicList = [];
      for (const ord of (rawOrders || [])) {
        const evalRes = await exports.evaluateOrderRisk(ord);
        if (status === 'all') {
          if (evalRes.riskStatus === 'review_required' || evalRes.riskStatus === 'high_risk') {
            dynamicList.push({ ...ord, ...evalRes });
          }
        } else if (evalRes.riskStatus === status) {
          dynamicList.push({ ...ord, ...evalRes });
        }
      }
      return dynamicList.slice(0, limit);
    }

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[suspiciousOrderService] getSuspiciousOrders notice:', err.message);
    return [];
  }
};
