import { OTP_LENGTH, OTP_REGEX } from '../constants/auth';

export { OTP_LENGTH, OTP_REGEX };

/**
 * Validates that an OTP is strictly an 8-digit numeric string.
 */
export const isValidOtp = (token) => {
  if (typeof token !== 'string') return false;
  const clean = token.trim();
  return clean.length === OTP_LENGTH && OTP_REGEX.test(clean);
};

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

/**
 * Safely resolves post-login redirect URL.
 * - Validates internal path (rejects external URLs, protocol-relative '//', javascript:, etc.)
 * - Enforces role-based boundaries (e.g. user cannot be redirected into /admin)
 * - Returns getRoleHome(role) as fallback
 */
export const resolveSafeRedirect = (role, returnUrl) => {
  const normRole = normalizeRole(role);
  const home = getRoleHome(normRole);

  if (!returnUrl || typeof returnUrl !== 'string') {
    return home;
  }

  const clean = returnUrl.trim();

  // Reject external, protocol-relative, or dangerous schemes
  if (!clean.startsWith('/') || clean.startsWith('//') || clean.includes('://') || clean.startsWith('/\\')) {
    return home;
  }

  // Reject looping auth paths
  if (clean === '/login' || clean === '/signup') {
    return home;
  }

  // If target is root '/' or generic, redirect to canonical role home
  // (artisan -> /artisan, admin -> /admin, user -> /)
  if (clean === '/') {
    return home;
  }

  // Enforce role authorization on target path
  if (clean.startsWith('/admin') && normRole !== 'admin') {
    return normRole === 'artisan' ? '/artisan' : '/';
  }

  if (clean.startsWith('/artisan') && normRole !== 'artisan' && normRole !== 'admin') {
    return '/';
  }

  return clean;
};
