/**
 * backend/services/artisanService.js
 * ─────────────────────────────────────────────────────────────────
 * Artisan management and autonomous verification operations.
 * Handles profile inspection, permission granting, and data isolation.
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const { broadcastSync } = require('../utils/realtime');

/**
 * Fetch artisans with optional status or keyword filtering.
 */
exports.getArtisans = async ({ status = 'all', search = '', limit = 20 } = {}) => {
  let query = supabase
    .from('artisan_profiles')
    .select('id, user_id, store_name, artisan_type, specialization, location, bio, verification_status, years_of_experience, earnings_total, created_at, users(id, name, email, phone)')
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 50));

  if (status && status !== 'all') {
    query = query.eq('verification_status', status);
  }

  const { data, error } = await safeQuery(() => query);
  if (error) throw new Error(`Failed to fetch artisans: ${error.message}`);

  let results = data || [];
  if (search && search.trim()) {
    const s = search.toLowerCase();
    results = results.filter(a =>
      a.store_name?.toLowerCase().includes(s) ||
      a.specialization?.toLowerCase().includes(s) ||
      a.location?.toLowerCase().includes(s) ||
      a.users?.name?.toLowerCase().includes(s)
    );
  }

  return results;
};

/**
 * Fetch artisans pending operational verification.
 */
exports.getPendingArtisans = async (limit = 20) => {
  return exports.getArtisans({ status: 'pending', limit });
};

/**
 * Fetch full profile and products for an artisan.
 */
exports.getArtisanDetails = async (artisanId) => {
  if (!artisanId) throw new Error('artisan_id is required');

  const { data: profile, error } = await safeQuery(() =>
    supabase
      .from('artisan_profiles')
      .select('*, users(id, name, email, phone, role)')
      .eq('id', artisanId)
      .single()
  );

  if (error || !profile) {
    throw new Error(`Artisan not found: ${artisanId}`);
  }

  const { data: products } = await safeQuery(() =>
    supabase
      .from('products')
      .select('id, name, price, stock_quantity, status, category, is_in_stock')
      .eq('artisan_id', artisanId)
      .limit(30)
  );

  return {
    ...profile,
    products: products || [],
  };
};

/**
 * Verify an artisan, granting official verified marketplace status and dashboard permissions.
 */
exports.verifyArtisan = async (artisanId, reason = 'Verified by AI Admin Manager', confidence = 1.0) => {
  if (!artisanId) throw new Error('artisan_id is required');

  const { data: artisan, error: getErr } = await safeQuery(() =>
    supabase.from('artisan_profiles').select('id, user_id, store_name, verification_status').eq('id', artisanId).single()
  );

  if (getErr || !artisan) {
    throw new Error(`Artisan not found: ${artisanId}`);
  }

  // 1. Update verification_status in artisan_profiles
  const { data: updated, error: updateErr } = await safeQuery(() =>
    supabase
      .from('artisan_profiles')
      .update({ verification_status: 'verified' })
      .eq('id', artisanId)
      .select()
      .single()
  );

  if (updateErr) throw new Error(`Database error verifying artisan: ${updateErr.message}`);

  // 2. Ensure user role is 'artisan' so permissions are active
  if (artisan.user_id) {
    await safeQuery(() =>
      supabase.from('users').update({ role: 'artisan' }).eq('id', artisan.user_id)
    );
  }

  // 3. Broadcast realtime update to clients
  broadcastSync('ARTISANS_UPDATED', {
    id: artisanId,
    user_id: artisan.user_id,
    verification_status: 'verified',
    artisan: updated,
  });

  return {
    success: true,
    artisan_id: artisanId,
    store_name: artisan.store_name,
    status: 'verified',
    confidence,
    reason,
  };
};

/**
 * Reject an artisan profile.
 */
exports.rejectArtisan = async (artisanId, reason = 'Rejected by AI Operations Manager') => {
  if (!artisanId) throw new Error('artisan_id is required');

  const { data: updated, error } = await safeQuery(() =>
    supabase
      .from('artisan_profiles')
      .update({ verification_status: 'rejected' })
      .eq('id', artisanId)
      .select()
      .single()
  );

  if (error) throw new Error(`Database error rejecting artisan: ${error.message}`);

  broadcastSync('ARTISANS_UPDATED', {
    id: artisanId,
    verification_status: 'rejected',
    artisan: updated,
  });

  return {
    success: true,
    artisan_id: artisanId,
    status: 'rejected',
    reason,
  };
};

/**
 * Put an artisan profile on hold for additional review.
 */
exports.holdArtisan = async (artisanId, reason = 'Hold pending additional documentation') => {
  if (!artisanId) throw new Error('artisan_id is required');

  const { data: updated, error } = await safeQuery(() =>
    supabase
      .from('artisan_profiles')
      .update({ verification_status: 'pending' })
      .eq('id', artisanId)
      .select()
      .single()
  );

  if (error) throw new Error(`Database error holding artisan: ${error.message}`);

  return {
    success: true,
    artisan_id: artisanId,
    status: 'pending_hold',
    reason,
  };
};
