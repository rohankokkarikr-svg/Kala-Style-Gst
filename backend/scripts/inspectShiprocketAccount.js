/**
 * Diagnostic & Inspection Script: Shiprocket Live Account Data
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const { getShiprocketToken } = require('../services/shipping/providers/shiprocket/shiprocketAuth');

async function inspectAccount() {
  console.log('\n======================================================');
  console.log('🔍 SHIPROCKET LIVE ACCOUNT INSPECTION');
  console.log('======================================================');

  console.log(`Configured Email: ${process.env.SHIPROCKET_EMAIL}`);
  console.log(`Configured API Base: ${process.env.SHIPROCKET_API_URL || 'https://apiv2.shiprocket.in/v1/external'}`);

  // 1. Authenticate & Obtain JWT Token
  console.log('\n1. Authenticating with Shiprocket API...');
  let token;
  try {
    token = await getShiprocketToken();
    console.log('✅ Authentication SUCCESSFUL!');
    console.log(`   Token (first 25 chars): ${token.substring(0, 25)}...`);
  } catch (err) {
    console.error('❌ Authentication FAILED:', err.message);
    if (err.response) {
      console.error('   Status:', err.response.status);
      console.error('   Response Data:', JSON.stringify(err.response.data, null, 2));
    }
    return;
  }

  const client = axios.create({
    baseURL: process.env.SHIPROCKET_API_URL || 'https://apiv2.shiprocket.in/v1/external',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    timeout: 15000,
  });

  // 2. Pickup Locations
  console.log('\n2. Fetching Registered Pickup Locations...');
  try {
    const pickupRes = await client.get('/settings/company/pickup');
    const pickupData = pickupRes.data?.data?.shipping_address || pickupRes.data?.data || pickupRes.data;
    console.log('✅ Pickup Locations Retrieved:');
    if (Array.isArray(pickupData)) {
      pickupData.forEach((loc, idx) => {
        console.log(`   [${idx + 1}] Nickname: "${loc.pickup_location}"`);
        console.log(`       Name: ${loc.name || loc.company_name || 'N/A'}`);
        console.log(`       Address: ${loc.address || ''}, ${loc.city || ''}, ${loc.state || ''} - ${loc.pin_code || ''}`);
        console.log(`       Phone: ${loc.phone || 'N/A'}, Status: ${loc.status === 1 || loc.status === '1' ? 'Active' : loc.status}`);
      });
    } else {
      console.log('   Raw Pickup Data:', JSON.stringify(pickupData, null, 2));
    }
  } catch (err) {
    console.warn('⚠️ Could not fetch pickup locations:', err.response?.data?.message || err.message);
  }

  // 3. Wallet Balance & Account Information
  console.log('\n3. Fetching Wallet Balance / Account Details...');
  try {
    // Check wallet balance endpoint
    const walletRes = await client.get('/wallet/balance');
    console.log('✅ Wallet Balance:', JSON.stringify(walletRes.data, null, 2));
  } catch (err) {
    // Try alternate account info endpoint
    try {
      const userRes = await client.get('/users/details');
      console.log('✅ User Profile Details:', JSON.stringify(userRes.data, null, 2));
    } catch (e) {
      console.warn('⚠️ Wallet / User details endpoint notice:', err.response?.data?.message || err.message);
    }
  }

  // 4. Enabled Couriers & Serviceability Check
  console.log('\n4. Testing Live Serviceability & Rates (Bengaluru 560001 -> Delhi 110001)...');
  try {
    const servRes = await client.get('/courier/serviceability', {
      params: {
        pickup_postcode: '560001',
        delivery_postcode: '110001',
        weight: '0.5',
        cod: '0',
      },
    });
    const couriers = servRes.data?.data?.available_courier_companies || [];
    console.log(`✅ Available Couriers: ${couriers.length} partners found!`);
    couriers.slice(0, 5).forEach((c, idx) => {
      console.log(`   [${idx + 1}] ${c.courier_name} (ID: ${c.courier_company_id})`);
      console.log(`       Rate: ₹${c.rate} | Est. Delivery: ${c.etd || c.estimated_delivery_days || '2-4 Days'}`);
      console.log(`       COD Supported: ${c.cod === 1 ? 'Yes' : 'No'} | Rating: ${c.rating || 'N/A'}`);
    });
  } catch (err) {
    console.warn('⚠️ Serviceability check notice:', err.response?.data?.message || err.message);
  }

  // 5. Existing Orders in Shiprocket
  console.log('\n5. Fetching Recent Shiprocket Orders...');
  try {
    const ordersRes = await client.get('/orders', {
      params: {
        per_page: 5,
        page: 1,
      },
    });
    const orderList = ordersRes.data?.data || [];
    console.log(`✅ Found ${orderList.length} recent orders in Shiprocket account:`);
    orderList.forEach((ord, idx) => {
      console.log(`   [${idx + 1}] Order #${ord.id || ord.order_id} (Channel: ${ord.channel_order_id || 'Direct'})`);
      console.log(`       Customer: ${ord.customer_name}, Status: ${ord.status}`);
      console.log(`       AWB: ${ord.awb_code || 'None'}, Courier: ${ord.courier_name || 'Unassigned'}`);
    });
  } catch (err) {
    console.warn('⚠️ Orders check notice:', err.response?.data?.message || err.message);
  }

  console.log('\n======================================================');
  console.log('🏁 INSPECTION COMPLETE');
  console.log('======================================================\n');
}

inspectAccount().catch(console.error);
