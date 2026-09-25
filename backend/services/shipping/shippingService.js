/**
 * backend/services/shipping/shippingService.js
 * ─────────────────────────────────────────────────────────────────
 * Core Logistics & Shipping Service for KalaStyle AI.
 * Orchestrates order fulfillment, packaging calculations, courier dispatch,
 * AWB generation, pickup scheduling, tracking, manifests, and multi-channel notifications.
 *
 * Fully integrated with:
 * - Shiprocket production logistics API & sandbox mock engine
 * - Dual-layer persistence (Supabase PostgreSQL + atomic disk storage)
 * - Strict idempotency & single-flight concurrency mutex locking
 * - State machine transition validation
 * - Secure artisan & customer access boundaries
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
  getDefaultPickupPin,
  getActiveProviderType,
  isValidShippingTransition,
  normalizeShiprocketStatus,
} = require('./shippingConfig');
const shippingStore = require('./shippingStore');

/**
 * Check delivery serviceability and rates for customer PIN code.
 */
async function checkServiceability({ pickup_postcode, delivery_postcode, weight, cod = false, declared_value = 0 }) {
  const provider = getShippingProvider();
  return provider.checkServiceability({
    pickup_postcode: pickup_postcode || getDefaultPickupPin(),
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
 * Strictly prevents duplicate shipment creation with concurrency mutex lock.
 *
 * @param {string|object} orderIdOrData UUID of the order or pre-loaded order object
 * @param {object} [options] Custom overrides (dimensions, weight, pickup location, artisan_id)
 * @returns {Promise<object>} Standardized created shipment record
 */
async function createShipmentFromOrder(orderIdOrData, options = {}) {
  const orderId = typeof orderIdOrData === 'object' && orderIdOrData !== null ? orderIdOrData.id : orderIdOrData;
  if (!orderId) {
    throw new Error('order_id is required to create a shipment.');
  }

  // Concurrency Lock: Prevents race conditions from parallel requests (double-clicks, callbacks)
  const releaseLock = await shippingStore.acquireOrderLock(orderId);

  try {
    // 1. Check if a shipment already exists for this order (IDEMPOTENCY CHECK)
    const existingShipment = await shippingStore.getShipmentByOrderId(orderId);
    if (existingShipment && !options.force_recreate) {
      console.log(`ℹ️ [Shipping Service] Shipment already exists for order ${orderId}: ${existingShipment.id}`);
      return {
        success: true,
        already_exists: true,
        shipment: existingShipment,
        message: `Shipment already exists for this order (AWB: ${existingShipment.awb_code || 'Pending'}).`,
      };
    }

    // 2. Fetch order with customer details
    let order = typeof orderIdOrData === 'object' && orderIdOrData !== null && (orderIdOrData.id || orderIdOrData.items || orderIdOrData.order_number) ? orderIdOrData : null;
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
    // - Prepaid orders MUST have payment_status === 'paid' or 'completed'.
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
          `Shipment creation blocked because prepaid order has not been payment-verified. Order ${order.order_number || orderId} has payment_status '${order.payment_status}'.`
        );
      }
    }

    // 4. Validate shipping destination address fields
    const shippingAddress = order.shipping_address;
    const shippingPincode = String(order.shipping_pincode || '').trim();
    const customerPhone = String(order.phone || order.shipping_phone || order.users?.phone || '').trim();
    const customerName = order.shipping_name || order.shipping_full_name || order.users?.name || 'Customer';

    if (!shippingAddress) {
      throw new Error(`Cannot ship order ${order.order_number || orderId}: Missing shipping delivery address.`);
    }
    if (!shippingPincode || shippingPincode.length < 6) {
      throw new Error(`Cannot ship order ${order.order_number || orderId}: Invalid postal PIN code '${shippingPincode}'.`);
    }
    if (!customerPhone) {
      throw new Error(`Cannot ship order ${order.order_number || orderId}: Customer contact phone number is required.`);
    }

    // 5. Fetch REAL order items (DO NOT request non-existent columns like weight/dimensions on products)
    let orderItems = Array.isArray(order.items) && order.items.length > 0 ? order.items : null;
    if (!orderItems) {
      const { data: items, error: itemsErr } = await safeQuery(() =>
        supabase
          .from('order_items')
          .select('id, order_id, product_id, quantity, price_at_time, size, artisan_id, product_name_snapshot, unit_price_snapshot, total_price, products(id, name, price, artisan_id)')
          .eq('order_id', orderId)
      );

      if (itemsErr) {
        console.error('❌ [Shipping Service] Error loading order items:', itemsErr.message);
      }

      orderItems = items || [];
    }

    // Strict validation: Do NOT silently substitute fake items if order items are missing
    if (!orderItems || orderItems.length === 0) {
      throw new Error(`Cannot create shipment for order ${order.order_number || orderId}: Order contains no items.`);
    }

    // Filter by specific artisan if artisan sub-order fulfillment requested
    if (options.artisan_id) {
      orderItems = orderItems.filter((item) => (item.artisan_id || item.products?.artisan_id) === options.artisan_id);
      if (orderItems.length === 0) {
        throw new Error(`No items found for artisan ${options.artisan_id} in order ${order.order_number || orderId}.`);
      }
    }

    // 6. Calculate package weight & dimensions using safe defaults
    let calculatedWeight = 0;
    for (const item of orderItems) {
      const qty = parseInt(item.quantity, 10) || 1;
      calculatedWeight += (getDefaultWeight() / Math.max(1, orderItems.length)) * qty;
    }
    const packageWeight = Math.max(0.1, options.weight || calculatedWeight || getDefaultWeight());

    // 7. Determine pickup location
    let pickupLocation = options.pickup_location || getDefaultPickupLocation();
    const primaryArtisanId = options.artisan_id || orderItems[0]?.artisan_id || orderItems[0]?.products?.artisan_id;

    if (primaryArtisanId && !options.pickup_location) {
      try {
        const { data: artisan } = await safeQuery(() =>
          supabase
            .from('artisan_profiles')
            .select('pickup_location, store_name')
            .eq('id', primaryArtisanId)
            .maybeSingle()
        );
        if (artisan?.pickup_location) {
          pickupLocation = artisan.pickup_location;
        }
      } catch (err) {
        console.warn('⚠️ [Shipping Service] Could not fetch artisan pickup profile:', err.message);
      }
    }

    // 8. Call Shipping Provider Adapter (Shiprocket or Mock)
    const provider = getShippingProvider(options.provider);
    const providerResult = await provider.createOrder({
      order_id: order.id,
      order_number: order.order_number || `KS-${order.id.slice(0, 8).toUpperCase()}`,
      order_date: order.created_at || new Date().toISOString(),
      pickup_location: pickupLocation,
      billing_customer_name: customerName,
      billing_address: shippingAddress,
      billing_city: order.shipping_city || 'City',
      billing_pincode: shippingPincode,
      billing_state: order.shipping_state || 'Karnataka',
      billing_phone: customerPhone,
      billing_email: order.users?.email || 'order@kalastyle.com',
      payment_method: isCod ? 'COD' : 'Prepaid',
      subtotal: parseFloat(order.total_amount || order.subtotal || 100),
      order_items: orderItems.map((item, idx) => ({
        name: item.product_name_snapshot || item.products?.name || `Craft Product ${idx + 1}`,
        sku: item.product_id ? `SKU-${item.product_id.slice(0, 8)}` : `SKU-${idx + 1}`,
        units: parseInt(item.quantity, 10) || 1,
        selling_price: parseFloat(item.unit_price_snapshot || item.price_at_time || item.products?.price) || 100,
      })),
      weight: packageWeight,
      length: options.length || getDefaultLength(),
      breadth: options.breadth || getDefaultBreadth(),
      height: options.height || getDefaultHeight(),
    });

    // 9. Construct normalized shipment record
    const shipmentId = uuidv4();
    const shipmentRecord = {
      id: shipmentId,
      order_id: order.id,
      artisan_id: primaryArtisanId || null,
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
      manifest_url: null,
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

    // 10. Persist durably via shippingStore
    await shippingStore.saveShipment(shipmentRecord);

    // 11. Update master order record
    try {
      const orderUpdates = {
        shipment_id: shipmentId,
        shipping_status: SHIPPING_STATUS.READY_TO_SHIP,
      };
      if (order.status === 'pending') {
        orderUpdates.status = 'confirmed';
        orderUpdates.order_status = 'confirmed';
      }
      await safeQuery(() =>
        supabase.from('orders').update(orderUpdates).eq('id', order.id)
      );
    } catch (orderUpdateErr) {
      console.error('❌ [Shipping Service] Order update failed after shipment creation:', orderUpdateErr.message);
    }

    // 12. Broadcast realtime event
    try {
      broadcastSync('SHIPMENT_UPDATED', {
        action: 'created',
        order_id: order.id,
        shipment_id: shipmentId,
        status: SHIPPING_STATUS.READY_TO_SHIP,
        shipment: shipmentRecord,
      });
    } catch (bErr) {
      console.debug('Realtime broadcast notice:', bErr.message);
    }

    return {
      success: true,
      shipment: shipmentRecord,
      message: `Shipment registered successfully (ID: ${providerResult.provider_shipment_id || shipmentId}).`,
    };
  } finally {
    releaseLock();
  }
}

/**
 * Assign an AWB and courier service to a shipment with state transition guard.
 */
async function assignAWB(shipmentId, courierId = null) {
  const shipment = await shippingStore.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment not found: ${shipmentId}`);

  // Idempotency: if already assigned, return existing assignment
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

  // Validate state transition
  if (!isValidShippingTransition(shipment.status, SHIPPING_STATUS.AWB_ASSIGNED)) {
    throw new Error(`Invalid status transition from '${shipment.status}' to 'AWB_ASSIGNED'.`);
  }

  const provider = getShippingProvider(shipment.provider);
  const awbResult = await provider.assignAwb({
    provider_shipment_id: shipment.provider_shipment_id,
    courier_id: courierId || shipment.courier_company_id,
  });

  const trackingUrl = `https://shiprocket.co/tracking/${encodeURIComponent(awbResult.awb_code)}`;

  const updates = {
    awb_code: awbResult.awb_code,
    courier_name: awbResult.courier_name,
    courier_company_id: awbResult.courier_company_id,
    status: SHIPPING_STATUS.AWB_ASSIGNED,
    shipment_status: SHIPPING_STATUS.AWB_ASSIGNED,
    tracking_url: trackingUrl,
  };

  const updatedShipment = await shippingStore.updateShipment(shipment.id, updates);

  // Update order record
  try {
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
  } catch (err) {
    console.error('❌ [Shipping Service] Order AWB update notice:', err.message);
  }

  try {
    broadcastSync('SHIPMENT_UPDATED', {
      action: 'awb_assigned',
      shipment_id: shipment.id,
      order_id: shipment.order_id,
      awb_code: awbResult.awb_code,
      courier_name: awbResult.courier_name,
      status: SHIPPING_STATUS.AWB_ASSIGNED,
    });
  } catch (bErr) {
    console.debug('Realtime broadcast notice:', bErr.message);
  }

  // Non-blocking WhatsApp dispatch notification
  whatsappService
    .sendShippingDispatchWhatsApp({ orderId: shipment.order_id, shipment: updatedShipment })
    .catch((err) => console.warn('⚠️ [Shipping] WhatsApp notify error:', err.message));

  return {
    success: true,
    shipment: updatedShipment,
    awb_code: awbResult.awb_code,
    courier_name: awbResult.courier_name,
    message: `AWB ${awbResult.awb_code} assigned via ${awbResult.courier_name}.`,
  };
}

/**
 * Schedule pickup for an AWB-assigned shipment with state transition guard.
 */
async function schedulePickup(shipmentId, pickupDate = null) {
  const shipment = await shippingStore.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment not found: ${shipmentId}`);

  // State machine guard: pickup requires AWB
  if (!shipment.awb_code) {
    throw new Error('Cannot schedule pickup: AWB tracking number must be assigned first.');
  }

  if (!isValidShippingTransition(shipment.status, SHIPPING_STATUS.PICKUP_SCHEDULED)) {
    throw new Error(`Invalid status transition from '${shipment.status}' to 'PICKUP_SCHEDULED'.`);
  }

  const provider = getShippingProvider(shipment.provider);
  const pickupResult = await provider.schedulePickup({
    provider_shipment_id: shipment.provider_shipment_id,
    pickup_date: pickupDate,
  });

  const pickupScheduledAt = new Date().toISOString();
  const updates = {
    status: SHIPPING_STATUS.PICKUP_SCHEDULED,
    shipment_status: SHIPPING_STATUS.PICKUP_SCHEDULED,
    pickup_scheduled_at: pickupScheduledAt,
  };

  const updatedShipment = await shippingStore.updateShipment(shipment.id, updates);

  try {
    await safeQuery(() =>
      supabase
        .from('orders')
        .update({ shipping_status: SHIPPING_STATUS.PICKUP_SCHEDULED })
        .eq('id', shipment.order_id)
    );
  } catch (err) {
    console.error('❌ [Shipping Service] Order pickup status update notice:', err.message);
  }

  try {
    broadcastSync('SHIPMENT_UPDATED', {
      action: 'pickup_scheduled',
      shipment_id: shipment.id,
      order_id: shipment.order_id,
      status: SHIPPING_STATUS.PICKUP_SCHEDULED,
    });
  } catch (bErr) {
    console.debug('Realtime broadcast notice:', bErr.message);
  }

  return {
    success: true,
    shipment: updatedShipment,
    pickup_details: pickupResult,
    message: `Pickup scheduled successfully for shipment ${shipment.id}.`,
  };
}

/**
 * Generate printable PDF shipping label URL.
 */
async function generateShippingLabel(shipmentId) {
  const shipment = await shippingStore.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment not found: ${shipmentId}`);

  const provider = getShippingProvider(shipment.provider);
  const labelResult = await provider.generateLabel(shipment.provider_shipment_id);

  await shippingStore.updateShipment(shipment.id, { label_url: labelResult.label_url });

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
  const shipment = await shippingStore.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment not found: ${shipmentId}`);

  const provider = getShippingProvider(shipment.provider);
  const invoiceResult = await provider.generateInvoice(shipment.provider_order_id);

  await shippingStore.updateShipment(shipment.id, { invoice_url: invoiceResult.invoice_url });

  return {
    success: true,
    invoice_url: invoiceResult.invoice_url,
    shipment_id: shipment.id,
  };
}

/**
 * Generate printable manifest URL for shipments.
 */
async function generateShippingManifest(shipmentId) {
  const shipment = await shippingStore.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment not found: ${shipmentId}`);

  const provider = getShippingProvider(shipment.provider);
  const manifestResult = await provider.generateManifest(shipment.provider_shipment_id);

  await shippingStore.updateShipment(shipment.id, { manifest_url: manifestResult.manifest_url });

  return {
    success: true,
    manifest_url: manifestResult.manifest_url,
    shipment_id: shipment.id,
  };
}

/**
 * Track shipment status and sync delivery milestones.
 * FIX: Passes order_id (string) to syncDeliveryMilestoneToOrder.
 */
async function trackShipment(shipmentId) {
  const shipment = await shippingStore.getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment not found: ${shipmentId}`);

  const provider = getShippingProvider(shipment.provider);
  const tracking = await provider.trackShipment({
    awb_code: shipment.awb_code,
    provider_shipment_id: shipment.provider_shipment_id,
  });

  // Check state machine transition
  if (tracking.normalized_status && tracking.normalized_status !== shipment.status) {
    if (isValidShippingTransition(shipment.status, tracking.normalized_status)) {
      const updates = {
        status: tracking.normalized_status,
        shipment_status: tracking.normalized_status,
        last_tracking_update: new Date().toISOString(),
      };

      if (tracking.normalized_status === SHIPPING_STATUS.DELIVERED && !shipment.delivered_at) {
        updates.delivered_at = new Date().toISOString();
      }

      await shippingStore.updateShipment(shipment.id, updates);

      try {
        await safeQuery(() =>
          supabase
            .from('orders')
            .update({ shipping_status: tracking.normalized_status })
            .eq('id', shipment.order_id)
        );
      } catch (err) {
        console.error('❌ [Shipping Service] Order tracking status update notice:', err.message);
      }

      // CRITICAL FIX: Pass shipment.order_id (string), NOT the full shipment object!
      if (tracking.normalized_status === SHIPPING_STATUS.DELIVERED) {
        await syncDeliveryMilestoneToOrder(shipment.order_id, {
          awb_code: shipment.awb_code,
          courier: shipment.courier_name,
          delivered_at: updates.delivered_at || new Date().toISOString(),
        });
      }
    } else {
      console.warn(
        `⚠️ [Shipping Service] Discarding invalid tracking transition from ${shipment.status} to ${tracking.normalized_status}`
      );
    }
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
  return shippingStore.getShipmentById(shipmentId);
}

/**
 * Fetch a shipment by KalaStyle order ID.
 */
async function getShipmentByOrderId(orderId) {
  return shippingStore.getShipmentByOrderId(orderId);
}

/**
 * List shipments with filtering and pagination.
 */
async function getShipments({ status, search, limit = 50, offset = 0, allowedOrderIds = null } = {}) {
  return shippingStore.queryShipments({ status, search, limit, offset, allowedOrderIds });
}

/**
 * Get aggregate shipping statistics for dashboard and AI reporting.
 */
async function getShippingStatistics(allowedOrderIds = null) {
  const shipments = await getShipments({ limit: 500, allowedOrderIds });

  const stats = {
    total_shipments: shipments.length,
    pending: shipments.filter((s) => s.status === SHIPPING_STATUS.PENDING || s.status === SHIPPING_STATUS.READY_TO_SHIP).length,
    awb_assigned: shipments.filter((s) => s.status === SHIPPING_STATUS.AWB_ASSIGNED).length,
    pickup_scheduled: shipments.filter((s) => s.status === SHIPPING_STATUS.PICKUP_SCHEDULED).length,
    in_transit: shipments.filter(
      (s) =>
        s.status === SHIPPING_STATUS.IN_TRANSIT ||
        s.status === SHIPPING_STATUS.PICKED_UP ||
        s.status === SHIPPING_STATUS.SHIPPED
    ).length,
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
async function detectDelayedShipments(allowedOrderIds = null) {
  const shipments = await getShipments({ limit: 100, allowedOrderIds });
  const now = new Date();

  return shipments.filter((s) => {
    if (s.status === SHIPPING_STATUS.DELIVERED || s.status === SHIPPING_STATUS.CANCELLED) return false;
    if (s.estimated_delivery_date && new Date(s.estimated_delivery_date) < now) {
      return true;
    }
    // Flag shipments stuck without AWB for > 48 hours
    const created = new Date(s.created_at);
    if (!s.awb_code && now.getTime() - created.getTime() > 48 * 3600000) {
      return true;
    }
    return false;
  });
}

/**
 * Retry failed shipment operation safely without creating duplicates.
 */
async function retryFailedShipment(shipmentId) {
  const shipment = await shippingStore.getShipmentById(shipmentId);
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
        throw new Error(`Shipment retry blocked: Order has not been payment-verified.`);
      }
    }
  }

  await shippingStore.updateShipment(shipment.id, {
    attempt_count: (shipment.attempt_count || 0) + 1,
    last_attempt_at: new Date().toISOString(),
    shipping_error: null,
  });

  if (!shipment.awb_code) {
    return assignAWB(shipmentId);
  }

  if (shipment.status === SHIPPING_STATUS.AWB_ASSIGNED) {
    return schedulePickup(shipmentId);
  }

  return trackShipment(shipmentId);
}

/**
 * Ingest and process Shiprocket webhook event idempotently with durable logging.
 */
async function handleWebhook(payload) {
  const awb = payload?.awb || payload?.awb_code;
  const rawStatus = payload?.current_status || payload?.status;
  const eventId = String(payload?.event_id || `${awb || 'no_awb'}_${rawStatus || 'no_status'}_${payload?.order_id || 'no_ord'}`);

  // Idempotency check: prevent duplicate execution
  const isDuplicate = await shippingStore.isWebhookProcessed(eventId);
  if (isDuplicate) {
    return { success: true, duplicate: true, message: 'Event already processed.' };
  }

  let targetShipment = null;
  if (awb) {
    const shipments = await shippingStore.queryShipments({ search: awb, limit: 10 });
    targetShipment = shipments.find((s) => s.awb_code === awb);
  }

  if (targetShipment && rawStatus) {
    const normalized = normalizeShiprocketStatus(rawStatus);

    if (isValidShippingTransition(targetShipment.status, normalized)) {
      const updates = {
        status: normalized,
        shipment_status: normalized,
        updated_at: new Date().toISOString(),
      };
      if (normalized === SHIPPING_STATUS.DELIVERED && !targetShipment.delivered_at) {
        updates.delivered_at = new Date().toISOString();
      }

      await shippingStore.updateShipment(targetShipment.id, updates);

      try {
        await safeQuery(() =>
          supabase
            .from('orders')
            .update({ shipping_status: normalized })
            .eq('id', targetShipment.order_id)
        );
      } catch (err) {
        console.error('❌ [Shipping Webhook] Order status update failed:', err.message);
      }

      if (normalized === SHIPPING_STATUS.DELIVERED) {
        await syncDeliveryMilestoneToOrder(targetShipment.order_id, {
          awb_code: targetShipment.awb_code,
          courier: targetShipment.courier_name,
          delivered_at: updates.delivered_at || new Date().toISOString(),
        });
      }

      try {
        broadcastSync('SHIPMENT_UPDATED', {
          action: 'webhook_status_update',
          shipment_id: targetShipment.id,
          order_id: targetShipment.order_id,
          awb,
          status: normalized,
        });
        try {
          const { emitEvent } = require('../../ai/aiEventBus');
          emitEvent('SHIPMENT_STATUS_CHANGED', 'shipment', targetShipment.id, {
            status: normalized,
            awb,
            order_id: targetShipment.order_id,
          });
          if (normalized === 'DELAYED' || normalized === 'RTO_INITIATED' || normalized === 'FAILED') {
            emitEvent('SHIPMENT_DELAYED', 'shipment', targetShipment.id, {
              status: normalized,
              awb,
              order_id: targetShipment.order_id,
            });
          }
        } catch (evErr) {}
      } catch (bErr) {
        console.debug('Realtime broadcast notice:', bErr.message);
      }
    } else {
      console.warn(`⚠️ [Shipping Webhook] Ignored invalid state transition: ${targetShipment.status} -> ${normalized}`);
    }
  }

  // Record event in durable store
  await shippingStore.recordWebhookEvent({
    event_id: eventId,
    event_name: rawStatus,
    shipment_id: targetShipment?.id || null,
    awb_code: awb || null,
    order_id: targetShipment?.order_id || null,
    payload,
    processed: true,
  });

  return { success: true, processed: true };
}

/**
 * Sync a delivery milestone event to the master order record.
 * Decouples logistics delivery from payment collection (critical for COD).
 *
 * @param {string} orderId - UUID of the master order
 * @param {object} [options] - { awb_code, courier, delivered_at }
 * @returns {Promise<object>} Update result
 */
async function syncDeliveryMilestoneToOrder(orderId, options = {}) {
  if (!orderId || typeof orderId !== 'string') {
    throw new Error('syncDeliveryMilestoneToOrder: valid orderId string required');
  }

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

  // For COD orders: retain cod_pending until confirmed via cash collection verification
  if (isCod) {
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
  } catch (bErr) {
    console.debug('Realtime broadcast notice:', bErr.message);
  }

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
  generateShippingManifest,
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
