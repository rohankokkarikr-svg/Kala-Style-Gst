require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { sendOrderWhatsappNotification, buildOrderWhatsappText, getWhatsappDirectLink } = require('../utils/whatsapp');

async function main() {
  const targetPhone = process.env.ADMIN_WHATSAPP_NUMBER || process.env.ADMIN_PHONE || '917349083982';

  const mockOrder = {
    id: 'ORD-78923410-DEMO',
    created_at: new Date().toISOString(),
    payment_method: 'razorpay',
    payment_status: 'paid',
    razorpay_payment_id: 'pay_LiveSample98765',
    razorpay_order_id: 'order_LiveDemo12345',
    phone: targetPhone,
    shipping_address: 'No. 12, MG Road, Indiranagar, Bengaluru, Karnataka 560038',
    live_location_url: 'https://maps.google.com/?q=12.9716,77.5946',
    total_price: 1999,
    items: [
      {
        product: { name: 'Royal Heritage Handcrafted Kurta' },
        size: 'L',
        quantity: 1,
        price_at_time: 1999
      }
    ]
  };

  console.log('\n======================================================');
  console.log('📦 PREPARING REAL-TIME ORDER WHATSAPP MESSAGE');
  console.log('======================================================');
  const messageText = buildOrderWhatsappText(mockOrder, 'Rohan Kokkari');
  console.log(messageText);
  console.log('======================================================\n');

  console.log(`📡 Dispatching via Twilio to whatsapp:+${targetPhone.replace(/\D/g, '')}...`);
  const result = await sendOrderWhatsappNotification(targetPhone, mockOrder, 'Rohan Kokkari');

  console.log('\n--- Twilio API Dispatch Result ---');
  console.log(JSON.stringify(result, null, 2));

  const directLink = getWhatsappDirectLink(targetPhone, messageText);
  console.log('\n🔗 1-Click WhatsApp Direct Link:');
  console.log(directLink);
  console.log('======================================================\n');
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
