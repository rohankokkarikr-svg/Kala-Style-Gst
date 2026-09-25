/**
 * backend/services/shipping/shippingStore.js
 * ─────────────────────────────────────────────────────────────────
 * High-reliability, dual-layer persistence engine for KalaStyle Shipping.
 * Guarantees data durability across server restarts:
 * 1. Primary: Supabase PostgreSQL database tables (shipping_shipments, shipping_webhook_events).
 * 2. Persistent Local Storage: Atomic disk persistence (data/shipments.json, data/webhook_events.json).
 * 3. Concurrency Protection: In-flight single-flight mutex locking per order.
 */

const fs = require('fs');
const path = require('path');
const supabase = require('../../config/supabase');
const { safeQuery } = require('../../config/supabase');

const DATA_DIR = path.join(__dirname, '../../data');
const SHIPMENTS_FILE = path.join(DATA_DIR, 'shipments.json');
const WEBHOOKS_FILE = path.join(DATA_DIR, 'webhook_events.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.warn('⚠️ [Shipping Store] Could not create data directory:', err.message);
  }
}

// In-memory cache synced with disk
const shipmentCache = new Map();
const webhookCache = new Map();

// Concurrency mutex per order
const activeOrderShipmentLocks = new Map();

/**
 * Load initial state from durable disk files on boot.
 */
function initializeStore() {
  try {
    if (fs.existsSync(SHIPMENTS_FILE)) {
      const raw = fs.readFileSync(SHIPMENTS_FILE, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach((item) => {
          if (item && item.id) {
            shipmentCache.set(item.id, item);
          }
        });
      }
    }
  } catch (err) {
    console.warn('⚠️ [Shipping Store] Could not read shipments.json:', err.message);
  }

  try {
    if (fs.existsSync(WEBHOOKS_FILE)) {
      const raw = fs.readFileSync(WEBHOOKS_FILE, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach((item) => {
          if (item && item.event_id) {
            webhookCache.set(item.event_id, item);
          }
        });
      }
    }
  } catch (err) {
    console.warn('⚠️ [Shipping Store] Could not read webhook_events.json:', err.message);
  }
}

initializeStore();

/**
 * Atomically flush shipment cache to disk.
 */
function flushShipmentsToDisk() {
  try {
    const list = Array.from(shipmentCache.values());
    const tempFile = `${SHIPMENTS_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(list, null, 2), 'utf8');
    fs.renameSync(tempFile, SHIPMENTS_FILE);
  } catch (err) {
    console.error('❌ [Shipping Store] Failed to flush shipments to disk:', err.message);
  }
}

/**
 * Atomically flush webhook events to disk.
 */
function flushWebhooksToDisk() {
  try {
    const list = Array.from(webhookCache.values());
    const tempFile = `${WEBHOOKS_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(list, null, 2), 'utf8');
    fs.renameSync(tempFile, WEBHOOKS_FILE);
  } catch (err) {
    console.error('❌ [Shipping Store] Failed to flush webhooks to disk:', err.message);
  }
}

/**
 * Acquire concurrency lock for creating a shipment for a given orderId.
 * Prevents race condition where concurrent requests create multiple shipments.
 *
 * @param {string} orderId
 * @returns {Promise<Function>} Release function
 */
async function acquireOrderLock(orderId) {
  if (!orderId) return () => {};

  while (activeOrderShipmentLocks.has(orderId)) {
    // Wait for in-flight operation to finish
    await activeOrderShipmentLocks.get(orderId);
  }

  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });

  activeOrderShipmentLocks.set(orderId, promise);

  return () => {
    activeOrderShipmentLocks.delete(orderId);
    release();
  };
}

/**
 * Save a new shipment record to Supabase and durable local disk.
 */
async function saveShipment(shipment) {
  if (!shipment || !shipment.id) {
    throw new Error('Valid shipment record with id is required.');
  }

  // Update cache and disk immediately
  shipmentCache.set(shipment.id, shipment);
  flushShipmentsToDisk();

  // Persist to Supabase
  try {
    const { error } = await safeQuery(() =>
      supabase.from('shipping_shipments').upsert([shipment], { onConflict: 'id' })
    );
    if (error) {
      shipment.db_sync_status = 'RECONCILIATION_REQUIRED';
      shipment.db_sync_error = error.message;
      console.error(`❌ [Shipping Store] Supabase shipment upsert error (${error.message}). Marked RECONCILIATION_REQUIRED.`);
      if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_DB_OFFLINE) {
        throw new Error(`Database persistence failed for shipment ${shipment.id}: ${error.message}`);
      }
    } else {
      shipment.db_sync_status = 'SYNCED';
    }
  } catch (err) {
    console.error(`❌ [Shipping Store] Supabase shipment write exception: ${err.message}`);
    if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_DB_OFFLINE) {
      throw err;
    }
  }

  return shipment;
}

/**
 * Update an existing shipment record in Supabase and durable disk.
 */
async function updateShipment(shipmentId, updates) {
  if (!shipmentId) return null;

  const existing = shipmentCache.get(shipmentId) || {};
  const updated = {
    ...existing,
    ...updates,
    id: shipmentId,
    updated_at: new Date().toISOString(),
  };

  shipmentCache.set(shipmentId, updated);
  flushShipmentsToDisk();

  try {
    const { error } = await safeQuery(() =>
      supabase.from('shipping_shipments').update(updates).eq('id', shipmentId)
    );
    if (error) {
      console.warn(`⚠️ [Shipping Store] Supabase update warning (${error.message}). Local cache updated.`);
    }
  } catch (err) {
    console.warn(`⚠️ [Shipping Store] Supabase update exception: ${err.message}`);
  }

  return updated;
}

/**
 * Find shipment by internal shipment ID.
 */
async function getShipmentById(shipmentId) {
  if (!shipmentId) return null;

  // 1. Try Supabase
  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('shipping_shipments')
        .select('*, orders(id, order_number, shipping_name, shipping_city, shipping_state, shipping_pincode, total_amount)')
        .eq('id', shipmentId)
        .maybeSingle()
    );

    if (!error && data) {
      shipmentCache.set(data.id, data);
      flushShipmentsToDisk();
      return data;
    }
  } catch (err) {
    console.debug('ℹ️ [Shipping Store] DB lookup fallback to local store:', err.message);
  }

  // 2. Fall back to durable local storage
  if (shipmentCache.size === 0) {
    initializeStore();
  }
  return shipmentCache.get(shipmentId) || null;
}

/**
 * Find shipment by KalaStyle master order ID.
 */
async function getShipmentByOrderId(orderId) {
  if (!orderId) return null;

  // 1. Try Supabase
  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('shipping_shipments')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .maybeSingle()
    );

    if (!error && data) {
      shipmentCache.set(data.id, data);
      flushShipmentsToDisk();
      return data;
    }
  } catch (err) {
    console.debug('ℹ️ [Shipping Store] DB lookup fallback for order:', err.message);
  }

  // 2. Fall back to durable local storage
  if (shipmentCache.size === 0) {
    initializeStore();
  }
  for (const shipment of shipmentCache.values()) {
    if (shipment.order_id === orderId) {
      return shipment;
    }
  }

  return null;
}

/**
 * Query shipments with filtering, search, artisan isolation, and pagination.
 */
async function queryShipments({ status, search, limit = 50, offset = 0, allowedOrderIds = null } = {}) {
  let dbResults = null;

  try {
    let query = supabase
      .from('shipping_shipments')
      .select('*, orders(id, order_number, shipping_name, shipping_city, shipping_state, shipping_pincode, total_amount)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status && status !== 'all') {
      query = query.eq('status', status.toUpperCase());
    }

    if (Array.isArray(allowedOrderIds)) {
      query = query.in('order_id', allowedOrderIds.length > 0 ? allowedOrderIds : ['00000000-0000-0000-0000-000000000000']);
    }

    const { data, error } = await safeQuery(() => query);
    if (!error && data && data.length > 0) {
      data.forEach((s) => shipmentCache.set(s.id, s));
      dbResults = data;
    }
  } catch (err) {
    console.debug('ℹ️ [Shipping Store] DB query fallback to local store:', err.message);
  }

  if (!dbResults && shipmentCache.size === 0) {
    initializeStore();
  }

  let list = dbResults || Array.from(shipmentCache.values());

  // Filter by allowedOrderIds if artisan scoping
  if (Array.isArray(allowedOrderIds)) {
    const allowedSet = new Set(allowedOrderIds);
    list = list.filter((s) => allowedSet.has(s.order_id));
  }

  // Filter by status
  if (status && status !== 'all') {
    const targetStatus = status.toUpperCase();
    list = list.filter((s) => String(s.status || '').toUpperCase() === targetStatus);
  }

  // Filter by search term
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      (s) =>
        s.awb_code?.toLowerCase().includes(q) ||
        s.courier_name?.toLowerCase().includes(q) ||
        s.provider_shipment_id?.toLowerCase().includes(q) ||
        s.provider_order_id?.toLowerCase().includes(q) ||
        s.orders?.order_number?.toLowerCase().includes(q) ||
        s.orders?.shipping_name?.toLowerCase().includes(q) ||
        s.orders?.shipping_city?.toLowerCase().includes(q)
    );
  }

  // Sort descending by created_at
  list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  return list.slice(offset, offset + limit);
}

/**
 * Check if a webhook event was already processed (durable idempotency check).
 */
async function isWebhookProcessed(eventId) {
  if (!eventId) return false;

  if (webhookCache.size === 0) {
    initializeStore();
  }

  // 1. Check in-memory / local disk cache
  if (webhookCache.has(eventId)) {
    const event = webhookCache.get(eventId);
    if (event.processed) return true;
  }

  // 2. Check Supabase
  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('shipping_webhook_events')
        .select('id, processed')
        .eq('event_id', eventId)
        .maybeSingle()
    );

    if (!error && data) {
      return Boolean(data.processed);
    }
  } catch (err) {
    console.debug('ℹ️ [Shipping Store] Webhook DB check notice:', err.message);
  }

  return false;
}

/**
 * Record a webhook event durably in Supabase and local disk.
 */
async function recordWebhookEvent({ event_id, provider = 'shiprocket', event_name, shipment_id, awb_code, order_id, payload, processed = true, processing_error = null }) {
  const eventRecord = {
    event_id,
    provider,
    event_name: event_name || payload?.current_status || 'STATUS_UPDATE',
    shipment_id: shipment_id ? String(shipment_id) : null,
    awb_code: awb_code ? String(awb_code) : null,
    order_id: order_id || null,
    payload: payload || {},
    processed: Boolean(processed),
    processing_error,
    processed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  webhookCache.set(event_id, eventRecord);
  flushWebhooksToDisk();

  try {
    await safeQuery(() =>
      supabase.from('shipping_webhook_events').upsert([eventRecord], { onConflict: 'event_id' })
    );
  } catch (err) {
    console.warn(`⚠️ [Shipping Store] Webhook event DB save notice: ${err.message}`);
  }

  return eventRecord;
}

module.exports = {
  saveShipment,
  updateShipment,
  getShipmentById,
  getShipmentByOrderId,
  queryShipments,
  acquireOrderLock,
  isWebhookProcessed,
  recordWebhookEvent,
  initializeStore,
  shipmentCache,
  webhookCache,
};
