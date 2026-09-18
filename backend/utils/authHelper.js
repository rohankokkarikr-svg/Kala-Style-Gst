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

module.exports = {
  normalizeEmail,
  normalizePhone,
  normalizeRole,
  sanitizeUser,
};
