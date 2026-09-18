/**
 * backend/services/whatsappService.js
 * ─────────────────────────────────────────────────────────────────
 * Twilio WhatsApp dispatch and notification tracking service.
 * Enforces per-artisan data isolation: Artisans receive ONLY their own items.
 * Failures are safely logged and NEVER roll back orders.
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const {
  formatPhone,
  sendArtisanOrderNotification,
  sendCODOrderNotification,
  sendArtisanUtrSubmittedNotification,
  sendOrderCancelWhatsappNotification,
  sendShippingDispatchNotification,
} = require('../utils/whatsapp');

/**
 * Send isolated WhatsApp notification to a specific artisan for an order.
 */
exports.sendArtisanOrderWhatsApp = async ({ artisanId, orderId, notificationType = 'NEW_ORDER' }) => {
  if (!artisanId || !orderId) {
    throw new Error('artisanId and orderId are required');
  }

  const idempotencyKey = `${orderId}_${artisanId}_${notificationType}`;

  // 1. Check if already dispatched successfully
  try {
    const { data: existing } = await safeQuery(() =>
      supabase
        .from('whatsapp_notifications')
        .select('id, status, twilio_message_sid')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
    );

    if (existing && existing.status === 'sent') {
      return {
        success: true,
        cached: true,
        message: 'Notification already dispatched',
        sid: existing.twilio_message_sid,
      };
    }
  } catch (e) {
    // Non-blocking if table is missing or query fails
  }

  // 2. Fetch order and customer details
  const { data: order, error: orderErr } = await safeQuery(() =>
    supabase
      .from('orders')
      .select('*, users(name, email, phone)')
      .eq('id', orderId)
      .single()
  );

  if (orderErr || !order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // 3. Fetch artisan details
  const { data: artisan, error: artErr } = await safeQuery(() =>
    supabase
      .from('artisan_profiles')
      .select('*, users(name, phone)')
      .eq('id', artisanId)
      .single()
  );

  if (artErr || !artisan) {
    throw new Error(`Artisan not found: ${artisanId}`);
  }

  const artisanPhone = artisan.users?.phone || artisan.contact_phone;
  if (!artisanPhone) {
    console.warn(`[whatsappService] Artisan ${artisan.store_name} has no phone configured.`);
    return { success: false, reason: 'Artisan phone number missing' };
  }

  // 4. Fetch strictly this artisan's items from the order (DATA ISOLATION)
  const { data: items, error: itemsErr } = await safeQuery(() =>
    supabase
      .from('order_items')
      .select('*, products(name, price, image_url)')
      .eq('order_id', orderId)
      .eq('artisan_id', artisanId)
  );

  if (itemsErr || !items || items.length === 0) {
    return { success: false, reason: 'No items in this order belong to this artisan' };
  }

  const customer = {
    name: order.shipping_name || order.users?.name || 'Valued Customer',
    phone: order.phone || order.users?.phone || '',
    email: order.users?.email || '',
  };

  // 5. Send WhatsApp notification via Twilio
  let twilioResult;
  try {
    if (notificationType === 'NEW_ORDER' && order.payment_method === 'cod') {
      twilioResult = await sendCODOrderNotification(artisanPhone, artisan.store_name, order, items, customer);
    } else if (notificationType === 'UTR_SUBMITTED') {
      twilioResult = await sendArtisanUtrSubmittedNotification(artisanPhone, artisan.store_name, order, customer.name);
    } else {
      twilioResult = await sendArtisanOrderNotification(artisanPhone, artisan.store_name, order, items, customer);
    }
  } catch (err) {
    console.error(`[whatsappService] Twilio call failed for artisan ${artisan.store_name}:`, err.message);
    twilioResult = { success: false, error: err.message };
  }

  // 6. Record in whatsapp_notifications table
  const status = twilioResult?.success ? 'sent' : 'failed';
  const sid = twilioResult?.results?.[0]?.sid || twilioResult?.sid || null;
  const errMsg = twilioResult?.results?.[0]?.error || twilioResult?.error || (twilioResult?.success ? null : 'Failed to deliver');

  try {
    await safeQuery(() =>
      supabase.from('whatsapp_notifications').upsert({
        order_id: orderId,
        artisan_id: artisanId,
        phone_number: formatPhone(artisanPhone) || artisanPhone,
        message_type: notificationType,
        idempotency_key: idempotencyKey,
        twilio_message_sid: sid,
        status,
        error_message: errMsg,
        payload_snapshot: {
          artisanStore: artisan.store_name,
          itemsCount: items.length,
          orderNumber: order.order_number || order.id?.substring(0, 8),
          totalAmount: items.reduce((s, i) => s + (i.total_price || i.price_at_time * i.quantity), 0),
        },
        sent_at: status === 'sent' ? new Date().toISOString() : null,
      }, { onConflict: 'idempotency_key' })
    );
  } catch (logErr) {
    // Non-blocking log persistence
  }

  return {
    success: twilioResult?.success || false,
    artisan_id: artisanId,
    store_name: artisan.store_name,
    phone: artisanPhone,
    status,
    sid,
    error: errMsg,
  };
};

/**
 * Batch dispatch notifications to all distinct artisans in an order.
 */
exports.notifyOrderArtisans = async (orderId, notificationType = 'NEW_ORDER') => {
  const { data: orderItems } = await safeQuery(() =>
    supabase.from('order_items').select('artisan_id').eq('order_id', orderId)
  );

  const uniqueArtisanIds = Array.from(
    new Set((orderItems || []).map(i => i.artisan_id).filter(Boolean))
  );

  const results = [];
  for (const artId of uniqueArtisanIds) {
    const res = await exports.sendArtisanOrderWhatsApp({
      artisanId: artId,
      orderId,
      notificationType,
    });
    results.push(res);
  }

  return results;
};

/**
 * Send real-time WhatsApp shipping dispatch and tracking notification to the customer.
 */
exports.sendShippingDispatchWhatsApp = async ({ orderId, shipment }) => {
  if (!orderId) return { success: false, reason: 'orderId is required' };

  const awbCode = shipment?.awb_code || 'assigned';
  const idempotencyKey = `${orderId}_${awbCode}_SHIPPING_DISPATCH`;

  try {
    const { data: existing } = await safeQuery(() =>
      supabase
        .from('whatsapp_notifications')
        .select('id, status, twilio_message_sid')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
    );

    if (existing && existing.status === 'sent') {
      return { success: true, cached: true, sid: existing.twilio_message_sid };
    }
  } catch (e) {}

  try {
    const { data: order } = await safeQuery(() =>
      supabase
        .from('orders')
        .select('*, users(name, phone)')
        .eq('id', orderId)
        .single()
    );

    if (!order) return { success: false, reason: 'Order not found' };

    const customerPhone = order.phone || order.users?.phone;
    if (!customerPhone) {
      return { success: false, reason: 'No customer phone number available' };
    }

    const customerName = order.shipping_name || order.users?.name || 'Customer';

    const twilioResult = await sendShippingDispatchNotification(customerPhone, customerName, order, shipment);
    const status = twilioResult?.success ? 'sent' : 'failed';
    const sid = twilioResult?.results?.[0]?.sid || twilioResult?.sid || null;
    const errMsg = twilioResult?.results?.[0]?.error || (twilioResult?.success ? null : 'Failed to deliver');

    await safeQuery(() =>
      supabase.from('whatsapp_notifications').upsert({
        order_id: orderId,
        phone_number: formatPhone(customerPhone) || customerPhone,
        message_type: 'SHIPPING_DISPATCH',
        idempotency_key: idempotencyKey,
        twilio_message_sid: sid,
        status,
        error_message: errMsg,
        payload_snapshot: {
          courier: shipment?.courier_name,
          awb: shipment?.awb_code,
          trackingUrl: shipment?.tracking_url,
        },
        sent_at: status === 'sent' ? new Date().toISOString() : null,
      }, { onConflict: 'idempotency_key' })
    );

    return { success: twilioResult?.success || false, sid, error: errMsg };
  } catch (err) {
    console.warn('[whatsappService] sendShippingDispatchWhatsApp non-blocking warning:', err.message);
    return { success: false, error: err.message };
  }
};
