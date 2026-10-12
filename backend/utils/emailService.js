/**
 * backend/utils/emailService.js
 * ─────────────────────────────────────────────────────────────────
 * KalaStyle AI — Dedicated Email & Direct OTP Delivery Service
 *
 * Provides standalone, direct delivery of 8-digit verification OTPs
 * via SMTP (Gmail, Brevo, SendGrid, Hostinger, AWS SES, or any custom mailer).
 *
 * The email delivers strictly the numeric OTP code — zero confirmation
 * links, zero magic URLs, ensuring pure code-based verification.
 * ─────────────────────────────────────────────────────────────────
 */

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  // Graceful fallback if nodemailer is unavailable
}

/**
 * Checks whether SMTP credentials are fully configured in the environment.
 */
function isSmtpConfigured() {
  const hasHost = Boolean(process.env.SMTP_HOST || process.env.GMAIL_USER);
  const hasUser = Boolean(process.env.SMTP_USER || process.env.GMAIL_USER);
  const hasPass = Boolean(process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASSWORD);
  return hasHost && hasUser && hasPass && Boolean(nodemailer);
}

/**
 * Creates and returns a configured Nodemailer transporter.
 */
function getTransporter() {
  if (!nodemailer) return null;

  if (process.env.GMAIL_USER && (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS)) {
    return nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS,
      },
    });
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransporter({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  });
}

/**
 * Dispatches an email containing EXCLUSIVELY the numeric OTP code.
 * Absolutely no confirmation links, no magic links, no action buttons.
 *
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {string} params.otp - 8-digit numeric verification OTP
 * @param {string} [params.purpose='registration'] - 'registration' | 'login' | 'order'
 * @returns {Promise<{ success: boolean, messageId?: string }>}
 */
async function sendOtpEmail({ to, otp, purpose = 'registration' }) {
  if (!isSmtpConfigured()) {
    throw new Error('SMTP credentials are not configured in environment.');
  }

  const transporter = getTransporter();
  if (!transporter) {
    throw new Error('Failed to initialize SMTP transporter.');
  }

  const cleanTo = String(to).trim().toLowerCase();
  const cleanOtp = String(otp).trim();
  const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || 'noreply@kalastyle.ai';

  const purposeLabels = {
    registration: 'Account Registration',
    signup: 'Account Registration',
    login: 'Account Sign In',
    order: 'Order Confirmation',
    reset: 'Password Reset',
  };
  const label = purposeLabels[purpose.toLowerCase()] || 'Verification';

  const subject = `Your KalaStyle AI ${label} Code: ${cleanOtp}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KalaStyle AI Verification Code</title>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #080d1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; width: 100%; margin: 0 auto; background: #0f172a; border-radius: 20px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
          
          <!-- Header Banner -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center; background: linear-gradient(180deg, rgba(217,119,6,0.15) 0%, rgba(15,23,42,0) 100%); border-bottom: 1px solid #1e293b;">
              <h1 style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 28px; font-weight: 700; color: #f59e0b; letter-spacing: 0.5px;">
                KalaStyle AI
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8; letter-spacing: 1px; text-transform: uppercase;">
                Authentic Indian Artisan Marketplace
              </p>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #f59e0b; text-transform: uppercase; letter-spacing: 1.5px;">
                ${label.toUpperCase()} SECURITY CODE
              </p>
              <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #ffffff;">
                Your 8-Digit Verification OTP
              </h2>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
                Please enter the following security code on the verification screen to proceed. This code is valid for <strong>10 minutes</strong>.
              </p>

              <!-- Dedicated OTP Box (Strictly the code, zero links) -->
              <div style="background: #020617; border: 2px dashed #f59e0b; border-radius: 14px; padding: 20px 24px; margin: 0 auto 24px auto; display: inline-block; box-shadow: 0 4px 12px rgba(245,158,11,0.15);">
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #fbbf24; display: block; user-select: all;">
                  ${cleanOtp}
                </span>
              </div>

              <!-- Security Information -->
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                🔒 <strong>Security Notice:</strong> Never share this code with anyone, including KalaStyle support staff.
              </p>
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                If you did not request this verification code, please ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background: #080d1a; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #64748b;">
                &copy; ${new Date().getFullYear()} KalaStyle AI &bull; Handcrafted with pride in India
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const text = `KalaStyle AI — ${label} Security Code\n\n` +
    `Your 8-digit verification code is:\n\n` +
    `  ${cleanOtp}\n\n` +
    `Valid for 10 minutes. Please enter this code on the screen to verify.\n` +
    `Do not share this code with anyone.\n\n` +
    `If you did not request this, you can safely ignore this email.`;

  const info = await transporter.sendMail({
    from: fromAddress.includes('<') ? fromAddress : `"KalaStyle AI" <${fromAddress}>`,
    to: cleanTo,
    subject,
    text,
    html,
  });

  return { success: true, messageId: info.messageId };
}

module.exports = {
  isSmtpConfigured,
  sendOtpEmail,
};
