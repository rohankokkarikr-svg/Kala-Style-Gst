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
const { createMasterOrder, restoreInventory } = require('../services/orderService');
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
/**
 * Create Order Handler
 * Calculates all cart prices server-side, validates inventory & customer data,
 * initializes Razorpay order with server-calculated price, and records internal order.
 */
const createOrderHandler = async (req, res) => {
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
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required to create an order' });
    }

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
      // Compensate: restore reserved stock and clean up pending unconfirmed order
      try {
        await restoreInventory(order.id);
        await supabase.from('order_items').delete().eq('order_id', order.id);
        await supabase.from('artisan_orders').delete().eq('order_id', order.id);
        await supabase.from('payments').delete().eq('order_id', order.id);
        await supabase.from('orders').delete().eq('id', order.id);
      } catch (rollbackErr) {
        console.error('[create-order] Rollback error after Razorpay failure:', rollbackErr.message);
      }
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
};

/**
 * Verify Payment Handler
 * Confirms authenticated buyer, internal order, payment-to-order mapping,
 * exact amount & currency, HMAC-SHA256 signature, and idempotency.
 */
const verifyPaymentHandler = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
      order_id,
      payment_id,
      signature
    } = req.body;

    const finalOrderId = razorpay_order_id || order_id;
    const finalPaymentId = razorpay_payment_id || payment_id;
    const finalSignature = razorpay_signature || signature;
    const targetInternalOrderId = orderId || req.body.order_id_internal;

    if (!finalOrderId || !finalPaymentId || !finalSignature) {
      return res.status(400).json({
        error: 'Missing payment verification parameters: razorpay_order_id, razorpay_payment_id, and razorpay_signature are required'
      });
    }

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required to verify payment' });
    }

    // 1. Verify HMAC-SHA256 signature using timing-safe comparison
    const isValid = verifyRazorpaySignature(
      finalOrderId,
      finalPaymentId,
      finalSignature
    );

    if (!isValid) {
      console.warn(`[verify] Invalid payment signature for order: ${targetInternalOrderId || finalOrderId}`);
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }

    // 2. Fetch order to verify ownership and internal record
    let query = supabase.from('orders').select('*');
    if (targetInternalOrderId) {
      query = query.eq('id', targetInternalOrderId);
    } else {
      query = query.eq('razorpay_order_id', finalOrderId);
    }

    const { data: order, error: orderErr } = await query.maybeSingle();

    if (orderErr || !order) {
      return res.status(404).json({ error: 'Target order not found' });
    }

    // Security check: Confirm authenticated buyer (must be buyer or admin)
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: You are not authorized to verify payment for this order' });
    }

    // Security check: Confirm payment-to-order mapping
    if (order.razorpay_order_id && order.razorpay_order_id !== finalOrderId) {
      return res.status(400).json({ error: 'Payment signature does not correspond to target order' });
    }

    // Security check: Confirm exact amount and currency against internal order
    const expectedPaise = Math.max(100, Math.round(Number(order.total_amount) * 100));
    try {
      const paymentInfo = await getPaymentDetails(finalPaymentId);
      if (paymentInfo && paymentInfo.success && paymentInfo.payment) {
        const p = paymentInfo.payment;
        if (p.order_id && p.order_id !== finalOrderId) {
          return res.status(400).json({ error: 'Payment does not correspond to specified Razorpay order' });
        }
        if (p.amount !== undefined && Number(p.amount) !== expectedPaise) {
          return res.status(400).json({ error: `Payment amount mismatch: expected ${expectedPaise} paise, received ${p.amount} paise` });
        }
        if (p.currency && p.currency.toUpperCase() !== 'INR') {
          return res.status(400).json({ error: `Payment currency mismatch: expected INR, received ${p.currency}` });
        }
      }
    } catch (rzpErr) {
      console.warn('[verify] Payment details lookup warning:', rzpErr.message);
    }

    // Idempotency check: if already verified and marked paid, return success immediately
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
        razorpay_order_id: finalOrderId,
        razorpay_payment_id: finalPaymentId,
        razorpay_signature: finalSignature,
        updated_at: now,
      })
      .eq('id', order.id);

    // 4. Update payments table
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
      razorpay_payment_id: finalPaymentId,
    });
    broadcastSync('ORDERS_UPDATED', {
      orderId: order.id,
      order_status: 'confirmed',
      payment_status: 'paid',
    });

    console.log(`[verify] ✅ Payment successfully verified for order ${order.id}`);

    try {
      const { emitEvent } = require('../ai/aiEventBus');
      emitEvent('PAYMENT_UPDATED', 'payment', order.id, {
        status: 'paid',
        payment_id: finalPaymentId,
        order_number: order.order_number,
      });
    } catch (e) { }

    // Auto-create Shiprocket logistics shipment (non-blocking)
    try {
      const shippingService = require('../services/shipping/shippingService');
      shippingService
        .createShipmentFromOrder(order.id)
        .then((sRes) => console.log(`[verify] ✅ Auto Shiprocket shipment created for order ${order.id}:`, sRes.shipment?.id))
        .catch((sErr) => console.warn(`[verify] Auto Shiprocket shipment notice:`, sErr.message));
    } catch (shpErr) { }

    // Send Payment Success WhatsApp Notification to Admin
    try {
      const { sendOrderWhatsappNotification } = require('../utils/whatsapp');
      const { data: fullOrder } = await supabase
        .from('orders')
        .select('*, items:order_items(quantity, price_at_time, size, product:products(id, name, image_url, category))')
        .eq('id', order.id)
        .single();
      const targetAdminPhone = process.env.ADMIN_WHATSAPP_NUMBER || process.env.ADMIN_PHONE || '917676558335';
      await sendOrderWhatsappNotification(
        targetAdminPhone,
        { ...(fullOrder || order), payment_status: 'paid' },
        req.user?.name || 'Customer'
      );
    } catch (wsErr) {
      console.warn('[verify] WhatsApp payment notification notice:', wsErr.message);
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      orderId: order.id,
      order_id: finalOrderId,
      payment_id: finalPaymentId,
    });
  } catch (err) {
    console.error('[verify] Verification exception:', err.message);
    res.status(500).json({ error: 'Payment verification error: ' + err.message });
  }
};

router.post('/create-order', protect, createOrderHandler);
router.post('/verify', protect, verifyPaymentHandler);
router.post('/verify-payment', protect, verifyPaymentHandler);

// ─── 3. WEBHOOK (Idempotent Server-to-Server Event Processing) ────────────────
/**
 * POST /api/payments/webhook
 * Public endpoint called by Razorpay servers.
 * Verifies signature using rawBody buffer. Idempotently processes payment events.
 */
router.post('/webhook', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // 1. Verify webhook signature (Fail closed if secret is configured)
  if (webhookSecret) {
    if (!signature) {
      console.warn('[webhook] Missing x-razorpay-signature header');
      return res.status(400).json({ error: 'Missing webhook signature' });
    }
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

          try {
            const { emitEvent } = require('../ai/aiEventBus');
            emitEvent('PAYMENT_UPDATED', 'payment', order.id, {
              status: 'paid',
              payment_id: razorpayPaymentId,
            });
          } catch (e) { }

          // Auto-create Shiprocket logistics shipment (non-blocking)
          try {
            const shippingService = require('../services/shipping/shippingService');
            shippingService
              .createShipmentFromOrder(order.id)
              .then((sRes) => console.log(`[webhook] ✅ Auto Shiprocket shipment created for order ${order.id}:`, sRes.shipment?.id))
              .catch((sErr) => console.warn(`[webhook] Auto Shiprocket shipment notice:`, sErr.message));
          } catch (shpErr) { }

          // Send Real-Time WhatsApp Alert for Razorpay Payment Captured
          try {
            const { sendOrderWhatsappNotification } = require('../utils/whatsapp');
            const { data: fullOrder } = await supabase
              .from('orders')
              .select('*, items:order_items(quantity, price_at_time, size, product:products(id, name, image_url, category))')
              .eq('id', order.id)
              .single();
            const targetAdminPhone = process.env.ADMIN_WHATSAPP_NUMBER || process.env.ADMIN_PHONE || '917676558335';
            await sendOrderWhatsappNotification(
              targetAdminPhone,
              { ...(fullOrder || order), payment_status: 'paid', razorpay_payment_id: razorpayPaymentId },
              fullOrder?.shipping_name || 'Customer'
            );
            console.log(`[webhook] ✅ Real-time Razorpay Paid WhatsApp alert dispatched for order ${order.id}`);
          } catch (wsErr) {
            console.warn('[webhook] WhatsApp notification notice:', wsErr.message);
          }
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

          // Release reserved inventory safely back to catalog
          await restoreInventory(order.id);

          broadcastSync('PAYMENTS_UPDATED', { orderId: order.id, status: 'failed' });
          console.log(`[webhook] Processed payment.failed and released stock for order ${order.id}`);

          try {
            const { emitEvent } = require('../ai/aiEventBus');
            emitEvent('PAYMENT_UPDATED', 'payment', order.id, {
              status: 'failed',
              error: payment.error_description || 'Payment failed',
            });
          } catch (e) { }
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
router.post('/refund', protect, async (req, res) => {
  try {
    const { orderId, amount, reason } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required for refund' });
    }

    // Role check: Only admin or authorized assigned artisan
    if (req.user.role !== 'admin' && req.user.role !== 'artisan') {
      return res.status(403).json({ error: 'Access denied: Insufficient privileges to request refunds' });
    }

    // 1. Fetch order and payment
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) return res.status(404).json({ error: 'Order not found' });

    // If caller is an artisan, prove they are assigned to this order
    if (req.user.role === 'artisan') {
      const { data: profile } = await supabase
        .from('artisan_profiles')
        .select('id')
        .eq('user_id', req.user.id)
        .maybeSingle();

      const possibleIds = [req.user.id];
      if (profile && profile.id) possibleIds.push(profile.id);

      const { data: assignedSubOrder } = await supabase
        .from('artisan_orders')
        .select('id')
        .eq('order_id', orderId)
        .in('artisan_id', possibleIds)
        .maybeSingle();

      if (!assignedSubOrder) {
        return res.status(403).json({ error: 'Unauthorized: You are not assigned to this order' });
      }
    }

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

    // Amount validation
    const alreadyRefunded = Number(payment.refund_amount || 0);
    const orderTotal = Number(order.total_amount || 0);
    const maxRefundable = Math.max(0, orderTotal - alreadyRefunded);

    if (maxRefundable <= 0) {
      return res.status(400).json({ error: 'Order has already been fully refunded' });
    }

    const refundAmount = (amount !== undefined && amount !== null && amount !== '') ? Number(amount) : maxRefundable;
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      return res.status(400).json({ error: 'Refund amount must be a positive finite number' });
    }

    if (refundAmount > maxRefundable) {
      return res.status(400).json({
        error: `Requested refund (₹${refundAmount}) exceeds maximum refundable balance (₹${maxRefundable})`,
      });
    }

    // 2. Call Razorpay refund API
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
    const newRefundTotal = alreadyRefunded + refundAmount;
    const isFullRefund = newRefundTotal >= orderTotal;

    // 3. Update database
    await supabase
      .from('payments')
      .update({
        refund_id: refundObj.id,
        refund_amount: newRefundTotal,
        status: isFullRefund ? 'refunded' : 'partially_refunded',
        refunded_at: now,
        updated_at: now,
      })
      .eq('order_id', orderId);

    await supabase
      .from('orders')
      .update({
        payment_status: isFullRefund ? 'refunded' : 'partially_refunded',
        order_status: isFullRefund ? 'cancelled' : order.order_status,
        status: isFullRefund ? 'cancelled' : order.status,
        updated_at: now,
      })
      .eq('id', orderId);

    // 4. Reverse loyalty reward if granted
    await reverseRewardIfNeeded(orderId);

    // 5. Audit log
    try {
      await supabase.from('activity_logs').insert([{
        action: 'PAYMENT_REFUND',
        actor_id: req.user.id,
        actor_role: req.user.role,
        entity_id: orderId,
        details: JSON.stringify({
          refund_id: refundObj.id,
          amount: refundAmount,
          reason: reason || 'Customer cancellation',
          is_full: isFullRefund,
        }),
        created_at: now,
      }]);
    } catch (auditErr) {
      console.warn('[refund] Activity log notice:', auditErr.message);
    }

    broadcastSync('PAYMENTS_UPDATED', { orderId, status: isFullRefund ? 'refunded' : 'partially_refunded', refund_id: refundObj.id });
    broadcastSync('ORDERS_UPDATED', { orderId, order_status: isFullRefund ? 'cancelled' : order.order_status, payment_status: isFullRefund ? 'refunded' : 'partially_refunded' });

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
 * Returns payment state for a given order (restricted to buyer, assigned artisan, or admin).
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
      let isAssigned = false;
      if (req.user.role === 'artisan') {
        const { data: profile } = await supabase
          .from('artisan_profiles')
          .select('id')
          .eq('user_id', req.user.id)
          .maybeSingle();

        const possibleIds = [req.user.id];
        if (profile && profile.id) possibleIds.push(profile.id);

        const { data: artOrder } = await supabase
          .from('artisan_orders')
          .select('id')
          .eq('order_id', orderId)
          .in('artisan_id', possibleIds)
          .maybeSingle();

        if (artOrder) isAssigned = true;
      }

      if (!isAssigned) {
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

    const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();

    const totalAmount = Number(order.total_amount || order.total_price || 0);
    const amountInPaise = Math.max(100, Math.round(totalAmount * 100));

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

// ─── 6. SECURED DIRECT / STANDALONE RAZORPAY ENDPOINTS ─────────────────────
// Legacy aliases secured with strict authentication, server-side pricing, and verification
const createOrderDirect = createOrderHandler;
const verifyPaymentDirect = verifyPaymentHandler;

module.exports = router;
module.exports.createOrderHandler = createOrderHandler;
module.exports.verifyPaymentHandler = verifyPaymentHandler;
module.exports.createOrderDirect = createOrderDirect;
module.exports.verifyPaymentDirect = verifyPaymentDirect;

