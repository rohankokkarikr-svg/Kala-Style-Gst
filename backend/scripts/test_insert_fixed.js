const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const supabase = require('../config/supabase');

async function testAllTablesWithExactSchema() {
  console.log('🧪 Testing remaining tables with exact schema...');
  const results = {};

  // Fetch an existing user, artisan_profile, product, and order from our previous test
  const { data: user } = await supabase.from('users').select('id').limit(1).single();
  const { data: profile } = await supabase.from('artisan_profiles').select('id').limit(1).single();
  const { data: order } = await supabase.from('orders').select('id').limit(1).single();
  const { data: product } = await supabase.from('products').select('id').limit(1).single();

  console.log('Found existing records:', { userId: user?.id, profileId: profile?.id, orderId: order?.id });

  // 1. artisan_orders
  let artisanOrderId = null;
  try {
    const { data: artOrder, error } = await supabase.from('artisan_orders').insert([{
      order_id: order.id,
      artisan_id: profile.id,
      subtotal: 1999,
      delivery_fee: 0,
      total_amount: 1999,
      status: 'pending'
    }]).select().single();
    if (error) {
      results['artisan_orders'] = { status: 'FAIL', error: error.message };
    } else {
      artisanOrderId = artOrder.id;
      results['artisan_orders'] = { status: 'OK', id: artOrder.id };
    }
  } catch (e) {
    results['artisan_orders'] = { status: 'FAIL', error: e.message };
  }

  // 2. artisan_earnings (requires artisan_order_id)
  if (artisanOrderId) {
    try {
      const { data: earning, error } = await supabase.from('artisan_earnings').insert([{
        artisan_id: profile.id,
        order_id: order.id,
        artisan_order_id: artisanOrderId,
        gross_amount: 1999,
        platform_commission: 199.9,
        delivery_amount: 0,
        net_earning: 1799.1,
        settlement_status: 'pending'
      }]).select().single();
      results['artisan_earnings'] = error ? { status: 'FAIL', error: error.message } : { status: 'OK', id: earning.id };
    } catch (e) {
      results['artisan_earnings'] = { status: 'FAIL', error: e.message };
    }
  }

  // 3. payments
  try {
    const { data: payment, error } = await supabase.from('payments').insert([{
      order_id: order.id,
      method: 'razorpay',
      provider: 'razorpay',
      provider_order_id: 'order_test_123',
      provider_payment_id: 'pay_test_123',
      amount: 1999,
      currency: 'INR',
      status: 'paid',
      signature_verified: true
    }]).select().single();
    results['payments'] = error ? { status: 'FAIL', error: error.message } : { status: 'OK', id: payment.id };
  } catch (e) {
    results['payments'] = { status: 'FAIL', error: e.message };
  }

  // 4. notifications
  try {
    const { data: notif, error } = await supabase.from('notifications').insert([{
      title: 'Order Confirmed',
      message: 'Your artisan handloom order is received!',
      target_audience: 'all',
      target_user_id: user.id,
      is_read: false
    }]).select().single();
    results['notifications'] = error ? { status: 'FAIL', error: error.message } : { status: 'OK', id: notif.id };
  } catch (e) {
    results['notifications'] = { status: 'FAIL', error: e.message };
  }

  // 5. checkout_otp_challenges
  try {
    const { data: ch, error } = await supabase.from('checkout_otp_challenges').insert([{
      user_id: user.id,
      phone_e164: '+919876543210',
      purpose: 'checkout_order_confirmation',
      expires_at: new Date(Date.now() + 600000).toISOString(),
      send_count: 1,
      attempt_count: 0
    }]).select().single();
    results['checkout_otp_challenges'] = error ? { status: 'FAIL', error: error.message } : { status: 'OK', id: ch.id };
  } catch (e) {
    results['checkout_otp_challenges'] = { status: 'FAIL', error: e.message };
  }

  // 6. shipping_shipments
  try {
    const { data: ship, error } = await supabase.from('shipping_shipments').insert([{
      order_id: order.id,
      provider: 'shiprocket',
      status: 'pending',
      pickup_location: 'Home'
    }]).select().single();
    results['shipping_shipments'] = error ? { status: 'FAIL', error: error.message } : { status: 'OK', id: ship.id };
  } catch (e) {
    results['shipping_shipments'] = { status: 'FAIL', error: e.message };
  }

  // 7. whatsapp_notifications
  try {
    const { data: wa, error } = await supabase.from('whatsapp_notifications').insert([{
      order_id: order.id,
      recipient_type: 'customer',
      recipient_number: '9876543210',
      template_name: 'order_confirmed',
      status: 'sent'
    }]).select().single();
    results['whatsapp_notifications'] = error ? { status: 'FAIL', error: error.message } : { status: 'OK', id: wa.id };
  } catch (e) {
    results['whatsapp_notifications'] = { status: 'FAIL', error: e.message };
  }

  // 8. activity_logs
  try {
    const { data: act, error } = await supabase.from('activity_logs').insert([{
      user_id: user.id,
      action: 'LOGIN',
      details: 'User logged into KalaStyle AI'
    }]).select().single();
    results['activity_logs'] = error ? { status: 'FAIL', error: error.message } : { status: 'OK', id: act?.id || 'ok' };
  } catch (e) {
    results['activity_logs'] = { status: 'FAIL', error: e.message };
  }

  // 9. customer_complaints
  try {
    const { data: comp, error } = await supabase.from('customer_complaints').insert([{
      user_id: user.id,
      subject: 'Inquiry on delivery',
      message: 'When will my handloom kurta arrive?',
      status: 'open'
    }]).select().single();
    results['customer_complaints'] = error ? { status: 'FAIL', error: error.message } : { status: 'OK', id: comp?.id || 'ok' };
  } catch (e) {
    results['customer_complaints'] = { status: 'FAIL', error: e.message };
  }

  console.log('\nFINAL RESULTS:');
  console.log(JSON.stringify(results, null, 2));
}

testAllTablesWithExactSchema();
