/**
 * backend/routes/shipping.js
 * ─────────────────────────────────────────────────────────────────
 * Express routes for KalaStyle AI Shipping & Logistics.
 * Endpoints for serviceability, rate calculations, shipment creation,
 * AWB assignment, pickup scheduling, tracking, labels, invoices, manifests, and webhooks.
 *
 * Implements strict role-based access control, artisan data isolation,
 * IDOR protection, and webhook signature verification.
 */

const express = require('express');
const router = express.Router();
const shippingService = require('../services/shipping/shippingService');
const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const { protect, admin, artisanOrAdmin, optionalProtect } = require('../middleware/auth');

/**
 * Helper: Find order IDs containing products belonging to an artisan.
 */
async function getArtisanAllowedOrderIds(userId) {
  try {
    const { data: artisan } = await safeQuery(() =>
      supabase.from('artisan_profiles').select('id').eq('user_id', userId).maybeSingle()
    );

    const artisanId = artisan?.id;
    if (!artisanId) return [];

    const orderIdSet = new Set();

    const { data: items } = await safeQuery(() =>
      supabase.from('order_items').select('order_id').eq('artisan_id', artisanId)
    );
    (items || []).forEach((i) => {
      if (i.order_id) orderIdSet.add(i.order_id);
    });

    const { data: artOrders } = await safeQuery(() =>
      supabase.from('artisan_orders').select('order_id').eq('artisan_id', artisanId)
    );
    (artOrders || []).forEach((ao) => {
      if (ao.order_id) orderIdSet.add(ao.order_id);
    });

    return Array.from(orderIdSet);
  } catch (err) {
    console.error('❌ [Shipping Route] Error determining artisan order access:', err.message);
    return [];
  }
}

/**
 * Helper: Check if a user is authorized to view/manage a specific order's shipment.
 */
async function isAuthorizedForOrder(user, orderId) {
  if (user.role === 'admin') return true;

  const { data: order, error } = await safeQuery(() =>
    supabase.from('orders').select('id, user_id').eq('id', orderId).maybeSingle()
  );

  if (error || !order) return false;

  // Customer owns the order
  if (order.user_id === user.id) return true;

  // Artisan has items in this order
  if (user.role === 'artisan') {
    const allowed = await getArtisanAllowedOrderIds(user.id);
    return allowed.includes(orderId);
  }

  return false;
}

// ─── PUBLIC / CHECKOUT ENDPOINTS ─────────────────────────────────────────────

/**
 * POST /api/shipping/serviceability
 * Check PIN code delivery serviceability and available couriers.
 */
router.post('/serviceability', optionalProtect, async (req, res) => {
  try {
    const { delivery_postcode, pickup_postcode, weight, cod, declared_value } = req.body;
    if (!delivery_postcode) {
      return res.status(400).json({ error: 'delivery_postcode is required.' });
    }

    const result = await shippingService.checkServiceability({
      delivery_postcode,
      pickup_postcode,
      weight,
      cod,
      declared_value,
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Serviceability check failed.' });
  }
});

/**
 * POST /api/shipping/rates
 * Fetch courier rates and delivery estimates.
 */
router.post('/rates', optionalProtect, async (req, res) => {
  try {
    const result = await shippingService.getShippingRates(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to fetch shipping rates.' });
  }
});

// ─── AUTHENTICATED SHIPMENT QUERIES ──────────────────────────────────────────

/**
 * GET /api/shipping
 * List shipments with optional status or search filter.
 * Admin sees all platform shipments; Artisan sees ONLY their authorized orders.
 */
router.get('/', protect, artisanOrAdmin, async (req, res) => {
  try {
    const { status, search, limit, offset } = req.query;

    let allowedOrderIds = null;
    if (req.user.role === 'artisan') {
      allowedOrderIds = await getArtisanAllowedOrderIds(req.user.id);
    }

    const shipments = await shippingService.getShipments({
      status,
      search,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0,
      allowedOrderIds,
    });

    res.json(shipments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/shipping/statistics
 * Logistics and courier analytics summary.
 */
router.get('/statistics', protect, artisanOrAdmin, async (req, res) => {
  try {
    let allowedOrderIds = null;
    if (req.user.role === 'artisan') {
      allowedOrderIds = await getArtisanAllowedOrderIds(req.user.id);
    }

    const stats = await shippingService.getShippingStatistics(allowedOrderIds);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/shipping/delayed
 * Identify delayed or stalled shipments.
 */
router.get('/delayed', protect, admin, async (req, res) => {
  try {
    const delayed = await shippingService.detectDelayedShipments();
    res.json(delayed);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/shipping/order/:orderId
 * Fetch shipment associated with an order ID with strict ownership validation.
 */
router.get('/order/:orderId', protect, async (req, res) => {
  try {
    const { orderId } = req.params;

    const authorized = await isAuthorizedForOrder(req.user, orderId);
    if (!authorized) {
      return res.status(403).json({ error: 'Access denied: You are not authorized to view this shipment.' });
    }

    const shipment = await shippingService.getShipmentByOrderId(orderId);
    if (!shipment) {
      return res.status(404).json({ error: 'No shipment found for this order.' });
    }
    res.json(shipment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/shipping/:shipmentId
 * Fetch single shipment details with authorization check.
 */
router.get('/:shipmentId', protect, async (req, res) => {
  try {
    const shipment = await shippingService.getShipmentById(req.params.shipmentId);
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found.' });
    }

    const authorized = await isAuthorizedForOrder(req.user, shipment.order_id);
    if (!authorized) {
      return res.status(403).json({ error: 'Access denied: You are not authorized to view this shipment.' });
    }

    res.json(shipment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/shipping/:shipmentId/tracking
 * Track shipment progress in realtime.
 */
router.get('/:shipmentId/tracking', optionalProtect, async (req, res) => {
  try {
    const shipment = await shippingService.getShipmentById(req.params.shipmentId);
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found.' });
    }

    // If caller is authenticated, verify authorization
    if (req.user) {
      const authorized = await isAuthorizedForOrder(req.user, shipment.order_id);
      if (!authorized) {
        return res.status(403).json({ error: 'Access denied to this tracking timeline.' });
      }
    }

    const tracking = await shippingService.trackShipment(req.params.shipmentId);
    res.json(tracking);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Tracking information unavailable.' });
  }
});

// ─── FULFILLMENT ACTIONS ───────────────────────────────────────────────────

/**
 * POST /api/shipping/orders/:orderId/create
 * Create a new Shiprocket shipment for an order.
 */
router.post('/orders/:orderId/create', protect, artisanOrAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;

    const authorized = await isAuthorizedForOrder(req.user, orderId);
    if (!authorized) {
      return res.status(403).json({ error: 'Access denied: You are not authorized to create a shipment for this order.' });
    }

    const result = await shippingService.createShipmentFromOrder(orderId, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/shipping/:shipmentId/awb
 * Assign AWB tracking number to shipment (Admin only).
 */
router.post('/:shipmentId/awb', protect, admin, async (req, res) => {
  try {
    const { courier_id } = req.body;
    const result = await shippingService.assignAWB(req.params.shipmentId, courier_id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/shipping/:shipmentId/pickup
 * Schedule courier pickup (Admin only).
 */
router.post('/:shipmentId/pickup', protect, admin, async (req, res) => {
  try {
    const { pickup_date } = req.body;
    const result = await shippingService.schedulePickup(req.params.shipmentId, pickup_date);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/shipping/:shipmentId/label
 * Generate printable PDF shipping label (Admin only).
 */
router.post('/:shipmentId/label', protect, admin, async (req, res) => {
  try {
    const result = await shippingService.generateShippingLabel(req.params.shipmentId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/shipping/:shipmentId/invoice
 * Generate printable tax invoice (Admin only).
 */
router.post('/:shipmentId/invoice', protect, admin, async (req, res) => {
  try {
    const result = await shippingService.generateShippingInvoice(req.params.shipmentId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/shipping/:shipmentId/manifest
 * Generate printable courier manifest (Admin only).
 */
router.post('/:shipmentId/manifest', protect, admin, async (req, res) => {
  try {
    const result = await shippingService.generateShippingManifest(req.params.shipmentId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/shipping/:shipmentId/retry
 * Retry a failed shipment action (Admin only).
 */
router.post('/:shipmentId/retry', protect, admin, async (req, res) => {
  try {
    const result = await shippingService.retryFailedShipment(req.params.shipmentId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─── WEBHOOK INGESTION ───────────────────────────────────────────────────────

/**
 * POST /api/shipping/webhooks/shiprocket
 * Ingest Shiprocket realtime shipment status updates with strict signature verification & idempotency.
 */
router.post('/webhooks/shiprocket', async (req, res) => {
  try {
    const expectedSecret = (process.env.SHIPROCKET_WEBHOOK_SECRET || '').trim();

    // Strict validation: Reject missing secret when secret is configured
    if (expectedSecret && expectedSecret !== 'your_shiprocket_webhook_secret_here') {
      const incomingSecret = (req.headers['x-shiprocket-secret'] || req.headers['authorization'] || '').trim();
      if (!incomingSecret || incomingSecret !== expectedSecret) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid Shiprocket webhook secret.' });
      }
    }

    const result = await shippingService.handleWebhook(req.body);
    res.json(result);
  } catch (error) {
    console.error('❌ [Shipping Webhook] Error:', error.message);
    // Transient or server failures must return HTTP 500 to allow provider retry
    const isClientError = error.message?.includes('Invalid payload') || error.message?.includes('Missing event');
    const statusCode = isClientError ? 400 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

module.exports = router;
