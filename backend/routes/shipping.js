/**
 * backend/routes/shipping.js
 * ─────────────────────────────────────────────────────────────────
 * Express routes for KalaStyle AI Shipping & Logistics.
 * Endpoints for serviceability, rate calculations, shipment creation,
 * AWB assignment, pickup scheduling, tracking, labels, and webhooks.
 */

const express = require('express');
const router = express.Router();
const shippingService = require('../services/shipping/shippingService');
const { protect, admin, artisanOrAdmin, optionalProtect } = require('../middleware/auth');

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
 * List shipments with optional status or search filter (Admin/Artisan).
 */
router.get('/', protect, artisanOrAdmin, async (req, res) => {
  try {
    const { status, search, limit, offset } = req.query;
    const shipments = await shippingService.getShipments({
      status,
      search,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0,
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
router.get('/statistics', protect, admin, async (req, res) => {
  try {
    const stats = await shippingService.getShippingStatistics();
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
 * Fetch shipment associated with an order ID.
 */
router.get('/order/:orderId', protect, async (req, res) => {
  try {
    const shipment = await shippingService.getShipmentByOrderId(req.params.orderId);
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
 * Fetch single shipment details.
 */
router.get('/:shipmentId', protect, async (req, res) => {
  try {
    const shipment = await shippingService.getShipmentById(req.params.shipmentId);
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found.' });
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
    const tracking = await shippingService.trackShipment(req.params.shipmentId);
    res.json(tracking);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Tracking information unavailable.' });
  }
});

// ─── ADMIN FULFILLMENT ACTIONS ───────────────────────────────────────────────

/**
 * POST /api/shipping/orders/:orderId/create
 * Create a new Shiprocket shipment for an order.
 */
router.post('/orders/:orderId/create', protect, artisanOrAdmin, async (req, res) => {
  try {
    const result = await shippingService.createShipmentFromOrder(req.params.orderId, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/shipping/:shipmentId/awb
 * Assign AWB tracking number to shipment.
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
 * Schedule courier pickup.
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
 * Generate printable PDF shipping label.
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
 * Generate printable tax invoice.
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
 * POST /api/shipping/:shipmentId/retry
 * Retry a failed shipment action.
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
 * Ingest Shiprocket realtime shipment status updates with idempotency.
 */
router.post('/webhooks/shiprocket', async (req, res) => {
  try {
    // Basic secret header check if configured
    const expectedSecret = process.env.SHIPROCKET_WEBHOOK_SECRET;
    const incomingSecret = req.headers['x-shiprocket-secret'] || req.headers['authorization'];
    if (expectedSecret && incomingSecret && incomingSecret !== expectedSecret) {
      return res.status(401).json({ error: 'Invalid webhook signature or secret.' });
    }

    const result = await shippingService.handleWebhook(req.body);
    res.json(result);
  } catch (error) {
    console.error('❌ [Shipping Webhook] Error:', error.message);
    // Return 200 to prevent provider retry floods on format anomalies
    res.status(200).json({ success: false, error: error.message });
  }
});

module.exports = router;
