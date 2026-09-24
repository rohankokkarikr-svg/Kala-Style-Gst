/**
 * backend/utils/authHelper.js
 * ─────────────────────────────────────────────────────────────────
 * Centralized authentication helpers for normalization & validation.
 */

/**
 * Normalizes email address (trimmed and lowercased).
 */
const normalizeEmail = (email) => {
  return email ? String(email).trim().toLowerCase() : '';
};

/**
 * Normalizes phone numbers, especially common Indian formats:
 * - 9876543210 -> 9876543210
 * - +919876543210 -> 9876543210
 * - 919876543210 -> 9876543210
 */
const normalizePhone = (phone) => {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

/**
 * Normalizes user role into canonical 'user' | 'artisan' | 'admin'.
 */
const normalizeRole = (role) => {
  const r = (role || 'user').toString().trim().toLowerCase();
  if (r === 'admin') return 'admin';
  if (r === 'artisan') return 'artisan';
  return 'user';
};

/**
 * Strips password hashes and sensitive fields before returning user object.
 */
const sanitizeUser = (user) => {
  if (!user) return null;
  const sanitized = { ...user };
  delete sanitized.password;
  delete sanitized.password_hash;
  sanitized.role = normalizeRole(sanitized.role);
  return sanitized;
};

/**
 * Canonical OTP length and validation: exactly 8 numeric digits
 */
const OTP_LENGTH = 8;
const OTP_REGEX = /^\d{8}$/;

/**
 * Validates that an OTP is strictly an 8-digit numeric string.
 * Rejects numbers (which may drop leading zeroes), wrong lengths, and non-digits.
 */
const isValidOtp = (token) => {
  if (typeof token !== 'string') return false;
  const clean = token.trim();
  return clean.length === OTP_LENGTH && OTP_REGEX.test(clean);
};

/**
 * Generates an 8-digit numeric OTP string, strictly preserving leading zeroes.
 */
const generateOtp = () => {
  const crypto = require('crypto');
  const num = crypto.randomInt(0, 100000000);
  return String(num).padStart(OTP_LENGTH, '0');
};

/**
 * Resolves the canonical landing route for an authenticated user role.
 */
const getRoleHome = (role) => {
  const norm = normalizeRole(role);
  if (norm === 'admin') return '/admin';
  if (norm === 'artisan') return '/artisan';
  return '/';
};

/**
 * Safely resolves post-login redirect URL.
 */
const resolveSafeRedirect = (role, returnUrl) => {
  const normRole = normalizeRole(role);
  const home = getRoleHome(normRole);

  if (!returnUrl || typeof returnUrl !== 'string') {
    return home;
  }

  const clean = returnUrl.trim();

  if (!clean.startsWith('/') || clean.startsWith('//') || clean.includes('://') || clean.startsWith('/\\')) {
    return home;
  }

  if (clean === '/login' || clean === '/signup') {
    return home;
  }

  // If target is root '/' or generic, redirect to canonical role home
  // (artisan -> /artisan, admin -> /admin, user -> /)
  if (clean === '/') {
    return home;
  }

  if (clean.startsWith('/admin') && normRole !== 'admin') {
    return normRole === 'artisan' ? '/artisan' : '/';
  }

  if (clean.startsWith('/artisan') && normRole !== 'artisan' && normRole !== 'admin') {
    return '/';
  }

  return clean;
};

module.exports = {
  OTP_LENGTH,
  OTP_REGEX,
  isValidOtp,
  generateOtp,
  normalizeEmail,
  normalizePhone,
  normalizeRole,
  sanitizeUser,
  getRoleHome,
  resolveSafeRedirect,
};
