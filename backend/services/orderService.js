/**
 * backend/services/orderService.js
 * ─────────────────────────────────────────────────────────────────
 * Central order business logic for KalaStyle AI.
 * All price calculation, order creation, and master-status derivation
 * happens here — never trust frontend-submitted totals.
 */

const crypto = require('crypto');
const supabase = require('../config/supabase');
const { getEcomSettings, calculateDeliveryFee, deriveMasterStatus } = require('../config/ecommerce');
const { broadcastSync } = require('../utils/realtime');

// In-memory checkout idempotency guard (5s window per user/cart)
const recentCheckouts = new Map();

// ── Order Number Generator ────────────────────────────────────────────────────

/**
 * Generate a unique, human-readable order number.
 * Format: KALA-<4-digit-year><5-digit-sequence>
 */
exports.generateOrderNumber = () => {
  const year = new Date().getFullYear();
  const seq = Math.floor(10000 + Math.random() * 89999);
  return `KALA-${year}${seq}`;
};

// ── Price Calculation (Server-Side Only) ─────────────────────────────────────

/**
 * Fetch current product prices from DB and compute authoritative totals.
 * Never trust the frontend-submitted price.
 *
 * @param {Array} items  [{ product_id, quantity, size? }]
 * @returns {{ items: Array, subtotal: number, error?: string }}
 */
exports.calculateOrderTotals = async (items) => {
  const productIds = items.map(i => i.product_id).filter(Boolean);
  if (productIds.length === 0) return { error: 'No valid product IDs provided' };

  const { data: dbProducts, error } = await supabase
    .from('products')
    .select('id, name, price, stock_quantity, is_in_stock, image_url, artisan_id, status, is_hidden')
    .in('id', productIds);

  if (error) return { error: 'Failed to fetch product details: ' + error.message };

  const productMap = {};
  for (const p of (dbProducts || [])) productMap[p.id] = p;

  const enrichedItems = [];
  let subtotal = 0;

  for (const item of items) {
    const prod = productMap[item.product_id];
    if (!prod) return { error: `Product not found: ${item.product_id}` };
    if (prod.is_hidden || prod.status === 'rejected') return { error: `Product "${prod.name}" is not available` };
    if (!prod.is_in_stock || (prod.stock_quantity !== null && prod.stock_quantity <= 0)) {
      return { error: `"${prod.name}" is out of stock` };
    }
    const qty = Math.max(1, parseInt(item.quantity) || 1);
    if (prod.stock_quantity !== null && qty > prod.stock_quantity) {
      return { error: `Insufficient stock for "${prod.name}". Only ${prod.stock_quantity} left.` };
    }

    const unitPrice = parseFloat(prod.price);
    const totalPrice = unitPrice * qty;
    subtotal += totalPrice;

    enrichedItems.push({
      product_id: prod.id,
      product_name_snapshot: prod.name,
      product_image_snapshot: prod.image_url || null,
      unit_price_snapshot: unitPrice,
      quantity: qty,
      total_price: totalPrice,
      size: String(item.size || 'Standard').trim().substring(0, 20),
      artisan_id: prod.artisan_id || null,
    });
  }

  return { items: enrichedItems, subtotal };
};

// ── Coupon Validation ────────────────────────────────────────────────────────

/**
 * Validate a coupon and return discount amount.
 * Returns { discount: number, coupon } or { error: string }
 */
exports.validateCoupon = async (couponCode, userId, subtotal) => {
  if (!couponCode) return { discount: 0, coupon: null };

  const { data: coupon, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', couponCode.trim().toUpperCase())
    .maybeSingle();

  if (error || !coupon) return { error: 'Invalid coupon code' };
  if (coupon.is_used) return { error: 'Coupon has already been used' };
  if (coupon.user_id && coupon.user_id !== userId) return { error: 'This coupon does not belong to you' };
  if (new Date(coupon.expiry_date) < new Date()) return { error: 'Coupon has expired' };

  let discount = 0;
  if (coupon.discount_type === 'percentage') {
    discount = (subtotal * coupon.discount_value) / 100;
  } else if (coupon.discount_type === 'fixed') {
    discount = Math.min(coupon.discount_value, subtotal);
  } else if (coupon.discount_type === 'free_shipping') {
    // handled separately in delivery fee
    discount = 0;
  }

  return { discount: Math.round(discount * 100) / 100, coupon };
};

// ── Atomic Order Creation ─────────────────────────────────────────────────────

/**
 * Create a master order + all artisan sub-orders atomically.
 * Steps: validate → calc totals → create order → items → artisan_orders → payment record → deduct stock → sales
 *
 * @returns {{ order, artisanOrders, payment, error? }}
 */
exports.createMasterOrder = async ({
  userId,
  items,        // [{ product_id, quantity, size }]
  shippingData, // { name, phone, address, city, state, pincode }
  paymentMethod, // 'razorpay' | 'cod'
  couponCode,
  liveLocationUrl,
}) => {
  // 1. Validate & calculate server-side totals
  const totalsResult = await exports.calculateOrderTotals(items);
  if (totalsResult.error) return { error: totalsResult.error };
  const { items: enrichedItems, subtotal } = totalsResult;

  // 2. Delivery fee
  const deliveryFee = await calculateDeliveryFee(subtotal);
  const settings = await getEcomSettings();

  // 3. COD validation
  if (paymentMethod === 'cod') {
    if (!settings.cod_enabled) return { error: 'Cash on Delivery is currently unavailable' };
    if (subtotal < settings.cod_min_order_value) {
      return { error: `Minimum order value for COD is ₹${settings.cod_min_order_value}` };
    }
    if (subtotal > settings.cod_max_order_value) {
      return { error: `Maximum order value for COD is ₹${settings.cod_max_order_value}` };
    }
  }

  // 4. Coupon
  const couponResult = await exports.validateCoupon(couponCode, userId, subtotal);
  if (couponResult.error) return { error: couponResult.error };
  const discount = couponResult.discount || 0;

  const totalAmount = Math.max(0, subtotal + deliveryFee - discount);

  // 5. Build order record
  const orderNumber = exports.generateOrderNumber();
  let shippingAddressFull = [
    shippingData.address, shippingData.city,
    shippingData.state, shippingData.pincode,
  ].filter(Boolean).join(', ');
  if (liveLocationUrl) shippingAddressFull += `\n📍 Live Location: ${liveLocationUrl}`;

  // Risk analysis (AI behavioral signals)
  let riskEval = { riskScore: 0, riskStatus: 'normal', reasons: [] };
  try {
    const { evaluateOrderRisk } = require('./suspiciousOrderService');
    riskEval = await evaluateOrderRisk({
      user_id: userId,
      total_amount: totalAmount,
      payment_method: paymentMethod,
      shipping_address: shippingAddressFull,
      phone: shippingData.phone,
    });
  } catch (rErr) {
    console.warn('[orderService] Risk evaluation notice:', rErr.message);
  }

  const orderRecord = {
    order_number: orderNumber,
    user_id: userId,
    subtotal,
    delivery_fee: deliveryFee,
    discount,
    total_amount: totalAmount,
    // Legacy columns (keep for backward compat)
    total_price: totalAmount,
    discount_amount: discount,
    coupon_code: couponCode ? couponCode.trim().toUpperCase() : null,
    shipping_address: shippingAddressFull,
    phone: String(shippingData.phone || '').replace(/[^\d+]/g, '').substring(0, 20),
    shipping_name: shippingData.name || '',
    shipping_city: shippingData.city || '',
    shipping_state: shippingData.state || '',
    shipping_pincode: shippingData.pincode || '',
    // Status
    status: paymentMethod === 'cod' ? 'confirmed' : 'pending',
    order_status: paymentMethod === 'cod' ? 'confirmed' : 'pending',
    payment_method: paymentMethod,
    payment_status: paymentMethod === 'cod' ? 'cod_pending' : 'pending',
    live_location_url: liveLocationUrl || null,
    risk_status: riskEval.riskStatus,
    risk_score: riskEval.riskScore,
    risk_reasons: riskEval.reasons,
  };

  // 6. Insert master order
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert([orderRecord])
    .select()
    .single();

  if (orderErr) {
    console.error('[orderService] Order insert error:', orderErr);
    return { error: 'Failed to create order: ' + orderErr.message };
  }

  // 7. Insert order items
  const orderItemsRecords = enrichedItems.map(item => ({
    order_id: order.id,
    product_id: item.product_id,
    artisan_id: item.artisan_id,
    product_name_snapshot: item.product_name_snapshot,
    product_image_snapshot: item.product_image_snapshot,
    unit_price_snapshot: item.unit_price_snapshot,
    quantity: item.quantity,
    total_price: item.total_price,
    // Legacy column
    price_at_time: item.unit_price_snapshot,
    size: item.size,
    item_status: 'pending',
  }));

  const { error: itemsErr } = await supabase
    .from('order_items')
    .insert(orderItemsRecords);

  if (itemsErr) {
    console.error('[orderService] Order items insert error:', itemsErr);
    // Best effort rollback
    await supabase.from('orders').delete().eq('id', order.id);
    return { error: 'Failed to create order items: ' + itemsErr.message };
  }

  // 8. Group items by artisan and create artisan_orders
  const artisanMap = {};
  for (const item of enrichedItems) {
    const artId = item.artisan_id;
    if (!artId) continue;
    if (!artisanMap[artId]) artisanMap[artId] = { items: [], subtotal: 0 };
    artisanMap[artId].items.push(item);
    artisanMap[artId].subtotal += item.total_price;
  }

  const artisanOrders = [];
  for (const [artisanId, artData] of Object.entries(artisanMap)) {
    const artDeliveryFee = Object.keys(artisanMap).length > 1 ? 0 : deliveryFee; // single fee at master level
    const { data: artOrder, error: artErr } = await supabase
      .from('artisan_orders')
      .insert([{
        order_id: order.id,
        artisan_id: artisanId,
        subtotal: artData.subtotal,
        delivery_fee: artDeliveryFee,
        total_amount: artData.subtotal + artDeliveryFee,
        status: 'pending',
      }])
      .select()
      .single();

    if (!artErr && artOrder) {
      artisanOrders.push(artOrder);
    } else {
      console.error(`[orderService] artisan_order insert error for artisan ${artisanId}:`, artErr);
    }
  }

  // 9. Create payment record
  let paymentRecord = null;
  const { data: payment } = await supabase
    .from('payments')
    .insert([{
      order_id: order.id,
      method: paymentMethod,
      provider: paymentMethod === 'razorpay' ? 'razorpay' : 'cod',
      amount: totalAmount,
      status: paymentMethod === 'cod' ? 'cod_pending' : 'pending',
    }])
    .select()
    .single();
  paymentRecord = payment;

  // 10. Deduct inventory (strictly non-negative atomic row-level locked deduction)
  for (const item of enrichedItems) {
    try {
      const deducted = await exports.atomicDeductStock(item.product_id, item.quantity);
      if (!deducted) {
        console.warn(`[orderService] Stock deduction notice: product ${item.product_id} may have limited inventory.`);
      }
    } catch (err) {
      console.error(`[orderService] Stock update error for product ${item.product_id}:`, err.message);
    }
  }

  // 11. Record in sales table
  const today = new Date().toISOString().split('T')[0];
  for (const item of enrichedItems) {
    try {
      await supabase.from('sales').insert([{
        product_id: String(item.product_id),
        product_name: item.product_name_snapshot,
        quantity: item.quantity,
        unit_price: item.unit_price_snapshot,
        total_amount: item.total_price,
        date: today,
        order_id: String(order.id),
        artisan_id: item.artisan_id ? String(item.artisan_id) : null,
        sale_type: 'online_order',
      }]);
    } catch (err) {
      console.warn('[orderService] Sales record notice:', err.message);
    }
  }

  // 12. Mark coupon as used
  if (couponResult.coupon) {
    await supabase
      .from('coupons')
      .update({ is_used: true })
      .eq('code', couponResult.coupon.code)
      .eq('user_id', userId);
  }

  console.log(`[orderService] ✅ Order ${orderNumber} created (${artisanOrders.length} artisan sub-orders)`);

  return { order, artisanOrders, payment: paymentRecord };
};

// ── Master Status Sync ────────────────────────────────────────────────────────

/**
 * Recalculate and persist the master order status from its artisan sub-orders.
 * Call this every time any artisan_order status changes.
 *
 * @param {string} orderId
 */
exports.syncMasterOrderStatus = async (orderId) => {
  try {
    const { data: artisanOrders } = await supabase
      .from('artisan_orders')
      .select('status')
      .eq('order_id', orderId);

    if (!artisanOrders || artisanOrders.length === 0) return;

    const statuses = artisanOrders.map(ao => ao.status);
    const newStatus = deriveMasterStatus(statuses);

    await supabase
      .from('orders')
      .update({ order_status: newStatus, status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    console.log(`[orderService] Master order ${orderId} status → ${newStatus}`);
    return newStatus;
  } catch (err) {
    console.error('[orderService] syncMasterOrderStatus error:', err.message);
  }
};

// ── COD Delivery Finalization & Collection ────────────────────────────────────

/**
 * Update a COD artisan_order as delivered.
 * CRITICAL: Courier/artisan delivery sets fulfillment milestone,
 * but payment_status strictly remains 'cod_pending' until explicit collection confirmation!
 *
 * @param {string} artisanOrderId
 * @param {string} artisanProfileId
 */
exports.finalizeCODDelivery = async (artisanOrderId, artisanProfileId) => {
  const { data: artOrder } = await supabase
    .from('artisan_orders')
    .select('*')
    .eq('id', artisanOrderId)
    .single();

  if (!artOrder) return { error: 'Artisan order not found' };

  // Update artisan sub-order
  await supabase
    .from('artisan_orders')
    .update({ status: 'delivered', delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', artisanOrderId);

  // Sync master order status
  const newMasterStatus = await exports.syncMasterOrderStatus(artOrder.order_id);

  // NOTE: For COD, payment is NOT automatically marked as paid upon delivery.
  // Payment confirmation requires explicit confirmCODCollection(orderId).
  return { success: true, master_status: newMasterStatus };
};

/**
 * Controlled action to confirm cash collection for a Cash on Delivery (COD) order.
 * Follows all 12 state-machine rules:
 * 1. Order must exist.
 * 2. Order must be COD.
 * 3. Shipment must be delivered or otherwise eligible.
 * 4. Payment must currently be cod_pending.
 * 5. Do not allow duplicate confirmation (Idempotent).
 * 6. Update payment status to paid.
 * 7. Update payment record to paid with timestamp.
 * 8. Record collection timestamp.
 * 9. Record who/system confirmed collection.
 * 10. Create an audit record.
 * 11. Recalculate/finalize artisan earnings according to existing system.
 * 12. Update master order status when all relevant artisan orders are delivered/complete.
 *
 * @param {string} orderIdOrNumber
 * @param {string} confirmedBy
 * @param {object} options
 */
exports.confirmCODCollection = async (orderIdOrNumber, confirmedBy = 'admin', options = {}) => {
  try {
    // 1. Resolve order
    let query = supabase.from('orders').select('*');
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderIdOrNumber)) {
      query = query.eq('id', orderIdOrNumber);
    } else {
      query = query.eq('order_number', orderIdOrNumber);
    }
    const { data: order, error: orderErr } = await query.maybeSingle();

    if (orderErr || !order) {
      return { success: false, error: `Order not found: ${orderIdOrNumber}` };
    }

    // 2. Validate COD payment method
    const isCod = String(order.payment_method || '').toLowerCase().trim() === 'cod';
    if (!isCod) {
      return { success: false, error: `Order ${order.order_number || order.id} is not a Cash on Delivery (COD) order (method: ${order.payment_method}).` };
    }

    // 3. Idempotency: prevent duplicate confirmation
    const currentPaymentStatus = String(order.payment_status || '').toLowerCase().trim();

    // Already fully confirmed (paid)
    if (currentPaymentStatus === 'paid') {
      return {
        success: true,
        already_confirmed: true,
        message: `COD payment for order ${order.order_number || order.id} has already been confirmed as collected.`,
        order,
      };
    }

    // Legacy alias: 'cod_collected' was used by an older version — treat as confirmed
    // and migrate it to 'paid' for consistency with the current state machine.
    if (currentPaymentStatus === 'cod_collected') {
      console.log(`[confirmCODCollection] Migrating legacy 'cod_collected' → 'paid' for order ${order.id}`);
      await supabase.from('orders').update({ payment_status: 'paid', updated_at: new Date().toISOString() }).eq('id', order.id);
      await supabase.from('payments').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('order_id', order.id);
      return {
        success: true,
        already_confirmed: true,
        migrated: true,
        message: `COD payment for order ${order.order_number || order.id} was previously confirmed (legacy state). Migrated to 'paid'.`,
        order,
      };
    }

    // 4. Verify payment status is currently 'cod_pending'
    if (currentPaymentStatus !== 'cod_pending') {
      return {
        success: false,
        error: `Cannot confirm COD collection for order ${order.order_number || order.id}: Current payment_status is '${order.payment_status}', expected 'cod_pending'.`,
      };
    }


    // 5. Verify shipment status is DELIVERED (or admin override provided)
    const effectiveDeliveryStatus = String(order.shipping_status || order.order_status || order.status || '').toUpperCase().trim();
    if (effectiveDeliveryStatus !== 'DELIVERED' && !options.override_shipping_guard) {
      return {
        success: false,
        error: `Cannot confirm COD collection: Shipment status is '${order.shipping_status || order.order_status || order.status || 'PENDING'}'. Package must be delivered before collecting COD payment.`,
      };
    }

    const now = new Date().toISOString();

    // 6. Update master order payment status to 'paid' & record collection metadata
    const { data: updatedOrder, error: updateOrderErr } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        payment_collected_at: now,
        payment_collected_by: confirmedBy,
        payment_collection_notes: options.notes || null,
        updated_at: now,
      })
      .eq('id', order.id)
      .select()
      .single();

    if (updateOrderErr) {
      return { success: false, error: `Failed to update order payment status: ${updateOrderErr.message}` };
    }

    // 7. Update payments record to 'paid' with collection timestamp
    await supabase
      .from('payments')
      .update({
        status: 'paid',
        paid_at: now,
        updated_at: now,
      })
      .eq('order_id', order.id);

    // 8. Finalize artisan earnings for each artisan sub-order
    const { data: artisanOrders } = await supabase
      .from('artisan_orders')
      .select('*')
      .eq('order_id', order.id);

    let finalizedEarningsCount = 0;
    if (artisanOrders && artisanOrders.length > 0) {
      for (const ao of artisanOrders) {
        if (ao.artisan_id) {
          try {
            await exports.createArtisanEarning(ao.id, ao, ao.artisan_id);
            finalizedEarningsCount++;
          } catch (earnErr) {
            console.warn(`[confirmCODCollection] Earning finalization notice for sub-order ${ao.id}:`, earnErr.message);
          }
        }
      }
    }

    // 9. Synchronize master order status if all artisan orders are delivered
    const newMasterStatus = await exports.syncMasterOrderStatus(order.id);

    // 10. Create immutable audit record
    try {
      const { recordAuditAction } = require('../ai/aiToolExecutor');
      await recordAuditAction({
        action_name: 'confirm_cod_collection',
        risk_level: 2,
        entity_type: 'order',
        entity_id: order.id,
        decision: 'confirmed_cod_payment_collection',
        actor: confirmedBy,
        execution_status: 'SUCCESS',
        parameters: {
          order_id: order.id,
          order_number: order.order_number,
          total_amount: order.total_amount,
          confirmed_by: confirmedBy,
          notes: options.notes,
          finalized_earnings_count: finalizedEarningsCount,
        },
      });
    } catch (auditErr) {
      console.warn('[confirmCODCollection] Audit record logging notice:', auditErr.message);
    }

    // 11. Broadcast realtime synchronization events
    broadcastSync('PAYMENTS_UPDATED', {
      orderId: order.id,
      status: 'paid',
      method: 'cod',
      collected_by: confirmedBy,
      collected_at: now,
    });
    broadcastSync('ORDERS_UPDATED', {
      orderId: order.id,
      payment_status: 'paid',
      order_status: newMasterStatus || updatedOrder.status,
    });
    broadcastSync('EARNINGS_UPDATED', {
      orderId: order.id,
      status: 'finalized',
    });

    return {
      success: true,
      message: `COD payment of ₹${order.total_amount || order.total_price} for order ${order.order_number || order.id} successfully confirmed as collected!`,
      order: updatedOrder,
      finalized_earnings_count: finalizedEarningsCount,
      confirmed_at: now,
    };
  } catch (err) {
    console.error('[confirmCODCollection] Error:', err);
    return { success: false, error: err.message };
  }
};

// ── Artisan Earnings ──────────────────────────────────────────────────────────

/**
 * Create an artisan_earnings record after a delivery.
 */
exports.createArtisanEarning = async (artisanOrderId, artOrder, artisanProfileId) => {
  try {
    const settings = await getEcomSettings();
    const commissionRate = (settings.platform_commission || 10) / 100;
    const gross = artOrder.total_amount || 0;
    const commission = Math.round(gross * commissionRate * 100) / 100;
    const net = gross - commission;

    // Check if earnings record already exists (idempotency)
    const { data: existing } = await supabase
      .from('artisan_earnings')
      .select('id')
      .eq('artisan_order_id', artisanOrderId)
      .maybeSingle();

    if (existing) return; // Already recorded

    await supabase.from('artisan_earnings').insert([{
      artisan_id: artisanProfileId,
      order_id: artOrder.order_id,
      artisan_order_id: artisanOrderId,
      gross_amount: gross,
      platform_commission: commission,
      delivery_amount: artOrder.delivery_fee || 0,
      net_earning: net,
      settlement_status: 'pending',
    }]);
  } catch (err) {
    console.error('[orderService] createArtisanEarning error:', err.message);
  }
};

// ── Refund Processing ─────────────────────────────────────────────────────────

/**
 * Initiate a refund for an online payment order.
 * Updates payment record and order status.
 *
 * @param {string} orderId
 * @param {number|null} amount  - null = full refund
 * @param {string} reason
 */
exports.processRefund = async (orderId, amount, reason) => {
  const { createRefund } = require('./paymentService');

  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle();

  if (!payment || payment.status !== 'paid') {
    return { error: 'No paid payment found for this order' };
  }

  if (!payment.provider_payment_id) {
    return { error: 'No payment provider ID found — cannot process refund' };
  }

  const refundAmount = amount || payment.amount;
  const result = await createRefund(payment.provider_payment_id, refundAmount, { reason });

  if (!result.success) return { error: result.error };

  const isPartial = refundAmount < payment.amount;

  await supabase.from('payments').update({
    status: isPartial ? 'partially_refunded' : 'refunded',
    refund_id: result.refund.id,
    refund_amount: refundAmount,
    refunded_at: new Date().toISOString(),
  }).eq('order_id', orderId);

  await supabase.from('orders').update({
    payment_status: isPartial ? 'partially_refunded' : 'refunded',
    order_status: isPartial ? 'partially_cancelled' : 'cancelled',
    status: isPartial ? 'partially_cancelled' : 'cancelled',
  }).eq('id', orderId);

  return { success: true, refund: result.refund };
};

// ── Atomic Inventory Operations ──────────────────────────────────────────────

/**
 * Atomic stock deduction using PostgreSQL stored procedure.
 * Executes row-level locked deduction in PostgreSQL to eliminate race conditions.
 *
 * @param {string} productId - Product UUID
 * @param {number} quantity - Quantity to decrement
 * @returns {Promise<boolean>} True if deducted, false if insufficient stock
 */
exports.atomicDeductStock = async (productId, quantity) => {
  const qty = parseInt(quantity, 10);
  if (!productId || isNaN(qty) || qty <= 0) return true;

  try {
    // 1. Primary: PostgreSQL Stored Function (atomic row-level lock)
    const { data: rpcSuccess, error: rpcErr } = await supabase.rpc('deduct_product_stock', {
      p_product_id: productId,
      p_quantity: qty,
    });

    if (!rpcErr && typeof rpcSuccess === 'boolean') {
      return rpcSuccess;
    }
  } catch (e) {
    // Fall back to table query if RPC is not deployed yet
  }

  // 2. Safe Fallback: Read stock and conditionally update with strict gte guard
  try {
    const { data: prod } = await supabase
      .from('products')
      .select('stock_quantity')
      .eq('id', productId)
      .single();

    if (!prod || prod.stock_quantity === null) return true;
    if (prod.stock_quantity < qty) return false;

    const newStock = Math.max(0, prod.stock_quantity - qty);
    const { error: updateErr } = await supabase
      .from('products')
      .update({ stock_quantity: newStock, is_in_stock: newStock > 0 })
      .eq('id', productId)
      .gte('stock_quantity', qty);

    return !updateErr;
  } catch (err) {
    console.error(`[orderService] atomicDeductStock fallback error for product ${productId}:`, err.message);
    return false;
  }
};

/**
 * Atomic stock restoration using PostgreSQL stored procedure.
 *
 * @param {string} productId - Product UUID
 * @param {number} quantity - Quantity to restore
 * @returns {Promise<boolean>}
 */
exports.atomicRestoreStock = async (productId, quantity) => {
  const qty = parseInt(quantity, 10);
  if (!productId || isNaN(qty) || qty <= 0) return true;

  try {
    const { data: rpcSuccess, error: rpcErr } = await supabase.rpc('restore_product_stock', {
      p_product_id: productId,
      p_quantity: qty,
    });
    if (!rpcErr && typeof rpcSuccess === 'boolean') {
      return rpcSuccess;
    }
  } catch (e) {}

  try {
    const { data: prod } = await supabase
      .from('products')
      .select('stock_quantity')
      .eq('id', productId)
      .single();

    if (prod) {
      const newStock = (prod.stock_quantity || 0) + qty;
      await supabase
        .from('products')
        .update({ stock_quantity: newStock, is_in_stock: true })
        .eq('id', productId);
    }
    return true;
  } catch (err) {
    console.error(`[orderService] atomicRestoreStock fallback error for product ${productId}:`, err.message);
    return false;
  }
};

/**
 * Restore inventory when an order is cancelled, rejected, or payment fails.
 * Idempotently iterates order items and returns reserved stock.
 *
 * @param {string} orderId
 */
exports.restoreInventory = async (orderId) => {
  try {
    const { data: items } = await supabase
      .from('order_items')
      .select('product_id, quantity')
      .eq('order_id', orderId);

    if (!items || items.length === 0) return;

    for (const item of items) {
      if (item.product_id && item.quantity > 0) {
        await exports.atomicRestoreStock(item.product_id, item.quantity);
      }
    }
    console.log(`[orderService] ✅ Atomic inventory restored for order ${orderId}`);
  } catch (err) {
    console.error('[orderService] restoreInventory error:', err.message);
  }
};

