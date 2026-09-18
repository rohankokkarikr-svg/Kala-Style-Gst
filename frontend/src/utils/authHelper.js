/**
 * frontend/src/utils/authHelper.js
 * ─────────────────────────────────────────────────────────────────
 * Centralized role normalization and route destination resolver.
 */

/**
 * Normalizes user role string into canonical 'user' | 'artisan' | 'admin'.
 * Handles legacy 'customer', uppercase, whitespace, etc.
 */
export const normalizeRole = (role) => {
  const r = (role || 'user').toString().trim().toLowerCase();
  if (r === 'admin') return 'admin';
  if (r === 'artisan') return 'artisan';
  return 'user';
};

/**
 * Resolves the canonical landing route for an authenticated user role.
 */
export const getRoleHome = (role) => {
  const norm = normalizeRole(role);
  if (norm === 'admin') return '/admin';
  if (norm === 'artisan') return '/artisan';
  return '/';
};
