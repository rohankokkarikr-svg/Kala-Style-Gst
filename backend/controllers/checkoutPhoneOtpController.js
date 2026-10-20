/**
 * backend/controllers/checkoutPhoneOtpController.js
 * ─────────────────────────────────────────────────────────────────
 * KalaStyle AI — Checkout Phone OTP Controller
 *
 * ISOLATION: This controller is ENTIRELY SEPARATE from:
 *   - authController.js (login/signup email OTP)
 *   - orderController.js sendOrderOtp/verifyOrderOtp (legacy)
 *
 * It delegates all OTP mechanics to checkoutPhoneOtpService.js
 * which calls Twilio Verify. No plaintext OTP is ever returned,
 * logged, or stored. The verify response issues only an opaque
 * one-time server-side token bound to user + phone + purpose.
 */

'use strict';

const {
  sendCheckoutPhoneOtp,
  verifyCheckoutPhoneOtp,
  isProviderConfigured,
} = require('../services/checkoutPhoneOtpService');

/**
 * POST /api/orders/phone-otp/send
 *
 * Body: { phone: string }   — 10-digit Indian mobile number
 * Auth: protect (JWT required)
 *
 * Response:
 *   200 { success, maskedPhone, expiresIn, cooldownSeconds, challengeId }
 *   400 validation errors
 *   503 provider not configured
 */
exports.sendCheckoutPhoneOtpHandler = async (req, res) => {
  try {
    const userId   = req.user?.id;
    const rawPhone = req.body?.phone;

    if (!rawPhone) {
      return res.status(400).json({ error: 'Phone number is required to send verification code.' });
    }

    // Check provider configuration first — fail with clear message, not silent mock
    if (!isProviderConfigured()) {
      console.error('[checkoutPhoneOtpController] SMS provider not configured. Operator must set CHECKOUT_PHONE_OTP_ENABLED=true and Twilio env vars.');
      return res.status(503).json({
        error: 'SMS verification is not currently enabled on this server. Please contact support or try Cash on Delivery (COD).',
        providerMissing: true,
      });
    }

    const result = await sendCheckoutPhoneOtp({ userId, rawPhone });

    if (!result.success) {
      const statusCode = result.cooldownSeconds ? 429 : 400;
      return res.status(statusCode).json({
        error: result.error,
        cooldownSeconds: result.cooldownSeconds,
      });
    }

    // Never return OTP in response
    return res.status(200).json({
      success: true,
      maskedPhone:     result.maskedPhone,
      challengeId:     result.challengeId,
      expiresIn:       result.expiresIn,
      cooldownSeconds: result.cooldownSeconds,
      message:         `Verification code sent to ${result.maskedPhone}. Valid for ${Math.floor(result.expiresIn / 60)} minutes.`,
    });
  } catch (err) {
    console.error('[checkoutPhoneOtpController] sendCheckoutPhoneOtpHandler error:', err.message);
    return res.status(500).json({ error: 'Failed to send verification code. Please try again.' });
  }
};

/**
 * POST /api/orders/phone-otp/verify
 *
 * Body: { phone, code, challengeId? }
 * Auth: protect (JWT required)
 *
 * Response:
 *   200 { success, verificationToken, maskedPhone }
 *   400 invalid code / expired
 *   429 too many attempts
 *
 * NOTE: verificationToken is opaque and one-time.
 * It must be included in the subsequent order-creation request.
 * It is NOT the OTP code — it is issued only after Twilio confirms the code.
 */
exports.verifyCheckoutPhoneOtpHandler = async (req, res) => {
  try {
    const userId      = req.user?.id;
    const rawPhone    = req.body?.phone;
    const code        = req.body?.code;
    let challengeId   = req.body?.challengeId;
    if (challengeId === 'null' || challengeId === 'undefined' || challengeId === '') {
      challengeId = null;
    }

    if (!rawPhone || !code) {
      return res.status(400).json({ error: 'Phone number and verification code are required.' });
    }

    const result = await verifyCheckoutPhoneOtp({ userId, rawPhone, code, challengeId });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Return opaque token — never return OTP code
    return res.status(200).json({
      success:           true,
      verificationToken: result.verificationToken,
      maskedPhone:       result.maskedPhone,
      message:           'Phone number verified successfully. Proceed to place your order.',
    });
  } catch (err) {
    console.error('[checkoutPhoneOtpController] verifyCheckoutPhoneOtpHandler error:', err.message);
    return res.status(500).json({ error: 'Failed to verify code. Please try again.' });
  }
};
