const Razorpay = require('razorpay');
const QRCode = require('qrcode');
const crypto = require('crypto');

// ⚠️  IMPORTANT: All Razorpay credentials MUST come from environment variables.
// DO NOT hardcode key_id or key_secret anywhere in source code.
// Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your .env / server environment.

const cleanStr = (val) => (val ? String(val).trim().replace(/^["']|["']$/g, '') : '');

// Lazy initializer — avoids crashing the server at startup if env is not yet set
let razorpayInstance = null;
let activeKeyId = null;

const getRazorpay = () => {
  const key_id = cleanStr(process.env.RAZORPAY_KEY_ID);
  const key_secret = cleanStr(process.env.RAZORPAY_KEY_SECRET);

  if (!key_id || !key_secret) {
    console.error('[paymentService] ❌ RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set in environment variables.');
    return null;
  }

  if (!razorpayInstance || activeKeyId !== key_id) {
    razorpayInstance = new Razorpay({ key_id, key_secret });
    activeKeyId = key_id;
  }
  return razorpayInstance;
};

// Merchant UPI ID for direct UPI transfers (fallback)
const MERCHANT_UPI_ID = process.env.MERCHANT_UPI_ID || 'styleheaven@upi';
const MERCHANT_NAME = process.env.MERCHANT_NAME || 'KalaStyle AI Artisan Marketplace';



/**
 * Create a Razorpay order
 * @param {number} amount - in INR (or in paise if isPaise is true)
 * @param {string} [receipt]
 * @param {object} [notes]
 * @param {boolean} [isPaise=false]
 */
exports.createRazorpayOrder = async (amount, receipt, notes = {}, isPaise = false) => {
  try {
    const razorpay = getRazorpay();
    if (!razorpay) {
      return { success: false, error: 'Razorpay payment gateway is not configured. Please contact support.' };
    }

    const amountInPaise = isPaise ? Math.round(Number(amount)) : Math.round(Number(amount) * 100);
    if (isNaN(amountInPaise) || amountInPaise < 100) {
      return { success: false, error: 'Amount must be at least 100 paise (₹1)' };
    }

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: String(receipt || Date.now()).substring(0, 40),
      notes,
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(options);
    return { success: true, order, key_id: activeKeyId };
  } catch (error) {
    let errMsg = error?.error?.description || error?.description || error?.message || 'Failed to create Razorpay order';
    if (errMsg.toLowerCase().includes('authentication failed')) {
      errMsg = 'Razorpay Authentication Failed: Razorpay API Key or Secret is invalid or expired. Please verify your Razorpay API Keys in the Dashboard.';
    }
    console.error('[paymentService] Razorpay order creation failed:', errMsg);
    return { success: false, error: errMsg };
  }
};


/**
 * Generate UPI QR Code data (UPI Pay URL format)
 * This works with all UPI apps: GPay, PhonePe, Paytm, BHIM
 */
exports.generateUPIURI = (amount, transactionId, orderId) => {
  const upiId = MERCHANT_UPI_ID;
  const name = encodeURIComponent(MERCHANT_NAME);
  const txnId = encodeURIComponent(transactionId);
  const txnNote = encodeURIComponent(`Order #${orderId}`);
  const amt = amount.toFixed(2);

  return `upi://pay?pa=${upiId}&pn=${name}&am=${amt}&tr=${txnId}&tn=${txnNote}&cu=INR`;
};

/**
 * Generate QR Code as base64 image
 */
exports.generateQRCode = async (upiURI) => {
  try {
    const qrDataUrl = await QRCode.toDataURL(upiURI, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    return qrDataUrl;
  } catch (error) {
    console.error('QR code generation error:', error);
    return null;
  }
};

/**
 * Generate deep-link intent URLs for major Indian UPI apps
 */
exports.generateUPIAppLinks = (upiURI) => {
  return {
    gpay: `gpay://upi/pay?${upiURI.split('?')[1]}`,
    phonepe: `phonepe://pay?${upiURI.split('?')[1]}`,
    paytm: `paytmmp://upi/pay?${upiURI.split('?')[1]}`,
    bhim: `bhim://upi/pay?${upiURI.split('?')[1]}`,
    generic: upiURI,
  };
};
exports.getUPIDeepLinks = exports.generateUPIAppLinks;

/**
 * Verify Razorpay payment signature using timing-safe comparison
 */
exports.verifyRazorpaySignature = (orderId, paymentId, signature, secretOverride = null) => {
  try {
    const secret = secretOverride ? cleanStr(secretOverride) : cleanStr(process.env.RAZORPAY_KEY_SECRET);
    if (!secret || !orderId || !paymentId || !signature) return false;
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    if (expectedSignature.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expectedSignature, 'utf8'), Buffer.from(signature, 'utf8'));
  } catch (error) {
    console.error('[paymentService] Signature verification error:', error?.message || error);
    return false;
  }
};


/**
 * Verify Razorpay webhook signature
 */
exports.verifyWebhookSignature = (body, signature, secret) => {
  try {
    const webhookSecret = secret || process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret || !body || !signature) return false;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    if (expectedSignature.length !== signature.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf8'),
      Buffer.from(signature, 'utf8')
    );
  } catch (error) {
    console.error('Webhook verification error:', error?.message || error);
    return false;
  }
};

/**
 * Fetch payment details from Razorpay
 */
exports.getPaymentDetails = async (paymentId) => {
  try {
    const razorpay = getRazorpay();
    if (!razorpay) return { success: false, error: 'Razorpay not configured' };
    const payment = await razorpay.payments.fetch(paymentId);
    return { success: true, payment };
  } catch (error) {
    console.error('Fetch payment failed:', error?.message || error);
    return { success: false, error: error?.message || 'Fetch failed' };
  }
};

/**
 * Fetch order details from Razorpay
 */
exports.getOrderDetails = async (orderId) => {
  try {
    const razorpay = getRazorpay();
    if (!razorpay) return { success: false, error: 'Razorpay not configured' };
    const order = await razorpay.orders.fetch(orderId);
    return { success: true, order };
  } catch (error) {
    console.error('Fetch order failed:', error?.message || error);
    return { success: false, error: error?.message || 'Fetch failed' };
  }
};

/**
 * Create a refund for a payment
 * @param {string} paymentId - Razorpay payment ID (e.g. pay_xxx)
 * @param {number} [amount] - in INR (optional; full refund if omitted)
 * @param {object} [notes]
 */
exports.createRefund = async (paymentId, amount, notes = {}) => {
  try {
    const razorpay = getRazorpay();
    if (!razorpay) return { success: false, error: 'Razorpay not configured' };
    const options = { notes };
    if (amount && amount > 0) {
      options.amount = Math.round(amount * 100); // Convert to paise
    }
    const refund = await razorpay.payments.refund(paymentId, options);
    return { success: true, refund };
  } catch (error) {
    console.error('Refund creation failed:', error?.message || error);
    return { success: false, error: error?.message || 'Refund failed' };
  }
};

/**
 * Generate a unique transaction ID
 */
exports.generateTransactionId = (orderId) => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `KALA${orderId?.substring(0, 8).toUpperCase() || ''}${timestamp}${random}`;
};

// Export getter
exports.getRazorpay = getRazorpay;

