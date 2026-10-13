/**
 * backend/services/checkoutPhoneOtpService.js
 * ─────────────────────────────────────────────────────────────────
 * KalaStyle AI — Checkout Phone OTP Service (Twilio Verify)
 *
 * IMPORTANT ISOLATION: This service is 100% separate from
 * backend/utils/authHelper.js (login email OTP) and
 * backend/controllers/authController.js sendOtp/verifyOtp.
 * It MUST NOT import or call any login-OTP functions.
 *
 * Security guarantees:
 *  - OTP generation/comparison is done by Twilio Verify; no plaintext OTP stored.
 *  - Verification tokens are bound to: userId + normalizedPhone + purpose + expiry.
 *  - Tokens are one-time: consumed atomically on order creation.
 *  - All challenges stored in Supabase (survives process restarts on Render).
 *  - No OTP value in logs, responses, or DB.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const crypto = require('crypto');
const supabase = require('../config/supabase');

// ─── Constants ────────────────────────────────────────────────────────────────
const CHECKOUT_OTP_LENGTH          = 6;          // Twilio Verify uses 6 digits by default
const CHALLENGE_EXPIRY_MS          = 10 * 60 * 1000;  // 10 minutes
const RESEND_COOLDOWN_MS           = 60 * 1000;        // 60 seconds
const MAX_VERIFY_ATTEMPTS          = 5;
const MAX_SENDS_PER_WINDOW         = 5;           // per phone per 30-min window
const SENDS_WINDOW_MS              = 30 * 60 * 1000;
const CHECKOUT_OTP_PURPOSE         = 'checkout_order_confirmation';
const INDIA_COUNTRY_CODE           = '+91';
const DEFAULT_COUNTRY_CODE         = INDIA_COUNTRY_CODE;

// ─── E.164 Phone Normalization ─────────────────────────────────────────────
/**
 * Normalizes a 10-digit Indian number to E.164 (+91XXXXXXXXXX).
 * Strips all non-digits, removes 91-prefix if present, then prefixes +91.
 * Returns null if not valid.
 */
const normalizeToE164 = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');

  // 10-digit bare number
  if (digits.length === 10) {
    return `${DEFAULT_COUNTRY_CODE}${digits}`;
  }
  // 12-digit with 91 prefix
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  // Already 13-char E.164 with leading + (stripped to 12 digits here)
  if (digits.length > 10) {
    const last10 = digits.slice(-10);
    if (/^\d{10}$/.test(last10)) {
      return `${DEFAULT_COUNTRY_CODE}${last10}`;
    }
  }
  return null;
};

/**
 * Returns a masked phone string for display (e.g. +91 ******1234).
 * Never exposes the OTP or full number to the client.
 */
const maskPhone = (e164Phone) => {
  if (!e164Phone || e164Phone.length < 6) return '******';
  const last4 = e164Phone.slice(-4);
  const prefix = e164Phone.startsWith('+91') ? '+91' : e164Phone.slice(0, 3);
  return `${prefix} ******${last4}`;
};

// ─── Twilio Verify Provider ────────────────────────────────────────────────
let twilioClient = null;

const getTwilioClient = () => {
  if (twilioClient) return twilioClient;

  const enabled = String(process.env.CHECKOUT_PHONE_OTP_ENABLED || 'false').toLowerCase() === 'true';
  if (!enabled) return null;

  const sid    = process.env.TWILIO_ACCOUNT_SID;
  const token  = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) return null;

  try {
    // Lazy-require so startup is not blocked when Twilio is not installed
    const twilio = require('twilio');
    twilioClient = twilio(sid, token);
    return twilioClient;
  } catch (e) {
    console.warn('[checkoutPhoneOtpService] twilio package not available:', e.message);
    return null;
  }
};

const getVerifyServiceSid = () => process.env.TWILIO_VERIFY_SERVICE_SID || null;

/**
 * Checks whether Twilio Verify is fully configured and enabled.
 */
const isProviderConfigured = () => {
  const enabled   = String(process.env.CHECKOUT_PHONE_OTP_ENABLED || 'false').toLowerCase() === 'true';
  const sid       = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const svcSid    = process.env.TWILIO_VERIFY_SERVICE_SID;
  return enabled && Boolean(sid && authToken && svcSid);
};

// ─── Supabase Challenge Store ─────────────────────────────────────────────
// Table: checkout_otp_challenges
// Columns: id, user_id, phone_e164, purpose, issued_at, expires_at,
//          consumed, verify_token, send_count, last_send_at, attempt_count

/**
 * Retrieves the latest active (non-consumed, non-expired) challenge
 * for a given userId + phoneE164 combination.
 */
const getActiveChallenge = async (userId, phoneE164) => {
  const { data, error } = await supabase
    .from('checkout_otp_challenges')
    .select('*')
    .eq('user_id', userId)
    .eq('phone_e164', phoneE164)
    .eq('purpose', CHECKOUT_OTP_PURPOSE)
    .eq('consumed', false)
    .gt('expires_at', new Date().toISOString())
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
};

/**
 * Marks all existing active challenges for this userId+phone as consumed
 * (before issuing a resend to invalidate prior code).
 */
const invalidateExistingChallenges = async (userId, phoneE164) => {
  const { error } = await supabase
    .from('checkout_otp_challenges')
    .update({ consumed: true, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('phone_e164', phoneE164)
    .eq('purpose', CHECKOUT_OTP_PURPOSE)
    .eq('consumed', false);

  if (error) console.warn('[checkoutPhoneOtpService] invalidateExistingChallenges warning:', error.message);
};

/**
 * Counts sends in the rolling time window (rate-limit guard).
 */
const countRecentSends = async (userId, phoneE164) => {
  const windowStart = new Date(Date.now() - SENDS_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from('checkout_otp_challenges')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('phone_e164', phoneE164)
    .eq('purpose', CHECKOUT_OTP_PURPOSE)
    .gte('issued_at', windowStart);

  if (error) throw error;
  return count || 0;
};

/**
 * Creates a new challenge row. Returns the inserted record.
 */
const createChallenge = async (userId, phoneE164) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_EXPIRY_MS);

  const { data, error } = await supabase
    .from('checkout_otp_challenges')
    .insert({
      user_id:    userId,
      phone_e164: phoneE164,
      purpose:    CHECKOUT_OTP_PURPOSE,
      issued_at:  now.toISOString(),
      expires_at: expiresAt.toISOString(),
      consumed:   false,
      verify_token: null,   // populated after successful verification
      send_count:  1,
      last_send_at: now.toISOString(),
      attempt_count: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * sendCheckoutPhoneOtp
 * Validates the phone, applies rate limits, calls Twilio Verify to dispatch
 * the OTP, and persists a challenge record.
 *
 * Returns: { success, maskedPhone, expiresIn, cooldownSeconds, challengeId }
 * Never returns the OTP value.
 */
const sendCheckoutPhoneOtp = async ({ userId, rawPhone }) => {
  if (!userId) {
    return { success: false, error: 'Authentication required to send verification code.' };
  }

  // 1. Normalize phone to E.164
  const phoneE164 = normalizeToE164(rawPhone);
  if (!phoneE164) {
    return {
      success: false,
      error: 'Please enter a valid 10-digit Indian mobile number (+91).',
    };
  }

  // 2. Check provider configuration
  if (!isProviderConfigured()) {
    console.error('[checkoutPhoneOtpService] SMS provider not configured. Set CHECKOUT_PHONE_OTP_ENABLED=true and Twilio env vars.');
    return {
      success: false,
      error: 'SMS verification is not currently configured. Please contact support.',
    };
  }

  // 3. Resend cooldown: check the most recent challenge
  try {
    const activeChallenge = await getActiveChallenge(userId, phoneE164);
    if (activeChallenge) {
      const lastSend = new Date(activeChallenge.last_send_at).getTime();
      const cooldownRemaining = RESEND_COOLDOWN_MS - (Date.now() - lastSend);
      if (cooldownRemaining > 0) {
        return {
          success: false,
          error: `Please wait ${Math.ceil(cooldownRemaining / 1000)} seconds before requesting a new code.`,
          cooldownSeconds: Math.ceil(cooldownRemaining / 1000),
        };
      }
    }

    // 4. Window rate-limit guard
    const recentSends = await countRecentSends(userId, phoneE164);
    if (recentSends >= MAX_SENDS_PER_WINDOW) {
      return {
        success: false,
        error: 'Too many verification attempts. Please wait 30 minutes before trying again.',
      };
    }

    // 5. Invalidate prior challenges for this user+phone (so old code stops working)
    await invalidateExistingChallenges(userId, phoneE164);

  } catch (dbErr) {
    console.error('[checkoutPhoneOtpService] DB rate-limit check error:', dbErr.message);
    // Fail closed — do not allow bypass
    return { success: false, error: 'Verification service temporarily unavailable. Please try again.' };
  }

  // 6. Create challenge record BEFORE calling Twilio
  //    (If Twilio call fails, challenge won't be consumed)
  let challenge;
  try {
    challenge = await createChallenge(userId, phoneE164);
  } catch (dbErr) {
    console.error('[checkoutPhoneOtpService] createChallenge DB error:', dbErr.message);
    return { success: false, error: 'Verification service error. Please try again.' };
  }

  // 7. Call Twilio Verify
  try {
    const client  = getTwilioClient();
    const svcSid  = getVerifyServiceSid();

    await client.verify.v2.services(svcSid)
      .verifications
      .create({ to: phoneE164, channel: 'sms' });

    // Do NOT log phoneE164 in production (PII); log only the masked version
    console.log(`[checkoutPhoneOtpService] SMS OTP dispatched → ${maskPhone(phoneE164)} (challenge: ${challenge.id})`);

    return {
      success: true,
      maskedPhone: maskPhone(phoneE164),
      challengeId: challenge.id,
      expiresIn:  CHALLENGE_EXPIRY_MS / 1000,
      cooldownSeconds: RESEND_COOLDOWN_MS / 1000,
    };
  } catch (twilioErr) {
    // Twilio failed — mark challenge as consumed so it can't be replayed
    console.error('[checkoutPhoneOtpService] Twilio send error:', twilioErr.message);
    await supabase
      .from('checkout_otp_challenges')
      .update({ consumed: true })
      .eq('id', challenge.id);

    return {
      success: false,
      error: 'Failed to send SMS verification code. Please check the phone number and try again.',
    };
  }
};

/**
 * verifyCheckoutPhoneOtp
 * Validates the submitted code against Twilio Verify, enforces attempt limits,
 * and on success issues an opaque one-time verification token bound to userId + phoneE164.
 *
 * Returns: { success, verificationToken } on success.
 * Never exposes OTP or internal details in the response.
 */
const verifyCheckoutPhoneOtp = async ({ userId, rawPhone, code, challengeId }) => {
  if (!userId) {
    return { success: false, error: 'Authentication required.' };
  }

  if (!code || String(code).trim().length !== CHECKOUT_OTP_LENGTH || !/^\d{6}$/.test(String(code).trim())) {
    return { success: false, error: `Please enter the ${CHECKOUT_OTP_LENGTH}-digit SMS verification code.` };
  }

  const phoneE164 = normalizeToE164(rawPhone);
  if (!phoneE164) {
    return { success: false, error: 'Invalid phone number.' };
  }

  if (!isProviderConfigured()) {
    return { success: false, error: 'SMS verification is not configured.' };
  }

  // 1. Fetch the active challenge from DB
  let challenge;
  try {
    // If challengeId provided, fetch by ID; otherwise, fetch latest active
    if (challengeId) {
      const { data, error } = await supabase
        .from('checkout_otp_challenges')
        .select('*')
        .eq('id', challengeId)
        .eq('user_id', userId)
        .eq('phone_e164', phoneE164)
        .eq('purpose', CHECKOUT_OTP_PURPOSE)
        .eq('consumed', false)
        .maybeSingle();
      if (error) throw error;
      challenge = data;
    } else {
      challenge = await getActiveChallenge(userId, phoneE164);
    }
  } catch (dbErr) {
    console.error('[checkoutPhoneOtpService] verifyCheckoutPhoneOtp DB error:', dbErr.message);
    return { success: false, error: 'Verification service error. Please try again.' };
  }

  if (!challenge) {
    return { success: false, error: 'No active verification request found. Please request a new code.' };
  }

  // 2. Expiry check
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    await supabase.from('checkout_otp_challenges')
      .update({ consumed: true })
      .eq('id', challenge.id);
    return { success: false, error: 'Verification code has expired. Please request a new code.' };
  }

  // 3. Attempt limit
  const attempts = (challenge.attempt_count || 0) + 1;
  await supabase.from('checkout_otp_challenges')
    .update({ attempt_count: attempts })
    .eq('id', challenge.id);

  if (attempts > MAX_VERIFY_ATTEMPTS) {
    await supabase.from('checkout_otp_challenges')
      .update({ consumed: true })
      .eq('id', challenge.id);
    return { success: false, error: 'Too many incorrect attempts. Please request a new verification code.' };
  }

  // 4. Verify with Twilio — the actual OTP comparison happens server-side at Twilio
  try {
    const client = getTwilioClient();
    const svcSid = getVerifyServiceSid();

    const verificationCheck = await client.verify.v2.services(svcSid)
      .verificationChecks
      .create({ to: phoneE164, code: String(code).trim() });

    if (verificationCheck.status !== 'approved') {
      return { success: false, error: 'Incorrect verification code. Please check your SMS and try again.' };
    }
  } catch (twilioErr) {
    console.error('[checkoutPhoneOtpService] Twilio verify error:', twilioErr.message);
    // Twilio returns status 404 for wrong/expired codes
    if (twilioErr.status === 404 || String(twilioErr.message).toLowerCase().includes('not found')) {
      return { success: false, error: 'Incorrect or expired verification code. Please try again.' };
    }
    return { success: false, error: 'Verification service error. Please try again.' };
  }

  // 5. Issue opaque one-time verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes to complete order

  try {
    await supabase.from('checkout_otp_challenges')
      .update({
        verify_token:       verificationToken,
        token_expires_at:   tokenExpiresAt.toISOString(),
        verified_at:        new Date().toISOString(),
        attempt_count:      attempts,
        // NOT consumed yet — consumed atomically when order is created
      })
      .eq('id', challenge.id);
  } catch (dbErr) {
    console.error('[checkoutPhoneOtpService] Token persist error:', dbErr.message);
    return { success: false, error: 'Verification service error. Please try again.' };
  }

  console.log(`[checkoutPhoneOtpService] Phone verified → challenge ${challenge.id} for user ${userId}`);

  return {
    success: true,
    verificationToken,
    maskedPhone: maskPhone(phoneE164),
  };
};

/**
 * consumeVerificationToken
 * Atomically validates and consumes the one-time checkout verification token.
 * Must be called inside the order-creation flow BEFORE any DB writes for the order.
 *
 * Returns: { success, phoneE164 } on success, or { success: false, error } on failure.
 */
const consumeVerificationToken = async ({ userId, verificationToken, rawPhone }) => {
  if (!userId || !verificationToken) {
    return { success: false, error: 'Phone verification is required to place an order.' };
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(userId)) {
    return {
      success: false,
      error: 'Phone verification token is invalid, already used, or belongs to a different session. Please verify your phone again.',
    };
  }

  const phoneE164 = rawPhone ? normalizeToE164(rawPhone) : null;

  // 1. Look up the token
  const { data: challenge, error: fetchErr } = await supabase
    .from('checkout_otp_challenges')
    .select('*')
    .eq('verify_token', verificationToken)
    .eq('user_id', userId)
    .eq('purpose', CHECKOUT_OTP_PURPOSE)
    .eq('consumed', false)
    .maybeSingle();

  if (fetchErr) {
    console.error('[checkoutPhoneOtpService] consumeVerificationToken DB error:', fetchErr.message);
    return { success: false, error: 'Verification service error. Please try again.' };
  }

  if (!challenge) {
    return {
      success: false,
      error: 'Phone verification token is invalid, already used, or belongs to a different session. Please verify your phone again.',
    };
  }

  // 2. Expiry check (token_expires_at must be set)
  const tokenExpiry = challenge.token_expires_at
    ? new Date(challenge.token_expires_at).getTime()
    : new Date(challenge.expires_at).getTime();

  if (Date.now() > tokenExpiry) {
    await supabase.from('checkout_otp_challenges')
      .update({ consumed: true })
      .eq('id', challenge.id);
    return { success: false, error: 'Phone verification has expired. Please verify your phone number again.' };
  }

  // 3. Phone binding check: if rawPhone supplied, verify it matches the verified phone
  if (phoneE164 && phoneE164 !== challenge.phone_e164) {
    return {
      success: false,
      error: 'Phone number mismatch. The delivery phone number does not match the verified number. Please verify again.',
    };
  }

  // 4. Atomically consume the token
  const { error: consumeErr } = await supabase
    .from('checkout_otp_challenges')
    .update({ consumed: true, consumed_at: new Date().toISOString() })
    .eq('id', challenge.id)
    .eq('consumed', false); // Guard: prevent double-consume race condition

  if (consumeErr) {
    console.error('[checkoutPhoneOtpService] consumeVerificationToken consume error:', consumeErr.message);
    return { success: false, error: 'Verification service error. Please try again.' };
  }

  console.log(`[checkoutPhoneOtpService] Token consumed → challenge ${challenge.id}, user ${userId}`);

  return {
    success: true,
    phoneE164: challenge.phone_e164,
  };
};

module.exports = {
  sendCheckoutPhoneOtp,
  verifyCheckoutPhoneOtp,
  consumeVerificationToken,
  normalizeToE164,
  maskPhone,
  isProviderConfigured,
  CHECKOUT_OTP_LENGTH,
};
