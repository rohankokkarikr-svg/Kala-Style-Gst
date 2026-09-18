/**
 * backend/services/shipping/shippingService.js
 * ─────────────────────────────────────────────────────────────────
 * Core Logistics & Shipping Service for KalaStyle AI.
 * Orchestrates order fulfillment, packaging calculations, courier dispatch,
 * AWB generation, pickup scheduling, tracking, and multi-channel notifications.
 */

const { v4: uuidv4 } = require('uuid');
const supabase = require('../../config/supabase');
const { safeQuery } = require('../../config/supabase');
const { broadcastSync } = require('../../utils/realtime');
const { getShippingProvider } = require('./shippingProvider');
const whatsappService = require('../whatsappService');
const {
  SHIPPING_STATUS,
  getDefaultWeight,
  getDefaultLength,
  getDefaultBreadth,
  getDefaultHeight,
  getDefaultPickupLocation,
  getActiveProviderType,
} = require('./shippingConfig');

// In-memory fallback cache for shipments when database table is unavailable
const inMemoryShipments = new Map();
const inMemoryWebhooks = new Map();

/**
 * Check delivery serviceability and rates for customer PIN code.
 */
async function checkServiceability({ pickup_postcode, delivery_postcode, weight, cod = false, declared_value = 0 }) {
  const provider = getShippingProvider();
  return provider.checkServiceability({
    pickup_postcode: pickup_postcode || '560001',
    delivery_postcode,
    weight,
    cod,
    declared_value,
  });
}

/**
 * Calculate shipping rates from multiple courier partners.
 */
async function getShippingRates(params) {
  return checkServiceability(params);
}

/**
 * Create a new Shiprocket shipment for an existing KalaStyle order.
 * Strictly prevents duplicate shipment creation.
 *
 * @param {string} orderId UUID of the order
 * @param {object} [options] Custom overrides (dimensions, weight, pickup location)
 * @returns {Promise<object>} Standardized created shipment record
 */
async function createShipmentFromOrder(orderIdOrData, options = {}) {
  const orderId = typeof orderIdOrData === 'object' && orderIdOrData !== null ? orderIdOrData.id : orderIdOrData;
  if (!orderId) {
    throw new Error('order_id is required to create a shipment.');
  }

  // 1. Check if a shipment already exists for this order (DUPLICATE PREVENTION)
  const existingShipment = await getShipmentByOrderId(orderId);
  if (existingShipment && !options.force_recreate) {
    console.log(`ℹ️ [Shipping Service] Shipment already exists for order ${orderId}: ${existingShipment.id}`);
    return {
      success: true,
      already_exists: true,
      shipment: existingShipment,
      message: `Shipment already exists for this order (AWB: ${existingShipment.awb_code || 'Pending'}).`,
    };
  }

  // 2. Fetch order with items, customer details, and artisan information (or use provided object)
  let order = typeof orderIdOrData === 'object' && orderIdOrData !== null && orderIdOrData.shipping_address ? orderIdOrData : null;
  if (!order) {
    const { data: dbOrder, error: orderErr } = await safeQuery(() =>
      supabase
        .from('orders')
        .select('*, users(id, name, email, phone)')
        .eq('id', orderId)
        .single()
    );

    if (orderErr || !dbOrder) {
      throw new Error(`Order not found: ${orderId}`);
    }
    order = dbOrder;
  }

  // 3. Payment verification & state machine guard:
  // - COD orders may ship when payment_status is 'cod_pending' or 'paid' (unless cancelled).
  // - Prepaid / Razorpay / UPI orders MUST have payment_status === 'paid' (or 'completed').
  // - order_status = confirmed CANNOT bypass prepaid payment verification!
  const isCod = String(order.payment_method || '').toLowerCase().trim() === 'cod';
  const isPaid = ['paid', 'completed'].includes(String(order.payment_status || '').toLowerCase().trim());
  const isCancelled = ['cancelled', 'rejected'].includes(String(order.status || order.order_status || '').toLowerCase().trim());

  if (isCancelled) {
    throw new Error(`Cannot ship cancelled order ${order.order_number || orderId}.`);
  }

  if (isCod) {
    const validCodPayment = ['cod_pending', 'paid'].includes(String(order.payment_status || '').toLowerCase().trim());
    if (!validCodPayment) {
      throw new Error(`Cannot ship COD order ${order.order_number || orderId}: Payment status is '${order.payment_status}'.`);
    }
  } else {
    if (!isPaid) {
      throw new Error(
        `Shipment creation blocked because the prepaid order has not been payment-verified. Order ${order.order_number || orderId} has payment_status '${order.payment_status}'.`
      );
    }
  }

  // 4. Fetch order items (or use provided in order.items)
  let orderItems = Array.isArray(order.items) && order.items.length > 0 ? order.items : null;
  if (!orderItems) {
    const { data: items } = await safeQuery(() =>
      supabase
        .from('order_items')
        .select('*, products(id, name, weight, length, breadth, height, price, artisan_id)')
        .eq('order_id', orderId)
    );
    orderItems = items && items.length > 0 ? items : [
      {
        product_name_snapshot: 'Handmade Indian Craft Collection',
        unit_price_snapshot: order.subtotal || order.total_amount || 500,
        quantity: 1,
      },
    ];
  }

  // 5. Determine package weight and dimensions
  let totalWeight = 0;
  for (const item of orderItems) {
    const pWeight = parseFloat(item.products?.weight) || (getDefaultWeight() / Math.max(1, orderItems.length));
    totalWeight += pWeight * (parseInt(item.quantity, 10) || 1);
  }
  const packageWeight = Math.max(0.1, options.weight || totalWeight || getDefaultWeight());

  // 6. Determine artisan pickup location
  let pickupLocation = options.pickup_location || getDefaultPickupLocation();
  const primaryArtisanId = orderItems[0]?.artisan_id || orderItems[0]?.products?.artisan_id;

  if (primaryArtisanId && !options.pickup_location) {
    try {
      const { data: artisan } = await safeQuery(() =>
        supabase
          .from('artisan_profiles')
          .select('pickup_location, store_name')
          .eq('id', primaryArtisanId)
          .single()
      );
      if (artisan?.pickup_location) {
        pickupLocation = artisan.pickup_location;
      }
    } catch (e) {}
  }

  // 7. Call shipping provider adapter (Shiprocket or Mock)
  const provider = getShippingProvider(options.provider);
  const providerResult = await provider.createOrder({
    order_id: order.id,
    order_number: order.order_number || `KS-${order.id.slice(0, 8).toUpperCase()}`,
    order_date: order.created_at || new Date().toISOString(),
    pickup_location: pickupLocation,
    billing_customer_name: order.shipping_full_name || order.users?.name || 'Customer',
    billing_address: order.shipping_address || 'Artisan Craft Order Address',
    billing_city: order.shipping_city || 'City',
    billing_pincode: order.shipping_pincode || '560001',
    billing_state: order.shipping_state || 'Karnataka',
    billing_phone: order.shipping_phone || order.users?.phone || '9876543210',
    billing_email: order.users?.email || 'customer@kalastyle.com',
    payment_method: isCod ? 'COD' : 'Prepaid',
    subtotal: order.total_amount || order.subtotal || 500,
    order_items: orderItems.map((item, idx) => ({
      name: item.product_name_snapshot || `Craft Product ${idx + 1}`,
      sku: `SKU-${item.product_id || idx + 1}`,
      units: item.quantity || 1,
      selling_price: item.unit_price_snapshot || 500,
    })),
    weight: packageWeight,
    length: options.length || getDefaultLength(),
    breadth: options.breadth || getDefaultBreadth(),
    height: options.height || getDefaultHeight(),
  });

  // 8. Construct normalized shipment record
  const shipmentId = uuidv4();
  const shipmentRecord = {
    id: shipmentId,
    order_id: order.id,
    provider: provider.name,
    provider_order_id: providerResult.provider_order_id || null,
    provider_shipment_id: providerResult.provider_shipment_id || null,
    awb_code: providerResult.awb_code || null,
    courier_company_id: providerResult.courier_company_id || null,
    courier_name: providerResult.courier_name || null,
    pickup_location: pickupLocation,
    status: SHIPPING_STATUS.READY_TO_SHIP,
    shipment_status: SHIPPING_STATUS.READY_TO_SHIP,
    tracking_url: providerResult.awb_code ? `https://shiprocket.co/tracking/${providerResult.awb_code}` : null,
    label_url: null,
    invoice_url: null,
    shipping_cost: parseFloat(order.delivery_fee) || 0,
    package_weight: packageWeight,
    package_length: options.length || getDefaultLength(),
    package_breadth: options.breadth || getDefaultBreadth(),
    package_height: options.height || getDefaultHeight(),
    declared_value: parseFloat(order.total_amount) || 0,
    payment_method: isCod ? 'COD' : 'Prepaid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 9. Persist to Supabase and in-memory cache
  inMemoryShipments.set(shipmentId, shipmentRecord);
  try {
    await safeQuery(() => supabase.from('shipping_shipments').insert([shipmentRecord]));
  } catch (err) {
    console.warn('⚠️ [Shipping Service] DB insert warning (fallback active):', err.message);
  }

  // 10. Update master order record
  try {
    await safeQuery(() =>
      supabase
        .from('orders')
        .update({
          shipment_id: shipmentId,
          shipping_status: SHIPPING_STATUS.READY_TO_SHIP,
          status: order.status === 'pending' ? 'confirmed' : order.status,
        })
        .eq('id', order.id)
    );
  } catch (e) {}

  // 11. Broadcast realtime event to all connected dashboards
  broadcastSync('SHIPMENT_UPDATED', {
    action: 'created',
    order_id: order.id,
    shipment_id: shipmentId,
    status: SHIPPING_STATUS.READY_TO_SHIP,
    shipment: shipmentRecord,
  });

  return {
    success: true,
    shipment: shipmentRecord,
    message: `Shiprocket shipment created successfully (ID: ${providerResult.provider_shipment_id}).`,
  };
}

/**
 * Assign an AWB and courier service to a shipment.
 */
async function assignAWB(shipmentId, courierId = null) {
  const shipment = await getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment not found: ${shipmentId}`);

  if (shipment.awb_code) {
    return {
      success: true,
      already_assigned: true,
      awb_code: shipment.awb_code,
      courier_name: shipment.courier_name,
      message: `AWB ${shipment.awb_code} already assigned to this shipment.`,
      shipment,
    };
  }

  const provider = getShippingProvider(shipment.provider);
  const awbResult = await provider.assignAwb({
    provider_shipment_id: shipment.provider_shipment_id,
    courier_id: courierId || shipment.courier_company_id,
  });

  const trackingUrl = `https://shiprocket.co/tracking/${encodeURIComponent(awbResult.awb_code)}`;

  // Update in DB and memory
  shipment.awb_code = awbResult.awb_code;
  shipment.courier_name = awbResult.courier_name;
  shipment.courier_company_id = awbResult.courier_company_id;
  shipment.status = SHIPPING_STATUS.AWB_ASSIGNED;
  shipment.shipment_status = SHIPPING_STATUS.AWB_ASSIGNED;
  shipment.tracking_url = trackingUrl;
  shipment.updated_at = new Date().toISOString();

  inMemoryShipments.set(shipment.id, shipment);

  try {
    await safeQuery(() =>
      supabase
        .from('shipping_shipments')
        .update({
          awb_code: awbResult.awb_code,
          courier_name: awbResult.courier_name,
          courier_company_id: awbResult.courier_company_id,
          status: SHIPPING_STATUS.AWB_ASSIGNED,
          shipment_status: SHIPPING_STATUS.AWB_ASSIGNED,
          tracking_url: trackingUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', shipment.id)
    );

    await safeQuery(() =>
      supabase
        .from('orders')
        .update({
          awb_code: awbResult.awb_code,
          courier_name: awbResult.courier_name,
          shipping_status: SHIPPING_STATUS.AWB_ASSIGNED,
          tracking_url: trackingUrl,
        })
        .eq('id', shipment.order_id)
    );
  } catch (e) {}

  broadcastSync('SHIPMENT_UPDATED', {
    action: 'awb_assigned',
    shipment_id: shipment.id,
    order_id: shipment.order_id,
    awb_code: awbResult.awb_code,
    courier_name: awbResult.courier_name,
    status: SHIPPING_STATUS.AWB_ASSIGNED,
  });

  // Non-blocking WhatsApp dispatch notification to customer
  whatsappService
    .sendShippingDispatchWhatsApp({ orderId: shipment.order_id, shipment })
    .catch((err) => console.warn('⚠️ [Shipping] WhatsApp notify error:', err.message));

  return {
    success: true,
    shipment,
    awb_code: awbResult.awb_code,
    courier_name: awbResult.courier_name,
    message: `AWB ${awbResult.awb_code} assigned via ${awbResult.courier_name}.`,
  };
}

/**
 * Schedule pickup for an AWB-assigned shipment.
 */
async function schedulePickup(shipmentId, pickupDate = null) {
  const shipment = await getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment not found: ${shipmentId}`);

  const provider = getShippingProvider(shipment.provider);
  const pickupResult = await provider.schedulePickup({
    provider_shipment_id: shipment.provider_shipment_id,
    pickup_date: pickupDate,
  });

  shipment.status = SHIPPING_STATUS.PICKUP_SCHEDULED;
  shipment.shipment_status = SHIPPING_STATUS.PICKUP_SCHEDULED;
  shipment.pickup_scheduled_at = new Date().toISOString();
  shipment.updated_at = new Date().toISOString();

  inMemoryShipments.set(shipment.id, shipment);

  try {
    await safeQuery(() =>
      supabase
        .from('shipping_shipments')
        .update({
          status: SHIPPING_STATUS.PICKUP_SCHEDULED,
          shipment_status: SHIPPING_STATUS.PICKUP_SCHEDULED,
          pickup_scheduled_at: shipment.pickup_scheduled_at,
          updated_at: new Date().toISOString(),
        })
        .eq('id', shipment.id)
    );

    await safeQuery(() =>
      supabase
        .from('orders')
        .update({
          shipping_status: SHIPPING_STATUS.PICKUP_SCHEDULED,
        })
        .eq('id', shipment.order_id)
    );
  } catch (e) {}

  broadcastSync('SHIPMENT_UPDATED', {
    action: 'pickup_scheduled',
    shipment_id: shipment.id,
    order_id: shipment.order_id,
    status: SHIPPING_STATUS.PICKUP_SCHEDULED,
  });

  return {
    success: true,
    shipment,
    pickup_details: pickupResult,
    message: `Pickup scheduled successfully for shipment ${shipment.id}.`,
  };
}

/**
 * Generate printable PDF shipping label URL.
 */
async function generateShippingLabel(shipmentId) {
  const shipment = await getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment not found: ${shipmentId}`);

  const provider = getShippingProvider(shipment.provider);
  const labelResult = await provider.generateLabel(shipment.provider_shipment_id);

  shipment.label_url = labelResult.label_url;
  inMemoryShipments.set(shipment.id, shipment);

  try {
    await safeQuery(() =>
      supabase
        .from('shipping_shipments')
        .update({ label_url: labelResult.label_url, updated_at: new Date().toISOString() })
        .eq('id', shipment.id)
    );
  } catch (e) {}

  return {
    success: true,
    label_url: labelResult.label_url,
    shipment_id: shipment.id,
  };
}

/**
 * Generate printable tax invoice URL.
 */
async function generateShippingInvoice(shipmentId) {
  const shipment = await getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment not found: ${shipmentId}`);

  const provider = getShippingProvider(shipment.provider);
  const invoiceResult = await provider.generateInvoice(shipment.provider_order_id);

  shipment.invoice_url = invoiceResult.invoice_url;
  inMemoryShipments.set(shipment.id, shipment);

  try {
    await safeQuery(() =>
      supabase
        .from('shipping_shipments')
        .update({ invoice_url: invoiceResult.invoice_url, updated_at: new Date().toISOString() })
        .eq('id', shipment.id)
    );
  } catch (e) {}

  return {
    success: true,
    invoice_url: invoiceResult.invoice_url,
    shipment_id: shipment.id,
  };
}


/**
 * Track shipment status and milestones.
 */
async function trackShipment(shipmentId) {
  const shipment = await getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment not found: ${shipmentId}`);

  const provider = getShippingProvider(shipment.provider);
  const tracking = await provider.trackShipment({
    awb_code: shipment.awb_code,
    provider_shipment_id: shipment.provider_shipment_id,
  });

  // Sync latest status to shipment record if changed
  if (tracking.normalized_status && tracking.normalized_status !== shipment.status) {
    shipment.status = tracking.normalized_status;
    shipment.shipment_status = tracking.normalized_status;
    shipment.last_tracking_update = new Date().toISOString();
    if (tracking.normalized_status === SHIPPING_STATUS.DELIVERED && !shipment.delivered_at) {
      shipment.delivered_at = new Date().toISOString();
    }
    inMemoryShipments.set(shipment.id, shipment);

    try {
      await safeQuery(() =>
        supabase
          .from('shipping_shipments')
          .update({
            status: tracking.normalized_status,
            shipment_status: tracking.normalized_status,
            delivered_at: shipment.delivered_at || null,
            last_tracking_update: new Date().toISOString(),
          })
          .eq('id', shipment.id)
      );

      await safeQuery(() =>
        supabase
          .from('orders')
          .update({
            shipping_status: tracking.normalized_status,
          })
          .eq('id', shipment.order_id)
      );

      if (tracking.normalized_status === SHIPPING_STATUS.DELIVERED) {
        await syncDeliveryMilestoneToOrder(shipment);
      }
    } catch (e) {}
  }

  return {
    ...tracking,
    shipment_id: shipment.id,
    order_id: shipment.order_id,
  };
}

/**
 * Fetch a shipment by its internal ID.
 */
async function getShipmentById(shipmentId) {
  if (!shipmentId) return null;

  if (inMemoryShipments.has(shipmentId)) {
    return inMemoryShipments.get(shipmentId);
  }

  const { data, error } = await safeQuery(() =>
    supabase
      .from('shipping_shipments')
      .select('*, orders(id, order_number, shipping_full_name, shipping_city, shipping_state, shipping_pincode, total_amount)')
      .eq('id', shipmentId)
      .maybeSingle()
  );

  if (!error && data) {
    inMemoryShipments.set(data.id, data);
    return data;
  }

  return null;
}

/**
 * Fetch a shipment by KalaStyle order ID.
 */
async function getShipmentByOrderId(orderId) {
  if (!orderId) return null;

  for (const shipment of inMemoryShipments.values()) {
    if (shipment.order_id === orderId) return shipment;
  }

  const { data, error } = await safeQuery(() =>
    supabase
      .from('shipping_shipments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .maybeSingle()
  );

  if (!error && data) {
    inMemoryShipments.set(data.id, data);
    return data;
  }

  return null;
}

/**
 * List shipments with filtering and pagination.
 */
async function getShipments({ status, search, limit = 50, offset = 0 } = {}) {
  try {
    let query = supabase
      .from('shipping_shipments')
      .select('*, orders(id, order_number, shipping_full_name, shipping_city, shipping_state, shipping_pincode, total_amount)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status && status !== 'all') {
      query = query.eq('status', status.toUpperCase());
    }

    const { data, error } = await safeQuery(() => query);
    if (!error && data && data.length > 0) {
      data.forEach((s) => inMemoryShipments.set(s.id, s));
      return data;
    }
  } catch (err) {}

  let list = Array.from(inMemoryShipments.values());
  if (status && status !== 'all') {
    list = list.filter((s) => s.status === status.toUpperCase());
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(
      (s) =>
        s.awb_code?.toLowerCase().includes(q) ||
        s.courier_name?.toLowerCase().includes(q) ||
        s.provider_shipment_id?.toLowerCase().includes(q)
    );
  }
  return list.slice(offset, offset + limit);
}

/**
 * Get aggregate shipping statistics for dashboard and AI reporting.
 */
async function getShippingStatistics() {
  const shipments = await getShipments({ limit: 200 });

  const stats = {
    total_shipments: shipments.length,
    pending: shipments.filter((s) => s.status === SHIPPING_STATUS.PENDING || s.status === SHIPPING_STATUS.READY_TO_SHIP).length,
    awb_assigned: shipments.filter((s) => s.status === SHIPPING_STATUS.AWB_ASSIGNED).length,
    pickup_scheduled: shipments.filter((s) => s.status === SHIPPING_STATUS.PICKUP_SCHEDULED).length,
    in_transit: shipments.filter((s) => s.status === SHIPPING_STATUS.IN_TRANSIT || s.status === SHIPPING_STATUS.PICKED_UP || s.status === SHIPPING_STATUS.SHIPPED).length,
    out_for_delivery: shipments.filter((s) => s.status === SHIPPING_STATUS.OUT_FOR_DELIVERY).length,
    delivered: shipments.filter((s) => s.status === SHIPPING_STATUS.DELIVERED).length,
    delayed: shipments.filter((s) => {
      if (!s.estimated_delivery_date || s.status === SHIPPING_STATUS.DELIVERED) return false;
      return new Date(s.estimated_delivery_date) < new Date();
    }).length,
    failed: shipments.filter((s) => s.status === SHIPPING_STATUS.FAILED).length,
    courier_distribution: {},
  };

  shipments.forEach((s) => {
    const courier = s.courier_name || 'Unassigned';
    stats.courier_distribution[courier] = (stats.courier_distribution[courier] || 0) + 1;
  });

  stats.provider_mode = getActiveProviderType();

  return stats;
}

/**
 * Detect delayed shipments needing operational attention.
 */
async function detectDelayedShipments() {
  const shipments = await getShipments({ limit: 100 });
  const now = new Date();

  return shipments.filter((s) => {
    if (s.status === SHIPPING_STATUS.DELIVERED || s.status === SHIPPING_STATUS.CANCELLED) return false;
    if (s.estimated_delivery_date && new Date(s.estimated_delivery_date) < now) {
      return true;
    }
    // Also flag shipments stuck without AWB for > 48 hours
    const created = new Date(s.created_at);
    if (!s.awb_code && now.getTime() - created.getTime() > 48 * 3600000) {
      return true;
    }
    return false;
  });
}

/**
 * Retry failed shipment operation.
 * CRITICAL: Re-checks payment guard and order validity before retry.
 */
async function retryFailedShipment(shipmentId) {
  const shipment = await getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment not found: ${shipmentId}`);

  // Re-verify order payment status and cancellation status during retry
  if (shipment.order_id) {
    const { data: order } = await safeQuery(() =>
      supabase.from('orders').select('*').eq('id', shipment.order_id).maybeSingle()
    );
    if (order) {
      const isCod = String(order.payment_method || '').toLowerCase().trim() === 'cod';
      const isPaid = ['paid', 'completed'].includes(String(order.payment_status || '').toLowerCase().trim());
      const isCancelled = ['cancelled', 'rejected'].includes(String(order.status || order.order_status || '').toLowerCase().trim());

      if (isCancelled) {
        throw new Error(`Cannot retry shipment for cancelled order ${order.order_number || shipment.order_id}.`);
      }
      if (!isCod && !isPaid) {
        throw new Error(`Shipment creation blocked because the prepaid order has not been payment-verified. Order ${order.order_number || shipment.order_id} has payment_status '${order.payment_status}'.`);
      }
    }
  }

  shipment.attempt_count = (shipment.attempt_count || 0) + 1;
  shipment.last_attempt_at = new Date().toISOString();
  shipment.shipping_error = null;

  if (!shipment.awb_code) {
    return assignAWB(shipmentId);
  }

  if (shipment.status === SHIPPING_STATUS.AWB_ASSIGNED) {
    return schedulePickup(shipmentId);
  }

  return trackShipment(shipmentId);
}

/**
 * Ingest and process Shiprocket webhook event idempotently.
 */
async function handleWebhook(payload) {
  const eventId = payload?.event_id || `${payload?.awb}_${payload?.current_status}_${Date.now()}`;

  // Idempotency check: prevent duplicate execution
  if (inMemoryWebhooks.has(eventId)) {
    return { success: true, duplicate: true, message: 'Event already processed.' };
  }
  inMemoryWebhooks.set(eventId, true);

  const awb = payload?.awb || payload?.awb_code;
  const rawStatus = payload?.current_status || payload?.status;

  if (awb) {
    const shipments = await getShipments({ search: awb });
    const target = shipments.find((s) => s.awb_code === awb);

    if (target) {
      const { normalizeShiprocketStatus } = require('./shippingConfig');
      const normalized = normalizeShiprocketStatus(rawStatus);

      target.status = normalized;
      target.shipment_status = normalized;
      target.updated_at = new Date().toISOString();
      if (normalized === SHIPPING_STATUS.DELIVERED && !target.delivered_at) {
        target.delivered_at = new Date().toISOString();
      }

      try {
        await safeQuery(() =>
          supabase
            .from('shipping_shipments')
            .update({
              status: normalized,
              shipment_status: normalized,
              delivered_at: target.delivered_at || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', target.id)
        );

        await safeQuery(() =>
          supabase
            .from('orders')
            .update({ shipping_status: normalized })
            .eq('id', target.order_id)
        );

        if (normalized === SHIPPING_STATUS.DELIVERED) {
          // Call the canonical delivery milestone sync (preserves cod_pending for COD orders)
          await syncDeliveryMilestoneToOrder(target.order_id, {
            awb_code: target.awb_code,
            courier: target.courier_name,
            delivered_at: target.delivered_at,
          });
        }

      } catch (e) {}

      broadcastSync('SHIPMENT_UPDATED', {
        action: 'webhook_status_update',
        shipment_id: target.id,
        order_id: target.order_id,
        awb,
        status: normalized,
      });
    }
  }

  return { success: true, processed: true };
}

/**
 * Sync a delivery milestone event to the master order record.
 * Decouples logistics delivery from payment collection (critical for COD).
 *
 * Rules:
 *  - COD orders: set order_status='delivered', shipping_status='DELIVERED'
 *                set payment_status='cod_collected' (NOT 'paid')
 *  - Prepaid:    set order_status='delivered', shipping_status='DELIVERED'
 *                payment_status stays 'paid' (already collected online)
 *
 * @param {string} orderId - UUID of the master order
 * @param {object} [options] - { awb_code, courier, delivered_at }
 * @returns {Promise<object>} Update result
 */
async function syncDeliveryMilestoneToOrder(orderId, options = {}) {
  if (!orderId) throw new Error('syncDeliveryMilestoneToOrder: orderId required');

  const { data: order, error: fetchErr } = await safeQuery(() =>
    supabase.from('orders').select('id, payment_method, payment_status, order_status, status').eq('id', orderId).single()
  );

  if (fetchErr || !order) {
    console.warn(`[shippingService] syncDeliveryMilestoneToOrder: order not found ${orderId}`);
    return { success: false, error: 'Order not found' };
  }

  const isCod = String(order.payment_method || '').toLowerCase().trim() === 'cod';
  const deliveredAt = options.delivered_at || new Date().toISOString();

  const updates = {
    shipping_status: SHIPPING_STATUS.DELIVERED,
    order_status: 'delivered',
    status: 'delivered',
    updated_at: deliveredAt,
  };

  // For COD orders: delivery milestone sets order_status='delivered' & shipping_status='DELIVERED',
  // but payment_status MUST REMAIN 'cod_pending'. It is NOT marked as collected or paid
  // until authorized collection confirmation occurs via confirmCODCollection().
  // For Prepaid orders: payment_status stays 'paid' (already collected online).
  if (isCod) {
    // Retain cod_pending (or whatever current valid COD status is, e.g. already confirmed paid)
    updates.payment_status = order.payment_status || 'cod_pending';
  }

  const { data: updated, error: updateErr } = await safeQuery(() =>
    supabase.from('orders').update(updates).eq('id', orderId).select().single()
  );

  if (updateErr) {
    console.error(`[shippingService] syncDeliveryMilestoneToOrder DB update error:`, updateErr.message);
    return { success: false, error: updateErr.message };
  }

  try {
    broadcastSync('ORDER_DELIVERED', {
      order_id: orderId,
      payment_method: order.payment_method,
      payment_status: updates.payment_status || order.payment_status,
      awb_code: options.awb_code,
      courier: options.courier,
      delivered_at: deliveredAt,
    });
  } catch (_) {}

  console.log(`[shippingService] ✅ Delivery milestone synced for order ${orderId} (COD=${isCod})`);
  return { success: true, order: updated };
}

module.exports = {
  checkServiceability,
  getShippingRates,
  createShipmentFromOrder,
  fulfillOrder: createShipmentFromOrder,
  assignAWB,
  schedulePickup,
  generateShippingLabel,
  generateShippingInvoice,
  trackShipment,
  getTracking: trackShipment,
  getShipments,
  getShipmentById,
  getShipmentByOrderId,
  getShippingStatistics,
  detectDelayedShipments,
  retryFailedShipment,
  handleWebhook,
  syncDeliveryMilestoneToOrder,
};
