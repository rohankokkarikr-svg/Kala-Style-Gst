/**
 * backend/services/shipping/shippingConfig.js
 * ─────────────────────────────────────────────────────────────────
 * Centralized configuration, defaults, and status mappings for
 * KalaStyle AI Shipping & Logistics Engine.
 */

const SHIPPING_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  READY_TO_SHIP: 'READY_TO_SHIP',
  AWB_ASSIGNED: 'AWB_ASSIGNED',
  PICKUP_SCHEDULED: 'PICKUP_SCHEDULED',
  PICKED_UP: 'PICKED_UP',
  SHIPPED: 'SHIPPED',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RETURNED: 'RETURNED',
  FAILED: 'FAILED',
};

// Map Shiprocket provider statuses to standardized KalaStyle shipping statuses
const SHIPROCKET_STATUS_MAP = {
  'NEW': SHIPPING_STATUS.READY_TO_SHIP,
  'NA': SHIPPING_STATUS.READY_TO_SHIP,
  'AWB ASSIGNED': SHIPPING_STATUS.AWB_ASSIGNED,
  'LABEL GENERATED': SHIPPING_STATUS.AWB_ASSIGNED,
  'PICKUP SCHEDULED': SHIPPING_STATUS.PICKUP_SCHEDULED,
  'PICKUP RESCHEDULED': SHIPPING_STATUS.PICKUP_SCHEDULED,
  'PICKUP QUEUED': SHIPPING_STATUS.PICKUP_SCHEDULED,
  'PICKED UP': SHIPPING_STATUS.PICKED_UP,
  'IN TRANSIT': SHIPPING_STATUS.IN_TRANSIT,
  'SHIPPED': SHIPPING_STATUS.SHIPPED,
  'OUT FOR DELIVERY': SHIPPING_STATUS.OUT_FOR_DELIVERY,
  'DELIVERED': SHIPPING_STATUS.DELIVERED,
  'CANCELLED': SHIPPING_STATUS.CANCELLED,
  'RTO INITIATED': SHIPPING_STATUS.RETURNED,
  'RTO DELIVERED': SHIPPING_STATUS.RETURNED,
  'RTO ACKNOWLEDGED': SHIPPING_STATUS.RETURNED,
  'LOST': SHIPPING_STATUS.FAILED,
  'DAMAGED': SHIPPING_STATUS.FAILED,
  'UNDELIVERED': SHIPPING_STATUS.FAILED,
};

function normalizeShiprocketStatus(srStatus) {
  if (!srStatus) return SHIPPING_STATUS.PENDING;
  const upper = String(srStatus).trim().toUpperCase();
  return SHIPROCKET_STATUS_MAP[upper] || SHIPPING_STATUS.IN_TRANSIT;
}

// ── State Transition Validation Rules ─────────────────────────────────────────
const VALID_SHIPPING_TRANSITIONS = {
  [SHIPPING_STATUS.PENDING]: [SHIPPING_STATUS.READY_TO_SHIP, SHIPPING_STATUS.CANCELLED, SHIPPING_STATUS.FAILED],
  [SHIPPING_STATUS.READY_TO_SHIP]: [SHIPPING_STATUS.AWB_ASSIGNED, SHIPPING_STATUS.PICKUP_SCHEDULED, SHIPPING_STATUS.CANCELLED, SHIPPING_STATUS.FAILED],
  [SHIPPING_STATUS.AWB_ASSIGNED]: [SHIPPING_STATUS.PICKUP_SCHEDULED, SHIPPING_STATUS.PICKED_UP, SHIPPING_STATUS.SHIPPED, SHIPPING_STATUS.IN_TRANSIT, SHIPPING_STATUS.CANCELLED, SHIPPING_STATUS.FAILED],
  [SHIPPING_STATUS.PICKUP_SCHEDULED]: [SHIPPING_STATUS.PICKED_UP, SHIPPING_STATUS.SHIPPED, SHIPPING_STATUS.IN_TRANSIT, SHIPPING_STATUS.CANCELLED, SHIPPING_STATUS.FAILED],
  [SHIPPING_STATUS.PICKED_UP]: [SHIPPING_STATUS.IN_TRANSIT, SHIPPING_STATUS.SHIPPED, SHIPPING_STATUS.OUT_FOR_DELIVERY, SHIPPING_STATUS.CANCELLED, SHIPPING_STATUS.FAILED],
  [SHIPPING_STATUS.SHIPPED]: [SHIPPING_STATUS.IN_TRANSIT, SHIPPING_STATUS.OUT_FOR_DELIVERY, SHIPPING_STATUS.DELIVERED, SHIPPING_STATUS.RETURNED, SHIPPING_STATUS.FAILED],
  [SHIPPING_STATUS.IN_TRANSIT]: [SHIPPING_STATUS.OUT_FOR_DELIVERY, SHIPPING_STATUS.DELIVERED, SHIPPING_STATUS.RETURNED, SHIPPING_STATUS.FAILED],
  [SHIPPING_STATUS.OUT_FOR_DELIVERY]: [SHIPPING_STATUS.DELIVERED, SHIPPING_STATUS.RETURNED, SHIPPING_STATUS.FAILED],
  [SHIPPING_STATUS.DELIVERED]: [SHIPPING_STATUS.RETURNED], // Terminal delivery milestone (only returns allowed)
  [SHIPPING_STATUS.RETURNED]: [],
  [SHIPPING_STATUS.CANCELLED]: [],
  [SHIPPING_STATUS.FAILED]: [SHIPPING_STATUS.READY_TO_SHIP, SHIPPING_STATUS.AWB_ASSIGNED], // May be retried
};

function isValidShippingTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) return true; // No-op if either status is missing
  const from = fromStatus.toUpperCase();
  const to = toStatus.toUpperCase();
  if (from === to) return true; // Same-state is always a no-op
  const allowed = VALID_SHIPPING_TRANSITIONS[from];
  if (!allowed) return false; // Unknown 'from' state: fail closed (block unknown transitions)
  return allowed.includes(to);
}


module.exports = {
  SHIPPING_STATUS,
  SHIPROCKET_STATUS_MAP,
  normalizeShiprocketStatus,
  VALID_SHIPPING_TRANSITIONS,
  isValidShippingTransition,

  // Config getters
  getApiUrl: () => process.env.SHIPROCKET_API_URL || 'https://apiv2.shiprocket.in/v1/external',
  getEmail: () => process.env.SHIPROCKET_EMAIL || '',
  getPassword: () => process.env.SHIPROCKET_PASSWORD || '',
  getDefaultPickupLocation: () => process.env.SHIPROCKET_DEFAULT_PICKUP_LOCATION || 'Primary',
  getWebhookSecret: () => process.env.SHIPROCKET_WEBHOOK_SECRET || '',

  // Package fallbacks
  getDefaultWeight: () => parseFloat(process.env.SHIPMENT_DEFAULT_WEIGHT) || 0.5,
  getDefaultLength: () => parseFloat(process.env.SHIPMENT_DEFAULT_LENGTH) || 20.0,
  getDefaultBreadth: () => parseFloat(process.env.SHIPMENT_DEFAULT_BREADTH) || 20.0,
  getDefaultHeight: () => parseFloat(process.env.SHIPMENT_DEFAULT_HEIGHT) || 10.0,

  // Active provider selector
  getActiveProviderType: () => {
    const forced = (process.env.SHIPPING_PROVIDER || '').toLowerCase().trim();
    if (forced === 'mock') return 'mock';
    if (forced === 'shiprocket') return 'shiprocket';

    // Auto-detect based on valid credentials
    const email = process.env.SHIPROCKET_EMAIL;
    const pass = process.env.SHIPROCKET_PASSWORD;
    if (email && !email.startsWith('your_') && pass && !pass.startsWith('your_')) {
      return 'shiprocket';
    }
    return 'mock';
  },
};
