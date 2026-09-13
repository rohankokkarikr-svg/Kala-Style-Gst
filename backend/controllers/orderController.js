/**
 * backend/controllers/orderController.js
 * ─────────────────────────────────────────────────────────────────
 * KalaStyle AI — Complete Order Management Controller
 * Supports multi-artisan orders, Razorpay, COD, tracking, cancellation, refunds.
 */

const supabase = require('../config/supabase');
const path = require('path');
const fs = require('fs');
const {
  sendOrderWhatsappNotification,
  sendOrderCancelWhatsappNotification,
  sendOrderEditWhatsappNotification,
  sendPaymentVerifiedWhatsappNotification,
  sendRefNoSubmittedWhatsappNotification,
  getEffectivePaymentMethod,
} = require('../utils/whatsapp');
const {
  createMasterOrder,
  syncMasterOrderStatus,
  processRefund,
  restoreInventory,
  finalizeCODDelivery,
  createArtisanEarning,
} = require('../services/orderService');
const { isValidArtisanTransition, getEcomSettings } = require('../config/ecommerce');
const { checkAndGrantReward, reverseRewardIfNeeded } = require('../services/rewardService');
const { broadcastSync } = require('../utils/realtime');
const { createRazorpayOrder: createRzpOrder, verifyRazorpaySignature } = require('../services/paymentService');
const { createSystemNotification } = require('./notificationController');

// ── Site Settings (local JSON for WhatsApp toggle) ───────────────────────────
const getSiteSettings = () => {
  const settingsFile = path.join(__dirname, '../data/site_settings.json');
  const defaults = { whatsappNumber: '917676558335', orderNotifications: true };
  try {
    if (fs.existsSync(settingsFile)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) };
    }
  } catch (err) {
    console.warn('Could not read site settings:', err.message);
  }
  return defaults;
};

// ── 1. CREATE ORDER ──────────────────────────────────────────────────────────

/**
 * POST /api/orders/create  (also handles legacy POST /api/orders)
 * Validates server-side, creates master order + artisan sub-orders + payment record.
 */
exports.createOrder = async (req, res) => {
  try {
    const {
      items, shipping_address, phone, discount_amount, coupon_code,
      payment_method, live_location_url,
      // New structured address fields
      shipping_name, shipping_city, shipping_state, shipping_pincode,
    } = req.body;
    const user_id = req.user.id;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No order items provided' });
    }
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    if (!shipping_address) {
      return res.status(400).json({ error: 'Shipping address is required' });
    }

    const method = (payment_method || 'cod').toLowerCase();
    if (!['razorpay', 'cod', 'upi', 'upi_phonepe', 'upi_gpay', 'upi_paytm'].includes(method)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    // Normalize: treat all upi/* as razorpay flow
    const normalizedMethod = method.startsWith('upi') || method === 'razorpay' ? 'razorpay' : 'cod';

    // Create master order via orderService (all price calc is server-side)
    const result = await createMasterOrder({
      userId: user_id,
      items,
      shippingData: {
        name: shipping_name || req.user.name || '',
        phone: String(phone).replace(/[^\d+]/g, '').substring(0, 20),
        address: shipping_address,
        city: shipping_city || '',
        state: shipping_state || '',
        pincode: shipping_pincode || '',
      },
      paymentMethod: normalizedMethod,
      couponCode: coupon_code,
      liveLocationUrl: live_location_url,
    });

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    const { order, artisanOrders, payment } = result;

    // For Razorpay: create Razorpay order
    let razorpayOrderId = null;
    let razorpayKeyId = null;
    if (normalizedMethod === 'razorpay') {
      const chargeAmount = Math.max(1, Math.round(Number(order.total_amount) || 1));
      const rzpResult = await createRzpOrder(chargeAmount, order.order_number, {
        order_id: order.id,
        user_id,
      });
      if (rzpResult.success) {
        razorpayOrderId = rzpResult.order.id;
        razorpayKeyId = rzpResult.key_id || process.env.RAZORPAY_KEY_ID || 'rzp_live_TamouXgJy9WoAl';
        // Save razorpay_order_id to our DB
        await supabase.from('orders').update({ razorpay_order_id: razorpayOrderId }).eq('id', order.id);
        await supabase.from('payments').update({ provider_order_id: razorpayOrderId }).eq('order_id', order.id);
      } else {
        console.error('[createOrder] Razorpay order creation failed:', rzpResult.error);
        // Don't block order creation — payment can be retried
      }
    }

    // Notifications
    let whatsappLink = null;
    try {
      const settings = getSiteSettings();
      if (settings.orderNotifications && normalizedMethod === 'cod') {
        const { data: fullOrder } = await supabase
          .from('orders')
          .select('*, items:order_items(quantity, price_at_time, size, product:products(id, name, image_url, category))')
          .eq('id', order.id)
          .single();
        const wsRes = await sendOrderWhatsappNotification(
          settings.whatsappNumber, fullOrder || order, req.user?.name || 'Customer'
        );
        if (wsRes) whatsappLink = wsRes.directLink;
      }
    } catch (wsErr) {
      console.error('[createOrder] WhatsApp notification error:', wsErr.message);
    }

    // Artisan notifications
    try {
      const { sendArtisanOrderNotification } = require('../utils/whatsapp');
      for (const artOrder of (artisanOrders || [])) {
        if (!artOrder.artisan_id) continue;
        const { data: artProfile } = await supabase
          .from('artisan_profiles')
          .select('id, store_name, user_id, users(name, phone)')
          .eq('id', artOrder.artisan_id)
          .maybeSingle();
        const artPhone = artProfile?.users?.phone;
        if (artPhone) {
          const artItems = (await supabase.from('order_items').select('*, products(id,name,price,image_url)').eq('order_id', order.id).eq('artisan_id', artOrder.artisan_id)).data || [];
          await sendArtisanOrderNotification(artPhone, artProfile?.store_name || 'Artisan', order, artItems, { name: req.user?.name, phone: order.phone, email: req.user?.email });
        }
      }
    } catch (artNotifyErr) {
      console.error('[createOrder] Artisan notify error:', artNotifyErr.message);
    }

    // Real-time In-App Notifications for Customer, Artisans, and Admin
    try {
      const orderNum = order.order_number || String(order.id).substring(0, 8);
      // 1. Customer Notification
      await createSystemNotification({
        title: `Order #${orderNum} Confirmed! 🎉`,
        message: `Your order for ₹${order.total_amount || order.total_price} has been successfully placed. Artisans are preparing your handcrafted items.`,
        target_audience: 'specific',
        target_user_id: user_id,
        sender_id: null,
      });

      // 2. Admin Notification
      await createSystemNotification({
        title: `New Order Placed: #${orderNum}`,
        message: `Customer ${req.user?.name || 'User'} placed order #${orderNum} worth ₹${order.total_amount || order.total_price} (${normalizedMethod.toUpperCase()}).`,
        target_audience: 'admins',
        sender_id: user_id,
      });

      // 3. Artisans Notifications
      for (const artOrder of (artisanOrders || [])) {
        if (!artOrder.artisan_id) continue;
        const { data: artProfile } = await supabase
          .from('artisan_profiles')
          .select('user_id, store_name')
          .eq('id', artOrder.artisan_id)
          .maybeSingle();

        if (artProfile?.user_id) {
          await createSystemNotification({
            title: `New Order #${orderNum} for ${artProfile.store_name || 'Your Workshop'}!`,
            message: `You have received an order for your handcrafted products (Subtotal: ₹${artOrder.subtotal || artOrder.total_amount || 0}). Please prepare for dispatch.`,
            target_audience: 'specific',
            target_user_id: artProfile.user_id,
            sender_id: user_id,
          });
        }
      }
    } catch (notifErr) {
      console.warn('[createOrder] In-app notification creation error:', notifErr.message);
    }

    // Realtime broadcast
    broadcastSync('ORDERS_UPDATED', { action: 'create', orderId: order.id });
    broadcastSync('PAYMENTS_UPDATED', { action: 'create', orderId: order.id });

    // Autonomous AI Event Processing
    try {
      const { emitEvent } = require('../ai/aiEventBus');
      emitEvent('ORDER_CREATED', 'order', order.id, {
        total_amount: order.total_amount,
        payment_method: normalizedMethod,
        user_id,
      });
    } catch (e) {}

    res.status(201).json({
      ...order,
      artisan_orders: artisanOrders,
      payment,
      // Razorpay checkout data (only if applicable)
      razorpay: razorpayOrderId ? {
        order_id: razorpayOrderId,
        key_id: razorpayKeyId,
        amount: Math.round(order.total_amount * 100),
        currency: 'INR',
        name: 'KalaStyle AI',
        description: `Order ${order.order_number}`,
      } : null,
    });
  } catch (error) {
    console.error('[createOrder] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to create order' });
  }
};

// ── 2. GET MY ORDERS (Customer) ──────────────────────────────────────────────

exports.getMyOrders = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        items:order_items (
          id, quantity, price_at_time, unit_price_snapshot, total_price, size,
          product_name_snapshot, product_image_snapshot,
          product:products (id, name, image_url, category)
        ),
        artisan_orders (
          id, artisan_id, status, subtotal, total_amount,
          accepted_at, prepared_at, dispatched_at, out_for_delivery_at, delivered_at,
          artisan:artisan_profiles (id, store_name, profile_image)
        )
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('[getMyOrders] Error:', error);
    res.status(500).json({ error: 'Server error fetching orders' });
  }
};

// ── 3. GET ORDER BY ID ───────────────────────────────────────────────────────

exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        users (name, email),
        items:order_items (
          id, quantity, price_at_time, unit_price_snapshot, total_price, size,
          product_name_snapshot, product_image_snapshot, artisan_id,
          product:products (id, name, image_url, category, artisan_id)
        ),
        artisan_orders (
          id, artisan_id, status, subtotal, delivery_fee, total_amount,
          accepted_at, prepared_at, ready_at, dispatched_at, out_for_delivery_at, delivered_at, rejection_reason,
          artisan:artisan_profiles (id, store_name, profile_image, location)
        ),
        payment:payments (id, method, provider, status, amount, paid_at, refunded_at)
      `)
      .eq('id', id)
      .single();

    if (error || !order) return res.status(404).json({ error: 'Order not found' });

    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized access to this order' });
    }

    res.json(order);
  } catch (err) {
    console.error('[getOrderById] Error:', err);
    res.status(500).json({ error: 'Server error fetching order' });
  }
};

// ── 4. GET ORDER TRACKING ────────────────────────────────────────────────────

exports.getOrderTracking = async (req, res) => {
  try {
    const { id } = req.params;
    let query = supabase
      .from('orders')
      .select(`
        id, user_id, order_number, order_status, status, payment_status, payment_method,
        total_amount, total_price, created_at, updated_at,
        shipping_name, shipping_address, shipping_city, shipping_state, shipping_pincode, phone,
        artisan_orders (
          id, artisan_id, status, subtotal, total_amount,
          accepted_at, prepared_at, ready_at, dispatched_at, out_for_delivery_at, delivered_at,
          cancelled_at, rejected_at, rejection_reason, created_at, updated_at,
          artisan:artisan_profiles (id, store_name, profile_image, location)
        ),
        items:order_items (
          id, quantity, size, product_name_snapshot, product_image_snapshot,
          unit_price_snapshot, total_price, artisan_id
        )
      `);

    // Support lookup by UUID id or order_number
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      query = query.eq('id', id);
    } else {
      query = query.eq('order_number', id);
    }

    const { data: order, error } = await query.maybeSingle();

    if (error || !order) {
      console.warn(`[getOrderTracking] Order ${id} not found:`, error?.message);
      return res.status(404).json({ error: 'Order not found' });
    }

    const isBuyer = String(order.user_id) === String(req.user.id);
    const isAdmin = (req.user.role || '').toLowerCase() === 'admin';
    let isArtisan = (order.artisan_orders || []).some(
      (ao) => String(ao.artisan_id) === String(req.user.id)
    );
    if (!isArtisan && (req.user.role || '').toLowerCase() === 'artisan') {
      const { data: prof } = await supabase
        .from('artisan_profiles')
        .select('id')
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (prof?.id) {
        isArtisan = (order.artisan_orders || []).some(
          (ao) => String(ao.artisan_id) === String(prof.id)
        );
      }
    }

    if (!isBuyer && !isAdmin && !isArtisan) {
      console.warn(`[getOrderTracking] User ${req.user.id} unauthorized for order ${id}`);
      return res.status(403).json({ error: 'Unauthorized access to this order tracking' });
    }

    // Fallback: If artisan_orders is empty, synthesize from order details
    if (!order.artisan_orders || order.artisan_orders.length === 0) {
      order.artisan_orders = [{
        id: order.id,
        artisan_id: null,
        status: order.order_status || order.status || 'pending',
        subtotal: order.total_amount || order.total_price || 0,
        total_amount: order.total_amount || order.total_price || 0,
        created_at: order.created_at,
        updated_at: order.updated_at,
        artisan: {
          store_name: 'KalaStyle Artisan',
          profile_image: null,
        },
      }];
    }

    res.json(order);
  } catch (err) {
    console.error('[getOrderTracking] Error:', err);
    res.status(500).json({ error: 'Server error fetching order tracking' });
  }
};

// ── 5. ALL ORDERS (Admin) ────────────────────────────────────────────────────

exports.getAllOrders = async (req, res) => {
  try {
    const { status, payment_status, payment_method } = req.query;

    let query = supabase
      .from('orders')
      .select(`
        *,
        users (id, name, email),
        artisan_orders (id, artisan_id, status),
        payment:payments (id, method, status, amount)
      `)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') query = query.eq('order_status', status);
    if (payment_status && payment_status !== 'all') query = query.eq('payment_status', payment_status);
    if (payment_method && payment_method !== 'all') query = query.eq('payment_method', payment_method);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('[getAllOrders] Error:', error);
    res.status(500).json({ error: 'Server error fetching orders' });
  }
};

// ── 6. UPDATE ORDER STATUS (Admin/Artisan) ───────────────────────────────────

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status, payment_status } = req.body;
    const { id } = req.params;

    if (!status && !payment_status) {
      return res.status(400).json({ error: 'Status or payment_status is required' });
    }

    const updates = {
      ...(status ? { status, order_status: status } : {}),
      ...(payment_status ? { payment_status } : {}),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select('*, users (id, name, email, phone)')
      .single();

    if (error) throw error;

    // Sync sub-orders and trigger earnings if delivered
    if (status) {
      try {
        const aoUpdate = {
          status,
          updated_at: new Date().toISOString(),
          ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
          ...(status === 'cancelled' ? { cancelled_at: new Date().toISOString() } : {}),
        };
        await supabase.from('artisan_orders').update(aoUpdate).eq('order_id', id);

        if (status === 'delivered') {
          const { createArtisanEarning } = require('../services/orderService');
          const { data: artOrders } = await supabase.from('artisan_orders').select('*').eq('order_id', id);
          if (artOrders && artOrders.length > 0) {
            for (const ao of artOrders) {
              if (ao.artisan_id) {
                await createArtisanEarning(ao.id, ao, ao.artisan_id);
              }
            }
          }
        }
      } catch (syncErr) {
        console.warn('Sub-order sync error in orderController.updateOrderStatus:', syncErr.message);
      }
    }

    broadcastSync('ORDERS_UPDATED', { id, status, payment_status, order: data });
    broadcastSync('ARTISAN_ORDERS_UPDATED', { orderId: id, status });
    broadcastSync('PAYMENTS_UPDATED', { id, status, payment_status });
    broadcastSync('EARNINGS_UPDATED', { orderId: id, status });

    if (data?.user_id && status) {
      try {
        const orderNum = data.order_number || String(id).substring(0, 8);
        await createSystemNotification({
          title: `Order #${orderNum} Status: ${status.toUpperCase()}`,
          message: `Your order #${orderNum} has been updated to "${status}". Thank you for supporting authentic Indian artisans.`,
          target_audience: 'specific',
          target_user_id: data.user_id,
          sender_id: req.user?.id || null,
        });
      } catch (e) {
        console.warn('Notification error on order status update:', e.message);
      }
    }

    if (status === 'cancelled') {
      try {
        const settings = getSiteSettings();
        if (settings.orderNotifications) {
          await sendOrderCancelWhatsappNotification(settings.whatsappNumber, data, data?.users?.name || 'Customer');
        }
      } catch (wsErr) {
        console.error('[updateOrderStatus] WhatsApp cancel error:', wsErr.message);
      }
    }

    res.json(data);
  } catch (error) {
    console.error('[updateOrderStatus] Error:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
};

// ── 7. CANCEL ORDER (Customer) ───────────────────────────────────────────────

exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*, items:order_items(product_id, quantity)')
      .eq('id', id)
      .single();

    if (fetchError || !order) return res.status(404).json({ error: 'Order not found' });
    if (order.user_id !== user_id) return res.status(403).json({ error: 'Unauthorized to cancel this order' });

    const cancelableStatuses = ['pending', 'payment_verification_pending', 'confirmed'];
    const effectiveStatus = order.order_status || order.status;
    if (!cancelableStatuses.includes(effectiveStatus)) {
      return res.status(400).json({ error: `Cannot cancel an order with status: ${effectiveStatus}` });
    }

    // Check artisan_orders — if any is dispatched+, block cancellation
    const { data: artisanOrders } = await supabase
      .from('artisan_orders')
      .select('status')
      .eq('order_id', id);

    const nonCancellable = ['dispatched', 'out_for_delivery', 'delivered'];
    const hasDispatched = (artisanOrders || []).some(ao => nonCancellable.includes(ao.status));
    if (hasDispatched) {
      return res.status(400).json({ error: 'Cannot cancel: one or more items are already dispatched or delivered' });
    }

    // Cancellation window
    const settings = await getEcomSettings();
    const createdTime = new Date(order.created_at);
    const diffHours = (Date.now() - createdTime.getTime()) / (1000 * 60 * 60);
    if (diffHours > settings.cancellation_window_hours) {
      return res.status(400).json({
        error: `Orders can only be cancelled within ${settings.cancellation_window_hours} hours of placement`,
      });
    }

    // Cancel master order
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({ status: 'cancelled', order_status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (updateError) throw updateError;

    // Cancel artisan sub-orders
    await supabase.from('artisan_orders').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('order_id', id);

    // Restore inventory
    await restoreInventory(id);

    // Release coupon
    if (order.coupon_code) {
      await supabase.from('coupons').update({ is_used: false })
        .eq('code', order.coupon_code.trim().toUpperCase())
        .eq('user_id', user_id);
    }

    // Handle refund for paid online orders
    let refundInfo = null;
    if (order.payment_status === 'paid' && order.payment_method === 'razorpay') {
      const refundResult = await processRefund(id, null, 'Order cancelled by customer');
      if (refundResult.success) {
        refundInfo = refundResult.refund;
      }
    }

    // Reverse reward if applicable
    await reverseRewardIfNeeded(user_id);

    // WhatsApp notification
    let whatsappLink = null;
    try {
      const settings2 = getSiteSettings();
      if (settings2.orderNotifications) {
        const { data: fullOrder } = await supabase.from('orders').select('*, user:users(id,name,email), items:order_items(quantity, price_at_time, size, product:products(id,name,image_url))').eq('id', id).single();
        const wsRes = await sendOrderCancelWhatsappNotification(settings2.whatsappNumber, fullOrder || updatedOrder, req.user?.name || 'Customer');
        if (wsRes) whatsappLink = wsRes.directLink;
      }
    } catch (wsErr) {
      console.error('[cancelOrder] WhatsApp error:', wsErr.message);
    }

    broadcastSync('ORDERS_UPDATED', { id, status: 'cancelled' });

    res.json({ ...updatedOrder, refund: refundInfo });
  } catch (error) {
    console.error('[cancelOrder] Error:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
};

// ── 8. UPDATE ORDER DETAILS (Customer) ──────────────────────────────────────

exports.updateOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;
    const { shipping_address, phone, payment_method, item_sizes } = req.body;

    const { data: order, error: fetchError } = await supabase
      .from('orders').select('*').eq('id', id).single();

    if (fetchError || !order) return res.status(404).json({ error: 'Order not found' });
    if (order.user_id !== user_id) return res.status(403).json({ error: 'Unauthorized to edit this order' });

    const effectiveStatus = order.order_status || order.status;
    if (!['pending', 'confirmed'].includes(effectiveStatus)) {
      return res.status(400).json({ error: `Cannot edit an order that is already ${effectiveStatus}` });
    }

    const settings = await getEcomSettings();
    const diffHours = (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60);
    if (diffHours > settings.cancellation_window_hours) {
      return res.status(400).json({ error: `Orders can only be edited within ${settings.cancellation_window_hours} hours` });
    }

    const cleanPhone = String(phone || order.phone || '').replace(/\D/g, '');
    if (cleanPhone.length < 10) return res.status(400).json({ error: 'Phone number must have at least 10 digits' });

    const updateData = {};
    if (shipping_address) updateData.shipping_address = shipping_address;
    updateData.phone = cleanPhone.substring(0, 20);
    if (payment_method) updateData.payment_method = payment_method;
    updateData.updated_at = new Date().toISOString();

    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders').update(updateData).eq('id', id).select().single();
    if (updateError) throw updateError;

    if (item_sizes && typeof item_sizes === 'object') {
      for (const [itemId, newSize] of Object.entries(item_sizes)) {
        if (newSize) await supabase.from('order_items').update({ size: newSize }).eq('id', itemId).eq('order_id', id);
      }
    }

    const { data: fullOrder } = await supabase.from('orders').select('*, items:order_items(id, quantity, price_at_time, size, product:products(id,name,image_url,category,sizes))').eq('id', id).single();

    try {
      const settings2 = getSiteSettings();
      if (settings2.orderNotifications) {
        await sendOrderEditWhatsappNotification(settings2.whatsappNumber, fullOrder || updatedOrder, req.user?.name || 'Customer');
      }
    } catch (wsErr) {
      console.error('[updateOrderDetails] WhatsApp error:', wsErr.message);
    }

    res.json(fullOrder || updatedOrder);
  } catch (error) {
    console.error('[updateOrderDetails] Error:', error);
    res.status(500).json({ error: 'Failed to update order details' });
  }
};

// ── 9. PAY ORDER (legacy UTR flow — kept for backward compatibility) ──────────

exports.payOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method, transaction_id, ref_no, utr_number } = req.body;
    const ref = (utr_number || transaction_id || ref_no || '').trim();

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*, users (id, name, email, phone), items:order_items(quantity, price_at_time, size, product:products(id, name, image_url, category, artisan_id))')
      .eq('id', id).single();

    if (fetchError || !order) return res.status(404).json({ error: 'Order not found' });

    const artisanIds = [...new Set((order.items || []).map(i => i.product?.artisan_id).filter(Boolean))];
    let primaryArtisanPhone = null;
    let primaryArtisanStore = null;

    if (artisanIds.length > 0) {
      const { data: artProfiles } = await supabase
        .from('artisan_profiles').select('id, store_name, user_id, users(name, phone)')
        .in('id', artisanIds);
      if (artProfiles?.length > 0) {
        primaryArtisanPhone = artProfiles[0].users?.phone;
        primaryArtisanStore = artProfiles[0].store_name || artProfiles[0].users?.name;
      }
    }

    const targetArtisanPhone = primaryArtisanPhone || getSiteSettings().whatsappNumber;
    const targetArtisanStore = primaryArtisanStore || 'Artisan Partner';

    const updateData = {
      payment_status: 'pending_verification',
      payment_method: payment_method || order.payment_method || 'upi',
      transaction_id: ref || `REF_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      status: 'payment_verification_pending',
      order_status: 'payment_verification_pending',
      updated_at: new Date().toISOString(),
    };

    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders').update(updateData).eq('id', id).select().single();
    if (updateError) throw updateError;

    broadcastSync('PAYMENTS_UPDATED', { id, payment_status: 'pending_verification', utr_number: ref });
    broadcastSync('ORDERS_UPDATED', { id, status: 'payment_verification_pending' });

    let whatsappLink = null;
    let whatsappMessage = null;
    try {
      const settings = getSiteSettings();
      if (settings.orderNotifications) {
        const { sendArtisanUtrSubmittedNotification } = require('../utils/whatsapp');
        const wsRes = await sendArtisanUtrSubmittedNotification(
          targetArtisanPhone, targetArtisanStore, order, req.user?.name || order.users?.name || 'Customer', ref
        );
        if (wsRes) { whatsappLink = wsRes.directLink; whatsappMessage = wsRes.messageText; }
      }
    } catch (wsErr) {
      console.error('[payOrder] WhatsApp notify error:', wsErr.message);
    }

    res.json({ ...updatedOrder, whatsappLink, whatsappMessage, artisanPhone: targetArtisanPhone, artisanStore: targetArtisanStore });
  } catch (error) {
    console.error('[payOrder] Error:', error);
    res.status(500).json({ error: 'Failed to update payment status' });
  }
};

// ── 10. VERIFY PAYMENT (Artisan UTR verification) ────────────────────────────

exports.verifyPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    const userId = req.user.id;
    const userRole = (req.user.role || '').toLowerCase();

    if (userRole === 'admin') {
      return res.status(403).json({ error: 'Only the related artisan can verify this payment, not admin.' });
    }
    if (userRole !== 'artisan') {
      return res.status(403).json({ error: 'Artisan privileges required.' });
    }

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*, users(id, name, email, phone), items:order_items(quantity, price_at_time, size, product:products(id, name, image_url, category, artisan_id))')
      .eq('id', id).single();

    if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' });

    const { data: artisanProf } = await supabase
      .from('artisan_profiles').select('id, store_name, user_id, users(name, phone)')
      .eq('user_id', userId).maybeSingle();

    const artisanProfileId = artisanProf?.id;
    const orderArtisanIds = (order.items || []).map(i => i.product?.artisan_id).filter(Boolean);
    const isRelatedArtisan = orderArtisanIds.some(artId => artId === artisanProfileId || artId === userId);

    if (!isRelatedArtisan) {
      return res.status(403).json({ error: 'Access denied. You are not the assigned artisan for this order.' });
    }

    const isApprove = action === 'approve';
    const updateData = {
      payment_status: isApprove ? 'paid' : 'failed',
      status: isApprove ? 'confirmed' : 'cancelled',
      order_status: isApprove ? 'confirmed' : 'cancelled',
      updated_at: new Date().toISOString(),
    };

    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders').update(updateData).eq('id', id).select().single();
    if (updateError) throw updateError;

    if (isApprove) {
      // Update artisan_orders to pending (ready for artisan to start processing)
      await supabase.from('artisan_orders').update({ status: 'pending', updated_at: new Date().toISOString() }).eq('order_id', id);
      // Update payment record
      await supabase.from('payments').update({ status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('order_id', id);
    } else {
      // Restore inventory on rejection
      await restoreInventory(id);
    }

    broadcastSync('PAYMENTS_UPDATED', { id, status: updatedOrder?.payment_status });
    broadcastSync('ORDERS_UPDATED', { id, status: updatedOrder?.status });

    try {
      const settings = getSiteSettings();
      if (settings.orderNotifications) {
        const customerName = order.users?.name || 'Customer';
        const artisanStore = artisanProf?.store_name || req.user.name || 'Artisan';
        const artisanPhone = artisanProf?.users?.phone;
        if (isApprove) {
          await sendPaymentVerifiedWhatsappNotification(artisanPhone, order, customerName, artisanStore);
        } else {
          await sendOrderCancelWhatsappNotification(artisanPhone, order, customerName);
        }
      }
    } catch (wsErr) {
      console.error('[verifyPayment] WhatsApp notify error:', wsErr.message);
    }

    res.json({ success: true, message: isApprove ? 'UTR verified and order confirmed!' : 'Order rejected', order: updatedOrder });
  } catch (err) {
    console.error('[verifyPayment] Error:', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
};

// ── 11. GET CALCULATE TOTAL (price preview before checkout) ─────────────────

exports.calculateTotal = async (req, res) => {
  try {
    const { items, coupon_code } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'No items provided' });

    const { calculateOrderTotals, validateCoupon } = require('../services/orderService');
    const { calculateDeliveryFee } = require('../config/ecommerce');

    const totalsResult = await calculateOrderTotals(items);
    if (totalsResult.error) return res.status(400).json({ error: totalsResult.error });

    const { items: enrichedItems, subtotal } = totalsResult;
    const deliveryFee = await calculateDeliveryFee(subtotal);
    const couponResult = await validateCoupon(coupon_code, req.user?.id, subtotal);
    const discount = couponResult.error ? 0 : (couponResult.discount || 0);
    const total = Math.max(0, subtotal + deliveryFee - discount);

    res.json({ subtotal, delivery_fee: deliveryFee, discount, total, items: enrichedItems });
  } catch (err) {
    console.error('[calculateTotal] Error:', err);
    res.status(500).json({ error: 'Failed to calculate total' });
  }
};

// ── 12. ADMIN REFUND ─────────────────────────────────────────────────────────

exports.initiateRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    const result = await processRefund(id, amount || null, reason || 'Admin initiated refund');
    if (result.error) return res.status(400).json({ error: result.error });

    broadcastSync('PAYMENTS_UPDATED', { orderId: id, status: 'refunded' });
    broadcastSync('ORDERS_UPDATED', { orderId: id, order_status: 'cancelled' });

    res.json({ success: true, refund: result.refund });
  } catch (err) {
    console.error('[initiateRefund] Error:', err);
    res.status(500).json({ error: 'Failed to initiate refund' });
  }
};
