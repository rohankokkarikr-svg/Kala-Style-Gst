/**
 * frontend/src/constants/checkoutOtp.js
 * ─────────────────────────────────────────────────────────────────
 * KalaStyle AI — Checkout Phone OTP Constants
 *
 * ISOLATION: These constants are ENTIRELY SEPARATE from:
 *   frontend/src/utils/authHelper.js (OTP_LENGTH = 8, login email OTP)
 *
 * Checkout phone OTP uses Twilio Verify which defaults to 6 digits.
 * Login email OTP uses Supabase Auth which uses 8 digits.
 * These must never be conflated.
 */

/** Number of digits in the SMS verification code sent to the delivery phone. */
export const CHECKOUT_OTP_LENGTH = 6;

/** Regex for validating a 6-digit SMS verification code. */
export const CHECKOUT_OTP_REGEX = /^\d{6}$/;

/**
 * Returns true if the value is a valid checkout phone OTP code.
 * Separate from authHelper.isValidOtp() which validates 8-digit login OTPs.
 */
export const isValidCheckoutOtp = (code) => {
  if (typeof code !== 'string') return false;
  const clean = code.trim();
  return clean.length === CHECKOUT_OTP_LENGTH && CHECKOUT_OTP_REGEX.test(clean);
};

/** Resend cooldown in seconds (must match backend RESEND_COOLDOWN_MS / 1000). */
export const CHECKOUT_OTP_RESEND_COOLDOWN_S = 60;

/** Masks a phone number for display: +91 9876543210 → +91 ******3210 */
export const maskPhone = (phone) => {
  if (!phone) return '******';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 4) return '******';
  const last4 = digits.slice(-4);
  return `+91 ******${last4}`;
};
