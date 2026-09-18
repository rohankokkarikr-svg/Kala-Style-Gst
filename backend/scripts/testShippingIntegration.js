/**
 * Automated Verification Script: Shiprocket Shipping Integration
 * Tests:
 * 1. Provider Resolution & Config
 * 2. PIN Serviceability & Multi-courier Rate Calculation
 * 3. Order Packaging & Shipment Creation
 * 4. Duplicate Shipment Prevention Guard
 * 5. Unverified Prepaid Order Guard
 * 6. AWB Assignment & Courier Allocation
 * 7. Pickup Scheduling
 * 8. Shipping Label & Invoice Generation
 * 9. Real-time Courier Tracking & Milestone Parsing
 * 10. AI Operations Agent Shipping Tools (Level 1 & Level 2)
 */

const { getShippingProvider } = require('../services/shipping/shippingProvider');
const shippingService = require('../services/shipping/shippingService');
const { SHIPPING_STATUS, getActiveProviderType } = require('../services/shipping/shippingConfig');
const { executeTool } = require('../ai/aiToolExecutor');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🚀 KALASTYLE AI — SHIPROCKET SHIPPING INTEGRATION TEST');
  console.log('======================================================\n');

  // Test 1: Provider Selection
  console.log('--- TEST 1: Active Provider Detection ---');
  const providerType = getActiveProviderType();
  console.log(`  Detected Active Provider: [${providerType}]`);
  assert(providerType === 'mock' || providerType === 'shiprocket', 'Provider type is valid');
  const provider = getShippingProvider();
  assert(provider !== null && typeof provider.checkServiceability === 'function', 'Provider instance resolved with interface methods');

  // Test 2: PIN Serviceability
  console.log('\n--- TEST 2: PIN Serviceability & Rate Check ---');
  const servResult = await shippingService.checkServiceability({
    pickup_postcode: '560001',
    delivery_postcode: '110001',
    weight: 0.8,
    cod: false,
    declared_value: 1500,
  });
  assert(servResult.serviceable === true, 'Bangalore to Delhi is serviceable');
  assert(Array.isArray(servResult.couriers) && servResult.couriers.length > 0, 'Returns multiple courier options');
  console.log(`  Found ${servResult.couriers.length} available couriers. Cheapest: ${servResult.cheapest_courier?.courier_name} (₹${servResult.cheapest_courier?.rate})`);

  // Test 3: Unverified Prepaid Order Guard
  console.log('\n--- TEST 3: Unverified Prepaid Order Security Guard ---');
  const unverifiedPrepaidOrder = {
    id: 'test-order-unverified-123',
    user_id: 'cust-1',
    total_amount: 1200,
    payment_method: 'prepaid',
    payment_status: 'pending', // NOT paid
    status: 'pending',
    shipping_address: '123 MG Road, Bengaluru, Karnataka 560001',
    shipping_city: 'Bengaluru',
    shipping_state: 'Karnataka',
    shipping_pincode: '560001',
    phone: '9876543210',
    users: { name: 'Rohan Sharma', email: 'rohan@example.com' },
    items: [{ id: 'item-1', product_name_snapshot: 'Handmade Silk Shawl', quantity: 1, unit_price_snapshot: 1200 }],
  };

  let prepaidBlocked = false;
  try {
    await shippingService.createShipmentFromOrder(unverifiedPrepaidOrder);
  } catch (err) {
    prepaidBlocked = true;
    assert(err.message.includes('paid'), `Prepaid order blocked successfully: "${err.message}"`);
  }
  assert(prepaidBlocked, 'Unverified prepaid order correctly blocked from shipment creation');

  // Test 4: Shipment Creation for Verified Order
  console.log('\n--- TEST 4: Shipment Creation for Verified Order ---');
  const validOrder = {
    id: 'order-test-verified-999',
    order_number: 'KALA-999',
    user_id: 'cust-2',
    total_amount: 2450,
    payment_method: 'prepaid',
    payment_status: 'paid',
    status: 'confirmed',
    shipping_address: '45 Lake View Colony, Indiranagar, Bengaluru, Karnataka 560038',
    shipping_city: 'Bengaluru',
    shipping_state: 'Karnataka',
    shipping_pincode: '560038',
    phone: '9123456780',
    users: { name: 'Aarav Patel', email: 'aarav@example.com' },
    items: [
      { id: 'i-1', product_name_snapshot: 'Terracotta Vase', quantity: 1, unit_price_snapshot: 1450, weight_kg: 1.2 },
      { id: 'i-2', product_name_snapshot: 'Brass Diya', quantity: 2, unit_price_snapshot: 500, weight_kg: 0.4 },
    ],
  };

  const createRes = await shippingService.createShipmentFromOrder(validOrder);
  assert(createRes.success === true, 'Shipment created successfully');
  assert(createRes.shipment.id !== undefined, 'Shipment record has a UUID ID');
  assert(createRes.shipment.status === SHIPPING_STATUS.READY_TO_SHIP, `Status is READY_TO_SHIP (got: ${createRes.shipment.status})`);
  const shipmentId = createRes.shipment.id;

  // Test 5: Idempotency / Duplicate Shipment Guard
  console.log('\n--- TEST 5: Duplicate Shipment Prevention Guard ---');
  const duplicateRes = await shippingService.createShipmentFromOrder(validOrder);
  assert(duplicateRes.already_exists === true, 'Detected existing shipment and did not create duplicate');
  assert(duplicateRes.shipment.id === shipmentId, 'Returns existing shipment ID');

  // Test 6: AWB Assignment
  console.log('\n--- TEST 6: AWB & Courier Assignment ---');
  const awbRes = await shippingService.assignAWB(shipmentId);
  assert(awbRes.success === true, 'AWB assigned successfully');
  assert(typeof awbRes.awb_code === 'string' && awbRes.awb_code.length > 5, `Generated AWB: ${awbRes.awb_code}`);
  assert(awbRes.courier_name !== undefined, `Allocated courier: ${awbRes.courier_name}`);
  assert(awbRes.shipment.status === SHIPPING_STATUS.AWB_ASSIGNED, `Status updated to AWB_ASSIGNED`);

  // Test 7: Pickup Scheduling
  console.log('\n--- TEST 7: Pickup Scheduling ---');
  const pickupRes = await shippingService.schedulePickup(shipmentId);
  assert(pickupRes.success === true, 'Pickup scheduled successfully');
  assert(pickupRes.shipment.status === SHIPPING_STATUS.PICKUP_SCHEDULED, `Status updated to PICKUP_SCHEDULED`);

  // Test 8: Label & Invoice Generation
  console.log('\n--- TEST 8: Label & Invoice Generation ---');
  const labelRes = await shippingService.generateShippingLabel(shipmentId);
  assert(labelRes.success === true && typeof labelRes.label_url === 'string', `Label URL generated: ${labelRes.label_url}`);
  const invoiceRes = await shippingService.generateShippingInvoice(shipmentId);
  assert(invoiceRes.success === true && typeof invoiceRes.invoice_url === 'string', `Invoice URL generated: ${invoiceRes.invoice_url}`);

  // Test 9: Live Tracking
  console.log('\n--- TEST 9: Tracking & Milestone Normalization ---');
  const trackingRes = await shippingService.trackShipment(shipmentId);
  const milestones = trackingRes.milestones || trackingRes.tracking?.milestones;
  const normalizedStatus = trackingRes.normalized_status || trackingRes.tracking?.normalized_status;
  assert(Array.isArray(milestones), 'Tracking contains milestones array');
  console.log(`  Tracking status: ${normalizedStatus} (Courier: ${trackingRes.courier_name || trackingRes.tracking?.courier_name})`);

  // Test 10: Shipping Statistics
  console.log('\n--- TEST 10: Shipping KPI & Operations Statistics ---');
  const statsRes = await shippingService.getShippingStatistics();
  assert(statsRes.total_shipments >= 1, `Total shipments metric tracked: ${statsRes.total_shipments}`);
  assert(statsRes.provider_mode === providerType, `Provider mode reflected in statistics: ${statsRes.provider_mode}`);

  // Test 11: AI Operations Agent Shipping Tools Integration
  console.log('\n--- TEST 11: AI Operations Agent Shipping Tools ---');

  // Tool 11a: check_shipping_serviceability
  const aiTool1Res = await executeTool('check_shipping_serviceability', {
    pickup_pincode: '560001',
    delivery_pincode: '400001',
    weight_kg: 1.0,
    cod: false,
  });
  const aiTool1 = aiTool1Res.data || aiTool1Res;
  assert(aiTool1.serviceable === true, 'AI tool check_shipping_serviceability executed cleanly');

  // Tool 11b: calculate_shipping_rate
  const aiTool2Res = await executeTool('calculate_shipping_rate', {
    pickup_pincode: '560001',
    delivery_pincode: '400001',
    weight_kg: 1.5,
    declared_value: 2000,
  });
  const aiTool2 = aiTool2Res.data || aiTool2Res;
  assert(aiTool2.cheapest !== undefined || aiTool2.cheapest_courier !== undefined || aiTool2.lowest_rate !== undefined, 'AI tool calculate_shipping_rate returned courier quote');

  // Tool 11c: track_shipment
  const aiTool3Res = await executeTool('track_shipment', {
    shipment_id: shipmentId,
  });
  const aiTool3 = aiTool3Res.data || aiTool3Res;
  assert(aiTool3.normalized_status !== undefined || aiTool3.status !== undefined, 'AI tool track_shipment executed successfully');

  // Tool 11d: get_shipping_statistics
  const aiTool4Res = await executeTool('get_shipping_statistics', {});
  const aiTool4 = aiTool4Res.data || aiTool4Res;
  assert(aiTool4.total_shipments !== undefined, 'AI tool get_shipping_statistics executed successfully');

  console.log('\n======================================================');
  console.log(`🏁 TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  if (passedTests === totalTests) {
    console.log('🎉 ALL SHIPPING INTEGRATION TESTS PASSED PERFECTLY!');
  } else {
    console.log('⚠️ Some tests failed. Check logs above.');
  }
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
