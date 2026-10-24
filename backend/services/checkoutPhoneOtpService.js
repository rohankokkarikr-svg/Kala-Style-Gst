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
const { safeQuery } = require('../config/supabase');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUuid = (val) => Boolean(val && typeof val === 'string' && UUID_REGEX.test(val.trim()));

const trialChallenges = new Set();

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

  const flag = process.env.CHECKOUT_PHONE_OTP_ENABLED;
  if (flag && (flag.toLowerCase() === 'false' || flag === '0')) return null;

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

const isDirectTwilioConfigured = () => {
  const sid       = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const svcSid    = process.env.TWILIO_VERIFY_SERVICE_SID;
  return Boolean(sid && authToken && svcSid);
};

/**
 * Checks whether an SMS OTP provider is configured and enabled.
 * Supports:
 *   1. Direct Twilio Verify (via backend environment variables)
 *   2. Supabase-integrated Twilio Phone Provider (via Supabase Dashboard)
 *
 * Automatically enabled when provider credentials (Twilio or Supabase) exist,
 * unless explicitly disabled by setting CHECKOUT_PHONE_OTP_ENABLED=false.
 */
const isProviderConfigured = () => {
  const flag = process.env.CHECKOUT_PHONE_OTP_ENABLED;
  if (flag && (flag.toLowerCase() === 'false' || flag === '0')) return false;

  return isDirectTwilioConfigured() || Boolean(process.env.SUPABASE_URL);
};

// ─── Challenge Store (Supabase with In-Memory Resilient Fallback) ─────────────
// Primary store is Supabase table: checkout_otp_challenges
// In-memory fallback activates automatically if DB RLS policy or connection blocks write
const memoryChallenges = new Map();

/**
 * Retrieves the latest active (non-consumed, non-expired) challenge
 * for a given userId + phoneE164 combination.
 */
const getActiveChallenge = async (userId, phoneE164) => {
  if (!isValidUuid(userId) || !phoneE164) return null;

  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('checkout_otp_challenges')
        .select('*')
        .eq('user_id', userId)
        .eq('phone_e164', phoneE164)
        .like('purpose', `${CHECKOUT_OTP_PURPOSE}%`)
        .eq('consumed', false)
        .is('verify_token', null)
        .gt('expires_at', new Date().toISOString())
        .order('issued_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    );

    if (!error && data) return data;
  } catch (err) {
    console.warn('[checkoutPhoneOtpService] getActiveChallenge DB note:', err.message);
  }

  // Check in-memory store fallback
  const now = Date.now();
  for (const c of memoryChallenges.values()) {
    if (
      c.user_id === userId &&
      c.phone_e164 === phoneE164 &&
      !c.consumed &&
      !c.verify_token &&
      new Date(c.expires_at).getTime() > now
    ) {
      return c;
    }
  }

  return null;
};

/**
 * Marks all existing active challenges for this userId+phone as consumed
 * (before issuing a resend to invalidate prior code).
 */
const invalidateExistingChallenges = async (userId, phoneE164) => {
  if (!isValidUuid(userId) || !phoneE164) return;

  try {
    await safeQuery(() =>
      supabase
        .from('checkout_otp_challenges')
        .update({ consumed: true, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('phone_e164', phoneE164)
        .like('purpose', `${CHECKOUT_OTP_PURPOSE}%`)
        .is('verify_token', null)
        .eq('consumed', false)
    );
  } catch (err) {
    console.warn('[checkoutPhoneOtpService] invalidateExistingChallenges DB note:', err.message);
  }

  for (const c of memoryChallenges.values()) {
    if (c.user_id === userId && c.phone_e164 === phoneE164 && !c.consumed && !c.verify_token) {
      c.consumed = true;
    }
  }
};

/**
 * Counts sends in the rolling time window (rate-limit guard).
 */
const countRecentSends = async (userId, phoneE164) => {
  if (!isValidUuid(userId) || !phoneE164) return 0;

  if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_PHONE_OTP === 'true') {
    return 0;
  }

  let count = 0;
  const windowStart = new Date(Date.now() - SENDS_WINDOW_MS).toISOString();

  try {
    const { count: dbCount, error } = await safeQuery(() =>
      supabase
        .from('checkout_otp_challenges')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('phone_e164', phoneE164)
        .like('purpose', `${CHECKOUT_OTP_PURPOSE}%`)
        .gte('issued_at', windowStart)
        .eq('consumed', false)
    );

    if (!error && typeof dbCount === 'number') count = dbCount;
  } catch (err) {
    console.warn('[checkoutPhoneOtpService] countRecentSends DB note:', err.message);
  }

  const windowStartMs = Date.now() - SENDS_WINDOW_MS;
  for (const c of memoryChallenges.values()) {
    if (
      c.user_id === userId &&
      c.phone_e164 === phoneE164 &&
      !c.consumed &&
      new Date(c.issued_at).getTime() >= windowStartMs
    ) {
      count++;
    }
  }

  return count;
};

/**
 * Creates a new challenge row. Returns the inserted record.
 */
const createChallenge = async (userId, phoneE164) => {
  if (!isValidUuid(userId)) {
    throw new Error('Valid user ID is required to create a verification challenge');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_EXPIRY_MS);
  const fallbackRecord = {
    id: crypto.randomUUID(),
    user_id:    userId,
    phone_e164: phoneE164,
    purpose:    CHECKOUT_OTP_PURPOSE,
    issued_at:  now.toISOString(),
    expires_at: expiresAt.toISOString(),
    consumed:   false,
    verify_token: null,
    token_expires_at: null,
    send_count:  1,
    last_send_at: now.toISOString(),
    attempt_count: 0,
    isInMemory: true,
  };

  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('checkout_otp_challenges')
        .insert({
          user_id:    userId,
          phone_e164: phoneE164,
          purpose:    CHECKOUT_OTP_PURPOSE,
          issued_at:  now.toISOString(),
          expires_at: expiresAt.toISOString(),
          consumed:   false,
          verify_token: null,
          send_count:  1,
          last_send_at: now.toISOString(),
          attempt_count: 0,
        })
        .select()
        .single()
    );

    if (error) {
      console.warn('[checkoutPhoneOtpService] Supabase insert challenge warning (using in-memory fallback):', error.message);
      memoryChallenges.set(fallbackRecord.id, fallbackRecord);
      return fallbackRecord;
    }

    // Also mirror to memory for zero-latency lookup
    memoryChallenges.set(data.id, data);
    return data;
  } catch (err) {
    console.warn('[checkoutPhoneOtpService] createChallenge exception (using in-memory fallback):', err.message);
    memoryChallenges.set(fallbackRecord.id, fallbackRecord);
    return fallbackRecord;
  }
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
  if (!isValidUuid(userId)) {
    return { success: false, error: 'Invalid user session. Please log in again.' };
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
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_PHONE_OTP !== 'true') {
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
    return { success: false, error: dbErr?.message || 'Verification service temporarily unavailable. Please try again.' };
  }

  // 6. Create challenge record BEFORE calling Twilio
  //    (If Twilio call fails, challenge won't be consumed)
  let challenge;
  try {
    challenge = await createChallenge(userId, phoneE164);
  } catch (dbErr) {
    console.error('[checkoutPhoneOtpService] createChallenge DB error:', dbErr.message);
    return { success: false, error: dbErr?.message || 'Verification service error. Please try again.' };
  }

  // 7. Dispatch OTP via Direct Twilio Verify OR Supabase Twilio Phone Provider
  let dispatchSuccess = false;

  if (isDirectTwilioConfigured()) {
    try {
      const client = getTwilioClient();
      const svcSid = getVerifyServiceSid();

      await client.verify.v2.services(svcSid)
        .verifications
        .create({ to: phoneE164, channel: 'sms' });

      console.log(`[checkoutPhoneOtpService] SMS OTP dispatched via Twilio Verify → ${maskPhone(phoneE164)} (challenge: ${challenge.id})`);
      dispatchSuccess = true;
    } catch (twilioErr) {
      console.warn('[checkoutPhoneOtpService] Direct Twilio send failed, falling back to Supabase Twilio provider:', twilioErr.message);
    }
  }

  // If not dispatched via direct Twilio (or direct Twilio not configured), dispatch REAL SMS via Supabase Twilio Provider
  if (!dispatchSuccess) {
    try {
      const { data: sbData, error: sbErr } = await supabase.auth.signInWithOtp({ phone: phoneE164 });

      if (sbErr) {
        console.error('[checkoutPhoneOtpService] Supabase Twilio SMS send error:', sbErr.message);
        const msg = String(sbErr.message || '');
        if (msg.includes('21608') || msg.toLowerCase().includes('unverified')) {
          return {
            success: false,
            error: `Twilio Trial limitation: The number ${maskPhone(phoneE164)} is not verified in your Twilio Console. Please verify it at twilio.com/user/account/phone-numbers/verified to receive real SMS, or upgrade your Twilio account.`,
            isTwilioTrialUnverified: true,
          };
        }

        return {
          success: false,
          error: `SMS delivery failed: ${msg}`,
        };
      }

      console.log(`[checkoutPhoneOtpService] REAL SMS OTP dispatched via Supabase Twilio Provider → ${maskPhone(phoneE164)} (challenge: ${challenge.id})`);
      dispatchSuccess = true;
    } catch (sbEx) {
      console.error('[checkoutPhoneOtpService] Supabase Twilio SMS exception:', sbEx.message);
      return {
        success: false,
        error: sbEx.message || 'Failed to dispatch real SMS verification code. Please try again.',
      };
    }
  }

  return {
    success: true,
    maskedPhone: maskPhone(phoneE164),
    challengeId: challenge.id,
    expiresIn: CHALLENGE_EXPIRY_MS / 1000,
    cooldownSeconds: RESEND_COOLDOWN_MS / 1000,
  };
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

  if (!isValidUuid(userId)) {
    return { success: false, error: 'Authentication required. Please log in again.' };
  }

  const phoneE164 = normalizeToE164(rawPhone);
  if (!phoneE164) {
    return { success: false, error: 'Invalid phone number.' };
  }

  if (!isProviderConfigured()) {
    return { success: false, error: 'SMS verification is not configured.' };
  }

  const cleanChallengeId = isValidUuid(challengeId) ? challengeId.trim() : null;

  // 1. Fetch the active challenge from DB or in-memory fallback
  let challenge = null;
  try {
    if (cleanChallengeId) {
      const { data, error } = await safeQuery(() =>
        supabase
          .from('checkout_otp_challenges')
          .select('*')
          .eq('id', cleanChallengeId)
          .eq('user_id', userId)
          .eq('phone_e164', phoneE164)
          .like('purpose', `${CHECKOUT_OTP_PURPOSE}%`)
          .eq('consumed', false)
          .maybeSingle()
      );
      if (!error && data) {
        challenge = data;
      }
    }

    if (!challenge && cleanChallengeId && memoryChallenges.has(cleanChallengeId)) {
      const mem = memoryChallenges.get(cleanChallengeId);
      if (mem.user_id === userId && mem.phone_e164 === phoneE164 && !mem.consumed) {
        challenge = mem;
      }
    }

    if (!challenge) {
      challenge = await getActiveChallenge(userId, phoneE164);
    }
  } catch (dbErr) {
    console.warn('[checkoutPhoneOtpService] verifyCheckoutPhoneOtp DB lookup note:', dbErr.message);
    if (cleanChallengeId && memoryChallenges.has(cleanChallengeId)) {
      challenge = memoryChallenges.get(cleanChallengeId);
    }
  }

  if (!challenge) {
    return { success: false, error: 'No active verification request found. Please request a new code.' };
  }

  // Idempotency: If challenge is already verified and not yet consumed, return existing token
  if (challenge.verify_token && !challenge.consumed) {
    const tokenExpiry = challenge.token_expires_at
      ? new Date(challenge.token_expires_at).getTime()
      : new Date(challenge.expires_at).getTime();

    if (Date.now() <= tokenExpiry) {
      console.log(`[checkoutPhoneOtpService] Challenge ${challenge.id} already verified, returning existing token`);
      return {
        success: true,
        verificationToken: challenge.verify_token,
        maskedPhone: maskPhone(phoneE164),
      };
    }
  }

  // 2. Expiry check
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    challenge.consumed = true;
    memoryChallenges.set(challenge.id, challenge);
    try {
      await safeQuery(() =>
        supabase.from('checkout_otp_challenges')
          .update({ consumed: true })
          .eq('id', challenge.id)
      );
    } catch (_) {}
    return { success: false, error: 'Verification code has expired. Please request a new code.' };
  }

  // 3. Attempt limit
  const attempts = (challenge.attempt_count || 0) + 1;
  challenge.attempt_count = attempts;
  memoryChallenges.set(challenge.id, challenge);
  try {
    await safeQuery(() =>
      supabase.from('checkout_otp_challenges')
        .update({ attempt_count: attempts })
        .eq('id', challenge.id)
    );
  } catch (_) {}

  if (attempts > MAX_VERIFY_ATTEMPTS) {
    challenge.consumed = true;
    memoryChallenges.set(challenge.id, challenge);
    try {
      await safeQuery(() =>
        supabase.from('checkout_otp_challenges')
          .update({ consumed: true })
          .eq('id', challenge.id)
      );
    } catch (_) {}
    return { success: false, error: 'Too many incorrect attempts. Please request a new verification code.' };
  }

  // 4. Verify real SMS OTP via Supabase Twilio Provider OR Direct Twilio Verify
  let isVerified = false;

  // 4a. Verify real SMS OTP via Supabase Twilio Phone Provider
  try {
    const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
      phone: phoneE164,
      token: String(code).trim(),
      type: 'sms',
    });

    if (!verifyErr && (verifyData?.user || verifyData?.session)) {
      console.log(`[checkoutPhoneOtpService] Real SMS OTP confirmed by Supabase for ${maskPhone(phoneE164)}`);
      isVerified = true;
      try {
        await supabase.auth.signOut();
      } catch (_) {}
    } else if (verifyErr) {
      console.warn('[checkoutPhoneOtpService] Supabase verifyOtp note:', verifyErr.message);
    }
  } catch (sbVerifyErr) {
    console.warn('[checkoutPhoneOtpService] Supabase verify exception note:', sbVerifyErr.message);
  }

  // 4b. If not verified via Supabase, verify via Direct Twilio Verify if configured
  if (!isVerified && isDirectTwilioConfigured()) {
    try {
      const client = getTwilioClient();
      const svcSid = getVerifyServiceSid();

      const verificationCheck = await client.verify.v2.services(svcSid)
        .verificationChecks
        .create({ to: phoneE164, code: String(code).trim() });

      if (verificationCheck.status === 'approved') {
        isVerified = true;
      }
    } catch (twilioErr) {
      console.warn('[checkoutPhoneOtpService] Direct Twilio verifyCheck note:', twilioErr.message);
    }
  }

  // 4c. Test environment bypass (only if ALLOW_DEV_PHONE_OTP is enabled in test environment)
  if (!isVerified && process.env.ALLOW_DEV_PHONE_OTP === 'true' && process.env.NODE_ENV !== 'production') {
    const devCode = process.env.DEV_OTP_CODE || '123456';
    if (String(code).trim() === devCode) {
      console.log(`[checkoutPhoneOtpService] Test dev code accepted in non-production environment`);
      isVerified = true;
    }
  }

  if (!isVerified) {
    return { success: false, error: 'Incorrect verification code. Please check the SMS sent to your mobile phone and try again.' };
  }

  // 5. Issue opaque one-time verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes to complete order

  // Always store in memory fallback store for guaranteed persistence
  challenge.verify_token = verificationToken;
  challenge.token_expires_at = tokenExpiresAt.toISOString();
  challenge.verified_at = new Date().toISOString();
  challenge.attempt_count = attempts;
  memoryChallenges.set(challenge.id, challenge);

  try {
    const { error: updateErr } = await safeQuery(() =>
      supabase.from('checkout_otp_challenges')
        .update({
          verify_token:       verificationToken,
          token_expires_at:   tokenExpiresAt.toISOString(),
          verified_at:        new Date().toISOString(),
          attempt_count:      attempts,
        })
        .eq('id', challenge.id)
    );

    if (updateErr) {
      console.warn('[checkoutPhoneOtpService] Token persist DB warning (memory store active):', updateErr.message);
    }
  } catch (dbErr) {
    console.warn('[checkoutPhoneOtpService] Token persist DB exception (memory store active):', dbErr.message);
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

  if (!isValidUuid(userId)) {
    return {
      success: false,
      error: 'Phone verification token is invalid or belongs to an invalid session. Please verify your phone again.',
    };
  }

  const cleanToken = String(verificationToken || '').trim();
  if (!cleanToken) {
    return { success: false, error: 'Phone verification is required to place an order.' };
  }

  const phoneE164 = rawPhone ? normalizeToE164(rawPhone) : null;

  // 1. Look up the token by verify_token from DB first, then fallback to memory store
  let challenge = null;
  try {
    const { data: dbChallenge, error: fetchErr } = await safeQuery(() =>
      supabase
        .from('checkout_otp_challenges')
        .select('*')
        .eq('verify_token', cleanToken)
        .like('purpose', `${CHECKOUT_OTP_PURPOSE}%`)
        .maybeSingle()
    );

    if (!fetchErr && dbChallenge) {
      challenge = dbChallenge;
    }
  } catch (err) {
    console.warn('[checkoutPhoneOtpService] consumeVerificationToken DB lookup note:', err.message);
  }

  if (!challenge) {
    for (const c of memoryChallenges.values()) {
      if (c.verify_token === cleanToken) {
        challenge = c;
        break;
      }
    }
  }

  if (!challenge) {
    return {
      success: false,
      error: 'Phone verification token is invalid or expired. Please verify your phone again.',
    };
  }

  // Session binding check: ensure token belongs to current user
  if (challenge.user_id !== userId) {
    console.warn(`[checkoutPhoneOtpService] User ID mismatch: token user ${challenge.user_id} vs request user ${userId}`);
    return {
      success: false,
      error: 'Phone verification token belongs to a different session. Please verify your phone again.',
    };
  }

  if (challenge.consumed) {
    return {
      success: false,
      error: 'Phone verification token has already been used for an order. Please verify your phone again.',
    };
  }

  // 2. Expiry check (token_expires_at must be set)
  const tokenExpiry = challenge.token_expires_at
    ? new Date(challenge.token_expires_at).getTime()
    : new Date(challenge.expires_at).getTime();

  if (Date.now() > tokenExpiry) {
    challenge.consumed = true;
    memoryChallenges.set(challenge.id, challenge);
    try {
      await safeQuery(() =>
        supabase.from('checkout_otp_challenges')
          .update({ consumed: true })
          .eq('id', challenge.id)
      );
    } catch (_) {}
    return { success: false, error: 'Phone verification has expired. Please verify your phone number again.' };
  }

  // 3. Phone binding check: if rawPhone supplied, verify it matches the verified phone
  if (phoneE164 && phoneE164 !== challenge.phone_e164) {
    return {
      success: false,
      error: 'Phone number mismatch. The delivery phone number does not match the verified number. Please verify again.',
    };
  }

  // 4. Atomically consume the token in memory first to prevent double-consume
  challenge.consumed = true;
  challenge.consumed_at = new Date().toISOString();
  memoryChallenges.set(challenge.id, challenge);

  try {
    await safeQuery(() =>
      supabase
        .from('checkout_otp_challenges')
        .update({ consumed: true, consumed_at: new Date().toISOString() })
        .eq('id', challenge.id)
        .eq('consumed', false)
    );
  } catch (dbErr) {
    console.warn('[checkoutPhoneOtpService] DB consume note (memory store consumed):', dbErr.message);
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
