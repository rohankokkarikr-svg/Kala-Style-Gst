const twilio = require('twilio');

// Helper to extract effective payment method
const getEffectivePaymentMethod = (order) => {
  let pm = order.payment_method || '';
  if (!pm && order.shipping_address) {
    const match = order.shipping_address.match(/\[Method:\s*([^\]]+)\]/i);
    if (match) pm = match[1];
  }
  if (!pm) return 'COD (Cash on Delivery)';
  const pmLower = pm.toLowerCase();
  if (pmLower.includes('cod')) {
    return 'COD (Cash on Delivery)';
  }
  if (pmLower.includes('razorpay') || pmLower.includes('online') || pmLower.includes('upi') || pmLower.includes('card') || pmLower.includes('netbanking')) {
    return 'Razorpay (Online / UPI)';
  }
  return 'Razorpay (Online / UPI)';
};

// Helper to extract reference number from order
const extractRefNo = (order) => {
  if (order.razorpay_payment_id) {
    return order.razorpay_payment_id;
  }
  if (order.transaction_id && !order.transaction_id.startsWith('TXN_') && !order.transaction_id.startsWith('REF_')) {
    return order.transaction_id;
  }
  if (order.shipping_address) {
    const match = order.shipping_address.match(/Ref\.?\s*No\.?:\s*([A-Za-z0-9_]+)/i);
    if (match) return match[1];
  }
  return order.transaction_id || 'N/A';
};

// Helper to format phone to E.164 standard
const formatPhone = (phoneStr) => {
  if (!phoneStr) return null;
  let digits = String(phoneStr).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return '+91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  return '+' + digits;
};

// Initialize Twilio client supporting both Auth Token and API Key configurations
const getTwilioClient = () => {
  let accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  if (accountSid.startsWith('SAC')) {
    accountSid = accountSid.slice(1);
  }
  const authToken = (process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_API_SECRET || '').trim();
  const apiKeySid = (process.env.TWILIO_API_KEY_SID || (accountSid?.startsWith('SK') ? accountSid : null))?.trim();
  const mainAccountSid = (process.env.TWILIO_MAIN_ACCOUNT_SID || (accountSid?.startsWith('AC') ? accountSid : null))?.trim();

  if (!authToken || authToken.startsWith('your_')) {
    return null;
  }

  try {
    // Case 1: Using API Key (SK...) with Main Account SID (AC...)
    if (apiKeySid && apiKeySid.startsWith('SK') && mainAccountSid && mainAccountSid.startsWith('AC')) {
      return twilio(apiKeySid, authToken, { accountSid: mainAccountSid });
    }

    // Case 2: Standard Account SID (AC...) + Auth Token
    if (accountSid && accountSid.startsWith('AC')) {
      return twilio(accountSid, authToken);
    }

    return null;
  } catch (err) {
    console.error('❌ Twilio initialization error:', err.message);
    return null;
  }
};

/**
 * Send WhatsApp message to multiple recipients using Twilio API
 */
const sendWhatsappToRecipients = async (recipientPhones, messageBody) => {
  console.log('\n--- [WHATSAPP OUTGOING MESSAGE (Twilio)] ---');
  console.log(messageBody);
  console.log('--------------------------------------------\n');

  const client = getTwilioClient();
  const rawFrom = process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER || '+14155238886';
  const fromNumber = rawFrom.startsWith('whatsapp:') ? rawFrom : `whatsapp:${rawFrom.replace(/\s+/g, '')}`;

  if (!client) {
    console.warn('⚠️ Twilio credentials missing in .env! (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)');
    console.warn('👉 Please configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in backend/.env');
    return { success: false, reason: 'Twilio credentials missing' };
  }

  const results = [];
  const uniquePhones = Array.from(new Set(recipientPhones.map(formatPhone).filter(Boolean)));

  for (const phone of uniquePhones) {
    const toFormatted = `whatsapp:${phone.replace(/\s+/g, '')}`;
    try {
      const message = await client.messages.create({
        from: fromNumber,
        to: toFormatted,
        body: messageBody
      });
      console.log(`✅ WhatsApp message sent via Twilio to ${toFormatted}! (SID: ${message.sid})`);
      results.push({ phone, to: toFormatted, success: true, sid: message.sid });
    } catch (err) {
      console.error(`❌ Twilio WhatsApp send failed for ${toFormatted}:`, err.message);
      results.push({ phone, to: toFormatted, success: false, error: err.message });
    }
  }

  return { success: results.some(r => r.success), results };
};

// Generate direct wa.me fallback link
const getWhatsappDirectLink = (phoneStr, text) => {
  const formatted = formatPhone(phoneStr);
  if (!formatted) return null;
  const cleanNumber = formatted.replace(/\+/g, '');
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(text)}`;
};

// Formats the order confirmation message
const extractLiveLocationLink = (order) => {
  if (order?.live_location_url) return order.live_location_url;
  const match = (order?.shipping_address || '').match(/https:\/\/(?:www\.)?(?:google\.com\/maps|maps\.google\.com)\/[^\s,]+/i);
  return match ? match[0] : null;
};

const buildOrderWhatsappText = (order, customerName) => {
  const itemsText = (order.items || [])
    .map(item => `• ${item.product?.name || item.title || 'Handcrafted Item'} (Size: ${item.size || 'Standard'}, Qty: ${item.quantity || 1}) - ₹${(((item.price_at_time || item.price || 0) * (item.quantity || 1))).toLocaleString('en-IN')}`)
    .join('\n');

  const itemsCount = (order.items || []).reduce((s, i) => s + (i.quantity || 1), 0);
  const subtotal = (order.items || []).reduce((s, i) => s + ((i.price_at_time || i.price || 0) * (i.quantity || 1)), 0);
  const discount = order.discount_amount || 0;
  const shipping = Math.max(0, (order.total_price || 0) - subtotal + discount);
  const payMethod = getEffectivePaymentMethod(order);
  const liveLocationUrl = extractLiveLocationLink(order);
  const liveLocLine = liveLocationUrl ? `\n🗺️ *Customer Live Location:* ${liveLocationUrl}` : '';

  const rawPayStatus = String(order.payment_status || '').toLowerCase().trim();
  const rawOrderStatus = String(order.order_status || order.status || '').toLowerCase().trim();
  const isCod = payMethod.toLowerCase().includes('cod');
  const isPaid = rawPayStatus === 'paid' || rawOrderStatus === 'paid';
  const totalFormatted = (order.total_price || 0).toLocaleString('en-IN');

  const razorpayPaymentId = order.razorpay_payment_id || (order.transaction_id && !order.transaction_id.startsWith('TXN_') && !order.transaction_id.startsWith('REF_') ? order.transaction_id : null);
  const razorpayOrderId = order.razorpay_order_id || null;

  let headerBanner = '';
  let paymentBadge = '';
  let actionDirective = '';

  if (isCod) {
    if (isPaid) {
      headerBanner = '🟢 *[REAL-TIME ALERT: COD PAYMENT COLLECTED / PAID]*';
      paymentBadge = '🟢 *PAYMENT STATUS: PAID (Cash Collected upon Delivery)*';
      actionDirective = '✅ *Next Action:* Cash collected from customer. Order completed.';
    } else {
      headerBanner = '🔵 *[REAL-TIME ALERT: NEW COD ORDER - PAYMENT PENDING]*';
      paymentBadge = `🔴 *PAYMENT STATUS: PENDING (COD - Collect ₹${totalFormatted} on Delivery)*`;
      actionDirective = `📦 *Next Action:* Pack & dispatch order. Courier partner must collect ₹${totalFormatted} cash on delivery.`;
    }
  } else {
    // Razorpay (Online / UPI Payment Gateway)
    const rzpPayIdLine = razorpayPaymentId ? `\n💳 *Razorpay Payment ID:* *${razorpayPaymentId}*` : '';
    const rzpOrderIdLine = razorpayOrderId ? `\n🆔 *Razorpay Order ID:* ${razorpayOrderId}` : '';

    if (isPaid) {
      headerBanner = '🟢 *[REAL-TIME ALERT: RAZORPAY PAYMENT RECEIVED / PAID]*';
      paymentBadge = `🟢 *PAYMENT STATUS: PAID (Captured Online via Razorpay)*${rzpPayIdLine}${rzpOrderIdLine}`;
      actionDirective = '🚀 *Next Action:* Payment verified & captured online via Razorpay. Order confirmed! Ready for packing & shipping.';
    } else {
      headerBanner = '🟡 *[REAL-TIME ALERT: NEW RAZORPAY ORDER - PAYMENT PENDING]*';
      paymentBadge = `⏳ *PAYMENT STATUS: PENDING (Awaiting Razorpay Online Payment)*${rzpOrderIdLine}`;
      actionDirective = '⌛ *Next Action:* Customer initiated Razorpay checkout. Awaiting payment completion by customer.';
    }
  }

  const orderTimeStr = new Date(order.created_at || Date.now()).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const discountText = discount > 0 ? `-₹${discount.toLocaleString('en-IN')}${order.coupon_code ? ` (${order.coupon_code})` : ''}` : '₹0';

  return `${headerBanner}
========================================
📦 *Order ID:* #${order.id?.substring(0, 8)} (${order.id})
📅 *Date & Time:* ${orderTimeStr} IST
${paymentBadge}
----------------------------------------
👤 *Customer Name:* ${customerName || 'Valued Customer'}
📞 *Customer Phone:* +91 ${order.phone || 'N/A'}
📍 *Delivery Address:* ${order.shipping_address || 'N/A'}${liveLocLine}

🛒 *Items Ordered (${itemsCount} items):*
${itemsText || '• Handcrafted item'}

💰 *Payment Method:* ${payMethod}
💵 *Subtotal:* ₹${subtotal.toLocaleString('en-IN')}
🚚 *Delivery Fee:* ₹${shipping.toLocaleString('en-IN')}
🏷️ *Discount Applied:* ${discountText}
========================================
💵 *TOTAL AMOUNT:* ₹${totalFormatted}
----------------------------------------
${actionDirective}
========================================`;
};

exports.getEffectivePaymentMethod = getEffectivePaymentMethod;
exports.formatPhone = formatPhone;
exports.getWhatsappDirectLink = getWhatsappDirectLink;
exports.buildOrderWhatsappText = buildOrderWhatsappText;

/**
 * Sends a WhatsApp notification to Admin & Customer when a new order is placed (COD or UPI or Prepaid).
 */
exports.sendOrderWhatsappNotification = async (adminPhone, order, customerName) => {
  const effectiveAdminPhone = adminPhone || process.env.ADMIN_WHATSAPP_NUMBER || process.env.ADMIN_PHONE || '917349083982';
  const messageBody = buildOrderWhatsappText(order, customerName);
  const recipients = [effectiveAdminPhone];
  if (order.phone && String(order.phone) !== String(effectiveAdminPhone)) {
    recipients.push(order.phone);
  }
  const twilioRes = await sendWhatsappToRecipients(recipients, messageBody);
  const directLink = getWhatsappDirectLink(effectiveAdminPhone, messageBody);

  return {
    ...twilioRes,
    messageText: messageBody,
    directLink
  };
};

/**
 * Sends a WhatsApp notification directly to Admin & Artisan when customer submits UPI Ref. No. / UTR.
 */
exports.sendArtisanUtrSubmittedNotification = async (artisanPhone, artisanStore, order, customerName, refNo) => {
  const itemsText = (order.items || [])
    .map(item => `• ${item.product?.name || 'Item'} (Size: ${item.size || 'Standard'}, Qty: ${item.quantity || 1}) - ₹${((item.price_at_time || item.product?.price || 0) * (item.quantity || 1)).toLocaleString('en-IN')}`)
    .join('\n');

  const itemsCount = (order.items || []).reduce((s, i) => s + (i.quantity || 1), 0);
  const cleanRef = refNo || extractRefNo(order);
  const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER || process.env.ADMIN_PHONE || '917349083982';

  const messageBody = `🟡 *[REAL-TIME ALERT: UPI PAYMENT SUBMITTED - PENDING VERIFICATION]*
========================================
📦 *Order ID:* #${order.id?.substring(0, 8)} (${order.id})
🔑 *Submitted UTR / Ref No:* *${cleanRef}*
🟡 *PAYMENT STATUS: PENDING VERIFICATION*
----------------------------------------
🎨 *Assigned Artisan:* ${artisanStore || 'Artisan Partner'}
👤 *Customer Name:* ${customerName || 'Customer'}
📞 *Customer Phone:* +91 ${order.phone}
📍 *Delivery Address:* ${order.shipping_address || 'N/A'}
💰 *Payment Method:* ${getEffectivePaymentMethod(order)}
💵 *Amount to Verify:* ₹${(order.total_price || 0).toLocaleString('en-IN')}

🛒 *Items Ordered (${itemsCount} items):*
${itemsText || '• Handcrafted item'}
========================================
⚡ *Action Required:*
1. Check UPI / Bank account for UTR *${cleanRef}*.
2. Open Admin / Artisan Portal to verify payment and confirm order!
========================================`;

  const recipients = [adminPhone];
  if (artisanPhone && String(artisanPhone) !== String(adminPhone)) {
    recipients.push(artisanPhone);
  }
  if (order.phone && String(order.phone) !== String(adminPhone) && String(order.phone) !== String(artisanPhone)) {
    recipients.push(order.phone);
  }

  const twilioRes = await sendWhatsappToRecipients(recipients, messageBody);
  const directLink = getWhatsappDirectLink(adminPhone, messageBody);

  return {
    ...twilioRes,
    messageText: messageBody,
    directLink
  };
};

/**
 * Sends a WhatsApp notification to Admin & Customer when UPI Ref. No. / UTR is submitted (fallback).
 */
exports.sendRefNoSubmittedWhatsappNotification = async (adminPhone, order, customerName) => {
  const effectiveAdmin = adminPhone || process.env.ADMIN_WHATSAPP_NUMBER || process.env.ADMIN_PHONE || '917349083982';
  return await exports.sendArtisanUtrSubmittedNotification(effectiveAdmin, 'Admin', order, customerName);
};

/**
 * Sends a WhatsApp notification to Admin, Customer & Artisan when order payment is verified & confirmed.
 */
exports.sendPaymentVerifiedWhatsappNotification = async (artisanPhone, order, customerName, artisanStore) => {
  const itemsText = (order.items || [])
    .map(item => `• ${item.product?.name || 'Item'} (Size: ${item.size || 'Standard'}, Qty: ${item.quantity || 1}) - ₹${((item.price_at_time || item.product?.price || 0) * (item.quantity || 1)).toLocaleString('en-IN')}`)
    .join('\n');

  const itemsCount = (order.items || []).reduce((s, i) => s + (i.quantity || 1), 0);
  const paymentId = order.razorpay_payment_id || extractRefNo(order);
  const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER || process.env.ADMIN_PHONE || '917349083982';

  const messageBody = `🟢 *[REAL-TIME ALERT: RAZORPAY PAYMENT RECEIVED / PAID]*
========================================
📦 *Order ID:* #${order.id?.substring(0, 8)} (${order.id})
🟢 *PAYMENT STATUS: PAID (Captured Online via Razorpay)*
💳 *Razorpay Payment ID:* *${paymentId !== 'N/A' ? paymentId : 'Captured Online'}*
----------------------------------------
🎨 *Artisan Partner:* ${artisanStore || 'Artisan Partner'}
👤 *Customer Name:* ${customerName || 'Customer'}
📞 *Customer Phone:* +91 ${order.phone}
💰 *Payment Method:* ${getEffectivePaymentMethod(order)}
💵 *Verified Paid Amount:* ₹${(order.total_price || 0).toLocaleString('en-IN')}

🛒 *Items in Order (${itemsCount} items):*
${itemsText || '• Handcrafted item'}
========================================
🚀 *Order Status:* CONFIRMED & READY FOR SHIPPING
Payment is captured via Razorpay. Order confirmed! Ready for dispatch.
========================================`;

  const recipients = [adminPhone, order.phone];
  if (artisanPhone && !recipients.includes(artisanPhone)) {
    recipients.push(artisanPhone);
  }

  return await sendWhatsappToRecipients(recipients, messageBody);
};

/**
 * Sends a WhatsApp notification to Admin & Customer when an order is cancelled.
 */
exports.sendOrderCancelWhatsappNotification = async (adminPhone, order, customerName) => {
  const itemsText = (order.items || [])
    .map(item => `• ${item.product?.name || 'Item'} (Size: ${item.size}, Qty: ${item.quantity}) - ₹${(item.price_at_time * item.quantity).toLocaleString()}`)
    .join('\n');

  const itemsCount = (order.items || []).reduce((s, i) => s + (i.quantity || 1), 0);

  const messageBody = `🚨 *Order Cancelled on KalaStyle AI!*
----------------------------------------
📦 *Order ID:* #${order.id?.substring(0, 8)}
👤 *Customer Name:* ${customerName}
📞 *Phone Number:* +91 ${order.phone}
💰 *Total Amount:* ₹${order.total_price?.toLocaleString()}

🛒 *Items in Order (${itemsCount} items):*
${itemsText || 'No items listed'}
========================================
❌ *Order Status:* CANCELLED
----------------------------------------`;

  const res = await sendWhatsappToRecipients([adminPhone, order.phone], messageBody);
  const directLink = getWhatsappDirectLink(adminPhone, messageBody);

  return {
    ...res,
    messageText: messageBody,
    directLink
  };
};

/**
 * Sends a WhatsApp notification to Admin & Customer when an order is updated/edited.
 */
exports.sendOrderEditWhatsappNotification = async (adminPhone, order, customerName) => {
  const itemsText = (order.items || [])
    .map(item => `• ${item.product?.name || 'Item'} (Size: ${item.size}, Qty: ${item.quantity}) - ₹${(item.price_at_time * item.quantity).toLocaleString()}`)
    .join('\n');

  const itemsCount = (order.items || []).reduce((s, i) => s + (i.quantity || 1), 0);

  const messageBody = `✏️ *Order Details Updated!*
----------------------------------------
📦 *Order ID:* #${order.id?.substring(0, 8)}
👤 *Customer Name:* ${customerName}
📞 *Updated Phone Number:* +91 ${order.phone}
📍 *Updated Shipping Address:* ${order.shipping_address}
💰 *Payment Method:* ${getEffectivePaymentMethod(order)}

🛒 *Updated Items & Sizes (${itemsCount} items):*
${itemsText || 'No items listed'}
========================================
💵 *Total Amount:* ₹${order.total_price?.toLocaleString()}
----------------------------------------`;

  return await sendWhatsappToRecipients([adminPhone, order.phone], messageBody);
};

/**
 * Sends a detailed WhatsApp notification directly to an artisan when a customer orders their product.
 * Contains customer name, contact phone, complete shipping/delivery address, and items to pack.
 */
exports.sendArtisanOrderNotification = async (artisanPhone, artisanStoreName, order, artisanItems, customer) => {
  const itemsText = (artisanItems || [])
    .map(item => `• ${item.product?.name || item.name || 'Craft Item'} (Qty: ${item.quantity || 1}, Size: ${item.size || 'Free Size'}) - ₹${((item.price_at_time || item.price || 0) * (item.quantity || 1)).toLocaleString('en-IN')}`)
    .join('\n');

  const totalArtisanAmount = (artisanItems || []).reduce((sum, item) => sum + ((item.price_at_time || item.price || 0) * (item.quantity || 1)), 0);
  const liveLocationUrl = extractLiveLocationLink(order);
  const liveLocLine = liveLocationUrl ? `\n🗺️ *Customer Live Location Link:* ${liveLocationUrl}` : '';

  const messageBody = `🎉 *New Customer Order for ${artisanStoreName || 'Your Craft Studio'}!*
========================================
📦 *Order ID:* #${order.id?.substring(0, 8)}
📅 *Date:* ${new Date().toLocaleDateString('en-IN')}

👤 *CUSTOMER DETAILS:*
• *Name:* ${customer?.name || 'Valued Customer'}
• *Phone:* +91 ${order.phone || customer?.phone || 'N/A'}
• *Email:* ${customer?.email || 'N/A'}

📍 *DELIVERY / SHIPPING ADDRESS:*
${order.shipping_address || 'Address provided at checkout'}${liveLocLine}

🛒 *YOUR PRODUCTS ORDERED:*
${itemsText || 'Craft item'}
💰 *Total Amount:* ₹${totalArtisanAmount.toLocaleString('en-IN')}

💳 *Payment Mode:* ${getEffectivePaymentMethod(order)} (${order.payment_status || 'Pending'})
========================================
⚡ *Action:* Please prepare this order for packing and delivery!`;

  return await sendWhatsappToRecipients([artisanPhone], messageBody);
};

// ── sendCODOrderNotification ─────────────────────────────────────────────────
// Called when a COD order is placed. Notifies artisan to prepare.
const sendCODOrderNotification = async (artisanPhone, storeName, order, artisanItems, customer) => {
  const itemsText = (artisanItems || [])
    .map(i => `• ${i.product_name_snapshot || i.products?.name || 'Item'} (Qty: ${i.quantity}, Size: ${i.size || 'Std'}) — ₹${(i.total_price || 0).toLocaleString('en-IN')}`)
    .join('\n');

  const messageBody = `💵 *COD ORDER - KalaStyle AI*
----------------------------------------
🆔 *Order:* ${order.order_number || order.id?.substring(0, 8)}
🏪 *Artisan:* ${storeName}
👤 *Customer:* ${customer?.name || 'Customer'}
📞 *Phone:* +91 ${customer?.phone || order.phone || ''}
📍 *Address:* ${order.shipping_address || 'N/A'}
💰 *COD Amount:* ₹${(order.total_amount || order.total_price || 0).toLocaleString('en-IN')}
🛒 *Items:*
${itemsText}
========================================
💵 COLLECT ₹${(order.total_amount || order.total_price || 0).toLocaleString('en-IN')} CASH AT DELIVERY
⚡ Mark "Delivered" in dashboard after cash collection!`;

  return await sendWhatsappToRecipients([artisanPhone], messageBody);
};

// ── sendDeliveredNotification ─────────────────────────────────────────────────
// Called when artisan marks order as delivered.
const sendDeliveredNotification = async (customerPhone, customerName, order) => {
  const messageBody = `✅ *ORDER DELIVERED — KalaStyle AI*
----------------------------------------
🎉 Your order has been delivered!
🆔 *Order:* ${order.order_number || order.id?.substring(0, 8)}
👤 *Customer:* ${customerName}
💰 *Total:* ₹${(order.total_amount || order.total_price || 0).toLocaleString('en-IN')}
========================================
Thank you for shopping with KalaStyle AI! 🎨
Please leave a review to help the artisan grow.`;

  return await sendWhatsappToRecipients([customerPhone], messageBody);
};

// ── sendRefundInitiatedNotification ──────────────────────────────────────────
const sendRefundInitiatedNotification = async (customerPhone, customerName, order, refundAmount) => {
  const messageBody = `🔄 *REFUND INITIATED — KalaStyle AI*
----------------------------------------
Hi ${customerName}, your refund has been initiated.
🆔 *Order:* ${order.order_number || order.id?.substring(0, 8)}
💰 *Refund Amount:* ₹${refundAmount.toLocaleString('en-IN')}
⏱️ Refund will be credited in 5-7 business days.
========================================
If you have questions, reply to this message or visit our website.`;

  return await sendWhatsappToRecipients([customerPhone], messageBody);
};

// ── sendShippingDispatchNotification ──────────────────────────────────────────
const sendShippingDispatchNotification = async (customerPhone, customerName, order, shipment = {}) => {
  const trackingLink = shipment.tracking_url || (shipment.awb_code ? `https://shiprocket.co/tracking/${encodeURIComponent(shipment.awb_code)}` : 'https://kalastyle.ai/tracking');
  const messageBody = `🚚 *ORDER DISPATCHED — KalaStyle AI*
----------------------------------------
Hi ${customerName || 'Valued Customer'}, your handcrafted order is on its way!
🆔 *Order:* #${String(order.order_number || order.id || '').substring(0, 8).toUpperCase()}
📦 *Courier Partner:* ${shipment.courier_name || 'Express Logistics'}
🏷️ *AWB / Tracking No:* ${shipment.awb_code || 'Assigned'}
🔗 *Live Tracking Link:* ${trackingLink}
========================================
Track your package in real-time or visit our tracking portal.
Thank you for supporting Indian Artisans! 🎨✨`;

  return await sendWhatsappToRecipients([customerPhone], messageBody);
};

module.exports = {
  ...module.exports,
  sendCODOrderNotification,
  sendDeliveredNotification,
  sendRefundInitiatedNotification,
  sendShippingDispatchNotification,
};
