/**
 * backend/config/ecommerce.js
 * ─────────────────────────────────────────────────────────────────
 * Centralised e-commerce configuration for KalaStyle AI.
 * All business rules (COD limits, delivery fee, cancellation window,
 * reward threshold) are sourced from the platform_settings table
 * and cached in-memory.  Never hard-code these values in controllers.
 */

const supabase = require('./supabase');

// ── Sensible in-code defaults (overridden by DB row) ──────────────
const DEFAULTS = {
  delivery_fee: 0,
  free_delivery_above: 0,
  cod_enabled: true,
  cod_max_order_value: null, // Unlimited — no maximum cap on COD orders
  cod_min_order_value: null, // No minimum cap — users can place COD orders of any amount
  cancellation_window_hours: 12,
  reward_eligible_count: 8,
  platform_commission: 10, // %
};

let _cached = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns e-commerce settings from DB (with in-memory cache).
 * Falls back to DEFAULTS if DB is unreachable.
 */
async function getEcomSettings() {
  const now = Date.now();
  if (_cached && now - _cachedAt < CACHE_TTL_MS) return _cached;

  try {
    const { data } = await supabase
      .from('platform_settings')
      .select('*')
      .eq('id', 'main')
      .maybeSingle();

    if (data) {
      _cached = { ...DEFAULTS, ...data, cod_max_order_value: null };
      _cachedAt = now;
      return _cached;
    }
  } catch (err) {
    console.warn('[ecommerce.js] Could not fetch platform_settings:', err.message);
  }

  _cached = { ...DEFAULTS };
  _cachedAt = now;
  return _cached;
}

/** Invalidate the in-memory cache (call after admin updates settings) */
function invalidateEcomCache() {
  _cached = null;
  _cachedAt = 0;
}

/**
 * Calculate delivery fee for a given subtotal.
 * Uses centralized business rule — never call this from the frontend.
 */
async function calculateDeliveryFee(subtotal) {
  // Delivery is completely FREE (₹0) across all products and orders
  return 0;
}

/**
 * Derive master order status from the list of artisan order statuses.
 * This is the authoritative status-machine logic.
 */
function deriveMasterStatus(artisanStatuses) {
  if (!artisanStatuses || artisanStatuses.length === 0) return 'pending';

  const s = artisanStatuses.map(x => (x || '').toLowerCase().trim());
  const all = (val) => s.every(x => x === val);
  const some = (val) => s.some(x => x === val);
  const allIn = (...vals) => s.every(x => vals.includes(x));

  if (all('delivered'))                           return 'delivered';
  if (all('rejected'))                            return 'rejected';
  if (all('cancelled') || allIn('cancelled', 'rejected')) return 'cancelled';
  if (allIn('delivered', 'cancelled', 'rejected'))return 'partially_delivered';
  if (some('delivered') && (some('preparing') || some('processing') || some('ready_for_pickup'))) return 'partially_processing';
  if (some('delivered'))                          return 'partially_delivered';
  if (some('out_for_delivery') || some('dispatched') || some('shipped')) return 'shipped';
  if (some('preparing') || some('processing') || some('ready_for_pickup')) return 'processing';
  if (all('accepted') || some('accepted'))        return 'accepted';
  if (all('pending'))                             return 'pending';
  if (allIn('confirmed', 'pending'))              return 'confirmed';
  return 'processing';
}

/**
 * Allowed artisan order status transitions.
 * Artisans can move forward through the pipeline.
 * We also allow direct jumps and status aliases.
 */
const VALID_OPERATIONAL_STATUSES = [
  'pending', 'confirmed', 'accepted', 'preparing', 'processing',
  'in_preparation', 'ready_for_pickup', 'packed', 'dispatched',
  'shipped', 'out_for_delivery', 'on_the_way', 'delivered',
  'completed', 'cancelled', 'rejected'
];

/**
 * Allowed artisan order status transitions.
 * Artisans can move forward through the pipeline, or move backward to correct mistakes,
 * as well as cancel / reject as needed.
 */
const OPERATIONAL_STATUSES = [
  'pending', 'confirmed', 'accepted', 'preparing', 'processing',
  'in_preparation', 'ready_for_pickup', 'packed', 'dispatched',
  'shipped', 'out_for_delivery', 'on_the_way', 'delivered', 'completed',
  'cancelled', 'rejected'
];

const ALL_FLOW_STATUSES = [
  'pending', 'confirmed', 'accepted', 'preparing', 'processing',
  'in_preparation', 'ready_for_pickup', 'packed', 'dispatched',
  'shipped', 'out_for_delivery', 'on_the_way', 'delivered', 'completed',
  'cancelled', 'rejected'
];

const ARTISAN_STATUS_TRANSITIONS = {
  pending:           ALL_FLOW_STATUSES,
  confirmed:         ALL_FLOW_STATUSES,
  accepted:          ALL_FLOW_STATUSES,
  preparing:         ALL_FLOW_STATUSES,
  processing:        ALL_FLOW_STATUSES,
  in_preparation:    ALL_FLOW_STATUSES,
  ready_for_pickup:  ALL_FLOW_STATUSES,
  packed:            ALL_FLOW_STATUSES,
  dispatched:        ALL_FLOW_STATUSES,
  shipped:           ALL_FLOW_STATUSES,
  out_for_delivery:  ALL_FLOW_STATUSES,
  on_the_way:        ALL_FLOW_STATUSES,
  delivered:         ALL_FLOW_STATUSES,
  completed:         ALL_FLOW_STATUSES,
  rejected:          ALL_FLOW_STATUSES,
  cancelled:         ALL_FLOW_STATUSES,
};

function isValidArtisanTransition(from, to) {
  if (!from || !to) return true;
  if (from === to) return true; // Idempotent updates are always allowed
  
  const fromClean = String(from).toLowerCase().trim();
  const toClean = String(to).toLowerCase().trim();

  if (fromClean === toClean) return true;

  // Artisans have full access to transition and revert order status across all valid statuses
  if (VALID_OPERATIONAL_STATUSES.includes(toClean) || OPERATIONAL_STATUSES.includes(toClean)) {
    return true;
  }

  const allowed = ARTISAN_STATUS_TRANSITIONS[fromClean];
  if (allowed && allowed.includes(toClean)) return true;

  return false;
}

module.exports = {
  getEcomSettings,
  invalidateEcomCache,
  calculateDeliveryFee,
  deriveMasterStatus,
  isValidArtisanTransition,
  DEFAULTS,
};

