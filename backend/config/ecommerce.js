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
  'shipped', 'out_for_delivery', 'on_the_way', 'delivered', 'completed'
];

const ARTISAN_STATUS_TRANSITIONS = {
  pending:           ['accepted', 'preparing', 'processing', 'ready_for_pickup', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'rejected', 'cancelled'],
  confirmed:         ['pending', 'accepted', 'preparing', 'processing', 'ready_for_pickup', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'rejected', 'cancelled'],
  accepted:          ['pending', 'confirmed', 'preparing', 'processing', 'in_preparation', 'ready_for_pickup', 'packed', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'],
  preparing:         ['pending', 'confirmed', 'accepted', 'processing', 'in_preparation', 'ready_for_pickup', 'packed', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'],
  processing:        ['pending', 'confirmed', 'accepted', 'preparing', 'in_preparation', 'ready_for_pickup', 'packed', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'],
  in_preparation:    ['pending', 'confirmed', 'accepted', 'preparing', 'processing', 'ready_for_pickup', 'packed', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'],
  ready_for_pickup:  ['pending', 'confirmed', 'accepted', 'preparing', 'processing', 'in_preparation', 'packed', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'],
  packed:            ['pending', 'confirmed', 'accepted', 'preparing', 'processing', 'in_preparation', 'ready_for_pickup', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'],
  dispatched:        ['pending', 'confirmed', 'accepted', 'preparing', 'processing', 'in_preparation', 'ready_for_pickup', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'],
  shipped:           ['pending', 'confirmed', 'accepted', 'preparing', 'processing', 'in_preparation', 'ready_for_pickup', 'packed', 'dispatched', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'],
  out_for_delivery:  ['pending', 'confirmed', 'accepted', 'preparing', 'processing', 'in_preparation', 'ready_for_pickup', 'packed', 'shipped', 'dispatched', 'delivered', 'cancelled', 'rejected'],
  on_the_way:        ['pending', 'confirmed', 'accepted', 'preparing', 'processing', 'in_preparation', 'ready_for_pickup', 'packed', 'shipped', 'dispatched', 'delivered', 'cancelled', 'rejected'],
  delivered:         ['pending', 'confirmed', 'accepted', 'preparing', 'processing', 'in_preparation', 'ready_for_pickup', 'packed', 'shipped', 'dispatched', 'out_for_delivery', 'cancelled', 'rejected'],
  completed:         ['pending', 'confirmed', 'accepted', 'preparing', 'processing', 'in_preparation', 'ready_for_pickup', 'packed', 'shipped', 'dispatched', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'],
  rejected:          ['cancelled'],
  cancelled:         ['rejected'],
};

function isValidArtisanTransition(from, to) {
  if (!from || !to) return true;
  if (from === to) return true; // Idempotent updates are always allowed
  
  const fromClean = String(from).toLowerCase().trim();
  const toClean = String(to).toLowerCase().trim();

  if (fromClean === toClean) return true;

  // Terminal guard: rejected and cancelled orders cannot later be accepted without a controlled admin workflow
  if ((fromClean === 'rejected' || fromClean === 'cancelled') && (toClean === 'accepted' || toClean === 'preparing' || toClean === 'processing' || toClean === 'dispatched' || toClean === 'delivered')) {
    return false;
  }

  // Delivered orders can revert to active fulfillment states (out_for_delivery, shipped, dispatched, processing, accepted)
  // but cannot jump directly back to unconfirmed pending
  if (fromClean === 'delivered' && toClean === 'pending') {
    return false;
  }

  // Cancellation and rejection are always allowed from active states (including returns or exceptions)
  if (toClean === 'cancelled' || toClean === 'rejected') return true;

  // Operational states can freely move forward AND backward between each other
  if (OPERATIONAL_STATUSES.includes(fromClean) && OPERATIONAL_STATUSES.includes(toClean)) {
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

