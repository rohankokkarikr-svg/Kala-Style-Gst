/**
 * backend/routes/payments.js
 * ─────────────────────────────────────────────────────────────────
 * Comprehensive Razorpay & Payment Route Handler for KalaStyle AI
 * Supports:
 * 1. POST /api/payments/create-order — Server-side calculation & Razorpay order creation
 * 2. POST /api/payments/verify       — Client-side signature verification & order confirmation
 * 3. POST /api/payments/webhook      — Raw body HMAC verification, idempotent webhook processing
 * 4. POST /api/payments/refund       — Safe backend refund processing via Razorpay Refund API
 * 5. GET  /api/payments/:orderId     — Authorized payment status retrieval
 */

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { protect, artisanOrAdmin, admin } = require('../middleware/auth');
const { createMasterOrder } = require('../services/orderService');
const {
  createRazorpayOrder,
  verifyRazorpaySignature,
  verifyWebhookSignature,
  createRefund,
  getPaymentDetails,
} = require('../services/paymentService');
const { reverseRewardIfNeeded } = require('../services/rewardService');
const { broadcastSync } = require('../utils/realtime');

// ─── 1. CREATE RAZORPAY ORDER (Server-Side Price Calculation) ────────────────
/**
 * POST /api/payments/create-order
 * Authenticated customer endpoint.
 * Recalculates all cart prices server-side, creates master & artisan sub-orders in DB,
 * initializes Razorpay order, and returns public payment details.
 */
router.post('/create-order', protect, async (req, res) => {
  try {
    const {
      items,
      shipping_name,
      phone,
      shipping_address,
      shipping_city,
      shipping_state,
      shipping_pincode,
      coupon_code,
      live_location_url,
    } = req.body;
    const userId = req.user.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order items are required' });
    }
    if (!phone) {
      return res.status(400).json({ error: 'Valid phone number is required' });
    }
    if (!shipping_address) {
      return res.status(400).json({ error: 'Shipping address is required' });
    }

    // 1. Server-side price calculation and database order reservation
    const orderResult = await createMasterOrder({
      userId,
      items,
      shippingData: {
        name: shipping_name || req.user.name || 'Customer',
        phone: String(phone).replace(/[^\d+]/g, '').substring(0, 20),
        address: shipping_address,
        city: shipping_city || '',
        state: shipping_state || '',
        pincode: shipping_pincode || '',
      },
      paymentMethod: 'razorpay',
      couponCode: coupon_code,
      liveLocationUrl: live_location_url,
    });

    if (orderResult.error) {
      return res.status(400).json({ error: orderResult.error });
    }

    const { order, artisanOrders, payment } = orderResult;

    // Ensure amount >= ₹1
    const totalAmount = Math.max(1, Math.round(Number(order.total_amount) || 1));

    // 2. Create Razorpay order via official SDK
    const rzpResult = await createRazorpayOrder(totalAmount, order.order_number, {
      order_id: order.id,
      user_id: userId,
      order_number: order.order_number,
    });

    if (!rzpResult.success) {
      console.error('[create-order] Razorpay API error:', rzpResult.error);
      return res.status(500).json({
        error: 'Failed to initiate payment gateway. Please try again or choose Cash on Delivery.',
      });
    }

    const razorpayOrderId = rzpResult.order.id;

    // 3. Link Razorpay order ID to our internal order and payment records
    await supabase
      .from('orders')
      .update({ razorpay_order_id: razorpayOrderId })
      .eq('id', order.id);

    await supabase
      .from('payments')
      .update({ provider_order_id: razorpayOrderId })
      .eq('order_id', order.id);

    // 4. Return safe payload to client (NEVER expose Key Secret)
    res.status(201).json({
      order_id: razorpayOrderId,
      amount: totalAmount * 100, // paise for frontend Razorpay options
      currency: 'INR',
      key_id: process.env.RAZORPAY_KEY_ID || '',
      order: {
        id: order.id,
        order_number: order.order_number,
        total_amount: totalAmount,
        subtotal: order.subtotal,
        delivery_fee: order.delivery_fee,
        discount: order.discount,
      },
    });
  } catch (err) {
    console.error('[create-order] Error:', err.message);
    res.status(500).json({ error: 'Internal server error while creating payment order' });
  }
});

// ─── 2. PAYMENT VERIFICATION (Client-side callback verification) ──────────────
/**
 * POST /api/payments/verify
 * Authenticated customer endpoint called right after customer completes checkout popup.
 * Verifies HMAC-SHA256 signature server-side using timing-safe comparison.
 */
router.post('/verify', protect, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification parameters' });
    }

    // 1. Verify HMAC-SHA256 signature using timingSafeEqual
    const isValid = verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      console.warn(`[verify] Invalid payment signature for order: ${orderId}`);
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }

    // 2. Fetch order to verify ownership
    let query = supabase.from('orders').select('*');
    if (orderId) {
      query = query.eq('id', orderId);
    } else {
      query = query.eq('razorpay_order_id', razorpay_order_id);
    }

    const { data: order, error: orderErr } = await query.maybeSingle();

    if (orderErr || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Verify user authorization (must be buyer or admin)
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to verify this order payment' });
    }

    // Idempotency check: if already verified and marked paid, return success
    if (order.payment_status === 'paid') {
      return res.json({
        success: true,
        message: 'Payment already verified',
        alreadyPaid: true,
        orderId: order.id,
      });
    }

    const now = new Date().toISOString();

    // 3. Mark master order paid & confirmed
    await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        order_status: 'confirmed',
        status: 'confirmed',
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        updated_at: now,
      })
      .eq('id', order.id);

    // 4. Update payments table
    await supabase
      .from('payments')
      .update({
        provider_order_id: razorpay_order_id,
        provider_payment_id: razorpay_payment_id,
        status: 'paid',
        signature_verified: true,
        paid_at: now,
        updated_at: now,
      })
      .eq('order_id', order.id);

    // 5. Activate artisan sub-orders from pending to accepted/ready
    await supabase
      .from('artisan_orders')
      .update({
        status: 'pending',
        updated_at: now,
      })
      .eq('order_id', order.id);

    // 6. Broadcast realtime sync events
    broadcastSync('PAYMENTS_UPDATED', {
      orderId: order.id,
      status: 'paid',
      razorpay_payment_id,
    });
    broadcastSync('ORDERS_UPDATED', {
      orderId: order.id,
      order_status: 'confirmed',
      payment_status: 'paid',
    });

    console.log(`[verify] ✅ Payment successfully verified for order ${order.id}`);
    res.json({
      success: true,
      message: 'Payment verified successfully',
      orderId: order.id,
    });
  } catch (err) {
    console.error('[verify] Verification exception:', err.message);
    res.status(500).json({ error: 'Payment verification error: ' + err.message });
  }
});

// ─── 3. WEBHOOK (Idempotent Server-to-Server Event Processing) ────────────────
/**
 * POST /api/payments/webhook
 * Public endpoint called by Razorpay servers.
 * Verifies signature using rawBody buffer. Idempotently processes payment events.
 */
router.post('/webhook', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // 1. Verify webhook signature if secret configured
  if (webhookSecret && signature) {
    const rawPayload = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    const isValid = verifyWebhookSignature(rawPayload, signature, webhookSecret);
    if (!isValid) {
      console.warn('[webhook] Invalid Razorpay webhook signature');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }
  }

  let event = req.body;
  if (typeof event === 'string' || Buffer.isBuffer(event)) {
    try {
      event = JSON.parse(event.toString());
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const eventType = event.event;
  console.log(`[webhook] Razorpay event: ${eventType}`);

  // Handle payment.captured or order.paid
  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    const payment = event.payload?.payment?.entity;
    if (payment) {
      const razorpayOrderId = payment.order_id;
      const razorpayPaymentId = payment.id;

      try {
        // Find order
        const { data: order } = await supabase
          .from('orders')
          .select('id, payment_status')
          .eq('razorpay_order_id', razorpayOrderId)
          .maybeSingle();

        if (order && order.payment_status !== 'paid') {
          const now = new Date().toISOString();
          await supabase
            .from('orders')
            .update({
              payment_status: 'paid',
              order_status: 'confirmed',
              status: 'confirmed',
              razorpay_payment_id: razorpayPaymentId,
              updated_at: now,
            })
            .eq('id', order.id);

          await supabase
            .from('payments')
            .update({
              provider_payment_id: razorpayPaymentId,
              status: 'paid',
              signature_verified: true,
              paid_at: now,
              updated_at: now,
            })
            .eq('order_id', order.id);

          await supabase
            .from('artisan_orders')
            .update({ status: 'pending', updated_at: now })
            .eq('order_id', order.id);

          broadcastSync('PAYMENTS_UPDATED', { orderId: order.id, status: 'paid' });
          broadcastSync('ORDERS_UPDATED', { orderId: order.id, order_status: 'confirmed' });
          console.log(`[webhook] ✅ Processed payment.captured for order ${order.id}`);
        }
      } catch (err) {
        console.error('[webhook] Error updating payment.captured:', err.message);
      }
    }
  }

  // Handle payment.failed
  if (eventType === 'payment.failed') {
    const payment = event.payload?.payment?.entity;
    if (payment) {
      const razorpayOrderId = payment.order_id;
      try {
        const { data: order } = await supabase
          .from('orders')
          .select('id')
          .eq('razorpay_order_id', razorpayOrderId)
          .maybeSingle();

        if (order) {
          await supabase
            .from('orders')
            .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', order.id);

          await supabase
            .from('payments')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('order_id', order.id);

          broadcastSync('PAYMENTS_UPDATED', { orderId: order.id, status: 'failed' });
          console.log(`[webhook] Processed payment.failed for order ${order.id}`);
        }
      } catch (err) {
        console.error('[webhook] Error handling payment.failed:', err.message);
      }
    }
  }

  // Handle refund events
  if (eventType === 'refund.created' || eventType === 'refund.processed') {
    const refund = event.payload?.refund?.entity;
    if (refund) {
      try {
        const paymentId = refund.payment_id;
        const { data: payRecord } = await supabase
          .from('payments')
          .select('order_id')
          .eq('provider_payment_id', paymentId)
          .maybeSingle();

        if (payRecord) {
          await supabase
            .from('payments')
            .update({
              refund_id: refund.id,
              refund_amount: refund.amount / 100,
              status: 'refunded',
              refunded_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('order_id', payRecord.order_id);

          await supabase
            .from('orders')
            .update({ payment_status: 'refunded', updated_at: new Date().toISOString() })
            .eq('id', payRecord.order_id);

          await reverseRewardIfNeeded(payRecord.order_id);
          broadcastSync('PAYMENTS_UPDATED', { orderId: payRecord.order_id, status: 'refunded' });
        }
      } catch (err) {
        console.error('[webhook] Refund event error:', err.message);
      }
    }
  }

  res.status(200).json({ received: true });
});

// ─── 4. REFUND (Admin / Authorized Cancellation) ──────────────────────────────
/**
 * POST /api/payments/refund
 * Initiates Razorpay refund for online payments. Protected endpoint.
 */
router.post('/refund', protect, artisanOrAdmin, async (req, res) => {
  try {
    const { orderId, amount, reason } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required for refund' });
    }

    // 1. Fetch order and payment
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    if (!payment || payment.status !== 'paid') {
      return res.status(400).json({ error: 'No paid transaction exists to refund' });
    }

    const providerPaymentId = payment.provider_payment_id || order.razorpay_payment_id;
    if (!providerPaymentId) {
      return res.status(400).json({ error: 'No Razorpay payment ID on record for this order' });
    }

    // 2. Call Razorpay refund API
    const refundAmount = amount ? Number(amount) : order.total_amount;
    const rzpRefund = await createRefund(providerPaymentId, refundAmount, {
      reason: reason || 'Customer cancellation',
      order_id: orderId,
    });

    if (!rzpRefund.success) {
      console.error('[refund] Razorpay refund error:', rzpRefund.error);
      return res.status(500).json({ error: `Refund failed: ${rzpRefund.error}` });
    }

    const refundObj = rzpRefund.refund;
    const now = new Date().toISOString();

    // 3. Update database
    await supabase
      .from('payments')
      .update({
        refund_id: refundObj.id,
        refund_amount: refundAmount,
        status: refundAmount < order.total_amount ? 'partially_refunded' : 'refunded',
        refunded_at: now,
        updated_at: now,
      })
      .eq('order_id', orderId);

    await supabase
      .from('orders')
      .update({
        payment_status: 'refunded',
        order_status: 'cancelled',
        updated_at: now,
      })
      .eq('id', orderId);

    // 4. Reverse loyalty reward if granted
    await reverseRewardIfNeeded(orderId);

    broadcastSync('PAYMENTS_UPDATED', { orderId, status: 'refunded', refund_id: refundObj.id });
    broadcastSync('ORDERS_UPDATED', { orderId, order_status: 'cancelled', payment_status: 'refunded' });

    res.json({
      success: true,
      message: 'Refund initiated successfully',
      refund: {
        id: refundObj.id,
        amount: refundAmount,
        status: refundObj.status,
      },
    });
  } catch (err) {
    console.error('[refund] Exception:', err.message);
    res.status(500).json({ error: 'Refund processing failed: ' + err.message });
  }
});

// ─── 5. GET PAYMENT DETAILS ───────────────────────────────────────────────────
/**
 * GET /api/payments/:orderId
 * Returns payment state for a given order (restricted to buyer, artisan, or admin).
 */
router.get('/:orderId', protect, async (req, res) => {
  try {
    const { orderId } = req.params;

    const { data: order } = await supabase
      .from('orders')
      .select('id, user_id, order_number, total_amount, payment_method, payment_status, razorpay_order_id, razorpay_payment_id')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Authorization check
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      // Check if user is artisan on this order
      const { data: artOrder } = await supabase
        .from('artisan_orders')
        .select('id')
        .eq('order_id', orderId)
        .eq('artisan_id', req.user.id)
        .maybeSingle();

      if (!artOrder) {
        return res.status(403).json({ error: 'Unauthorized to view this payment' });
      }
    }

    const { data: payment } = await supabase
      .from('payments')
      .select('id, provider, payment_method, provider_order_id, provider_payment_id, amount, currency, status, signature_verified, refund_amount, paid_at')
      .eq('order_id', orderId)
      .maybeSingle();

    res.json({
      order: {
        id: order.id,
        order_number: order.order_number,
        total_amount: order.total_amount,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
      },
      payment: payment || null,
    });
  } catch (err) {
    console.error('[get-payment] Error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve payment details' });
  }
});

// ─── 5B. INITIALIZE / RE-INITIALIZE RAZORPAY ORDER ─────────────────────────────
/**
 * POST /api/payments/initialize-order
 * Customer endpoint to ensure Razorpay order session is generated on-demand
 * for an existing order if missing or retrying payment.
 */
router.post('/initialize-order', protect, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (error || !order) return res.status(404).json({ error: 'Order not found' });

    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to access this order' });
    }

    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Order is already paid' });
    }

    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_live_TamouXgJy9WoAl';
    const totalAmount = Number(order.total_amount || order.total_price || 0);
    const amountInPaise = Math.round(totalAmount * 100);

    // If order already has a valid razorpay_order_id, return it directly
    if (order.razorpay_order_id) {
      return res.json({
        order_id: order.razorpay_order_id,
        amount: amountInPaise,
        currency: 'INR',
        key_id: keyId,
      });
    }

    // Otherwise, generate a Razorpay order right now
    const rzpResult = await createRazorpayOrder(
      amountInPaise,
      order.order_number || `rcpt_${Date.now()}`,
      { order_id: order.id, user_id: order.user_id },
      true
    );

    if (!rzpResult.success) {
      console.error('[initialize-order] Razorpay error:', rzpResult.error);
      return res.status(500).json({ error: rzpResult.error || 'Failed to create Razorpay payment session' });
    }

    const rzpOrder = rzpResult.order;
    await supabase.from('orders').update({ razorpay_order_id: rzpOrder.id }).eq('id', order.id);
    await supabase.from('payments').update({ provider_order_id: rzpOrder.id }).eq('order_id', order.id);

    return res.json({
      order_id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      key_id: rzpResult.key_id || keyId,
    });
  } catch (err) {
    console.error('[initialize-order] Exception:', err);
    res.status(500).json({ error: err.message || 'Failed to initialize payment session' });
  }
});

// ─── 6. DIRECT / STANDALONE RAZORPAY ENDPOINTS ─────────────────────────────
/**
 * Direct Razorpay order creation
 * Request: { amount (paise), currency, receipt, notes }
 * Return: { order_id, amount, currency, key_id }
 * Validates: amount >= 100 paise
 */
const createOrderDirect = async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'amount is required (in paise)' });
    }

    const amountInPaise = Math.round(Number(amount));
    if (isNaN(amountInPaise) || amountInPaise < 100) {
      return res.status(400).json({ error: 'Amount must be at least 100 paise (₹1)' });
    }

    const rzpResult = await createRazorpayOrder(
      amountInPaise,
      receipt || `rcpt_${Date.now()}`,
      notes || {},
      true // isPaise = true
    );

    if (!rzpResult.success) {
      console.error('[create-order-direct] Razorpay error:', rzpResult.error);
      return res.status(500).json({ error: rzpResult.error || 'Failed to create Razorpay order' });
    }

    const order = rzpResult.order;
    res.status(200).json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: rzpResult.key_id || process.env.RAZORPAY_KEY_ID || 'rzp_live_TamouXgJy9WoAl',
    });
  } catch (err) {
    console.error('[create-order-direct] Exception:', err.message);
    res.status(500).json({ error: 'Internal server error while creating Razorpay order' });
  }
};

/**
 * Direct Razorpay signature verification
 * Request: { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId }
 * Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
 * Returns success only if signatures match
 */
const verifyPaymentDirect = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      order_id,
      payment_id,
      signature,
      orderId,
    } = req.body;

    const finalOrderId = razorpay_order_id || order_id;
    const finalPaymentId = razorpay_payment_id || payment_id;
    const finalSignature = razorpay_signature || signature;

    if (!finalOrderId || !finalPaymentId || !finalSignature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: razorpay_order_id, razorpay_payment_id, and razorpay_signature are required',
      });
    }

    const isValid = verifyRazorpaySignature(finalOrderId, finalPaymentId, finalSignature);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Signature verification failed',
      });
    }

    // If orderId is provided, update internal records
    const targetOrderId = orderId || req.body.order_id_internal;
    if (targetOrderId) {
      try {
        const now = new Date().toISOString();
        await supabase
          .from('orders')
          .update({
            payment_status: 'paid',
            order_status: 'confirmed',
            status: 'confirmed',
            razorpay_order_id: finalOrderId,
            razorpay_payment_id: finalPaymentId,
            razorpay_signature: finalSignature,
            updated_at: now,
          })
          .eq('id', targetOrderId);

        await supabase
          .from('payments')
          .update({
            provider_order_id: finalOrderId,
            provider_payment_id: finalPaymentId,
            status: 'paid',
            signature_verified: true,
            paid_at: now,
            updated_at: now,
          })
          .eq('order_id', targetOrderId);

        await supabase
          .from('artisan_orders')
          .update({ status: 'pending', updated_at: now })
          .eq('order_id', targetOrderId);

        broadcastSync('PAYMENTS_UPDATED', { orderId: targetOrderId, status: 'paid' });
        broadcastSync('ORDERS_UPDATED', { orderId: targetOrderId, order_status: 'confirmed' });
      } catch (dbErr) {
        console.warn('[verify-payment-direct] DB sync error:', dbErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      order_id: finalOrderId,
      payment_id: finalPaymentId,
    });
  } catch (err) {
    console.error('[verify-payment-direct] Exception:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error during verification' });
  }
};

router.post('/verify-payment', verifyPaymentDirect);

module.exports = router;
module.exports.createOrderDirect = createOrderDirect;
module.exports.verifyPaymentDirect = verifyPaymentDirect;

