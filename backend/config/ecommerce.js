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
  cod_max_order_value: 5000,
  cod_min_order_value: 100,
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
      _cached = { ...DEFAULTS, ...data };
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

  const s = artisanStatuses.map(x => x.toLowerCase());
  const all = (val) => s.every(x => x === val);
  const some = (val) => s.some(x => x === val);
  const allIn = (...vals) => s.every(x => vals.includes(x));

  if (all('pending'))                             return 'pending';
  if (all('cancelled') || all('rejected'))        return 'cancelled';
  if (all('delivered'))                           return 'delivered';
  if (allIn('delivered', 'cancelled', 'rejected'))return 'partially_delivered';
  if (some('out_for_delivery'))                   return 'processing';
  if (some('dispatched'))                         return 'processing';
  if (some('delivered') && some('preparing'))     return 'partially_processing';
  if (some('delivered'))                          return 'partially_delivered';
  if (some('preparing') || some('ready_for_pickup') || some('accepted')) return 'processing';
  if (allIn('confirmed', 'pending'))              return 'confirmed';
  return 'processing';
}

/**
 * Allowed artisan order status transitions.
 * Artisans can move forward through the pipeline.
 * We also allow direct jumps and status aliases.
 */
const ARTISAN_STATUS_TRANSITIONS = {
  pending:           ['accepted', 'preparing', 'processing', 'ready_for_pickup', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'rejected', 'cancelled'],
  confirmed:         ['accepted', 'preparing', 'processing', 'ready_for_pickup', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'rejected', 'cancelled'],
  accepted:          ['preparing', 'processing', 'ready_for_pickup', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'],
  preparing:         ['ready_for_pickup', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'],
  processing:        ['ready_for_pickup', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'],
  in_preparation:    ['ready_for_pickup', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'],
  ready_for_pickup:  ['dispatched', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'],
  packed:            ['dispatched', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'],
  dispatched:        ['out_for_delivery', 'delivered', 'cancelled'],
  shipped:           ['out_for_delivery', 'delivered', 'cancelled'],
  on_the_way:        ['delivered', 'cancelled'],
  out_for_delivery:  ['delivered', 'cancelled'],
  delivered:         [],   // terminal
  completed:         [],   // terminal
  rejected:          [],   // terminal
  cancelled:         [],   // terminal
};

function isValidArtisanTransition(from, to) {
  if (!from || !to) return true;
  if (from === to) return true; // Idempotent updates are always allowed
  
  // Terminal states cannot transition
  if (['delivered', 'completed', 'cancelled', 'rejected'].includes(from)) return false;
  
  // Cancellation / rejection always allowed from non-terminal states
  if (to === 'cancelled' || to === 'rejected') return true;

  const allowed = ARTISAN_STATUS_TRANSITIONS[from];
  if (allowed && allowed.includes(to)) return true;

  // Permissive forward transitions for standard operational pipeline
  const standardPipeline = ['pending', 'confirmed', 'accepted', 'preparing', 'processing', 'ready_for_pickup', 'dispatched', 'shipped', 'out_for_delivery', 'delivered'];
  return standardPipeline.includes(to);
}

module.exports = {
  getEcomSettings,
  invalidateEcomCache,
  calculateDeliveryFee,
  deriveMasterStatus,
  isValidArtisanTransition,
  DEFAULTS,
};

