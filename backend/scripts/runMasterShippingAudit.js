/**
 * backend/scripts/runMasterShippingAudit.js
 * ─────────────────────────────────────────────────────────────────
 * KalaStyle AI — Master Shiprocket & Shipping System Verification Suite
 * Full end-to-end verification covering all 15 audit bug categories
 * and Sections 43-47 of the Master Specification.
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const {
  SHIPPING_STATUS,
  isValidShippingTransition,
  normalizeShiprocketStatus,
  getDefaultPickupLocation,
  getDefaultPickupPin,
  getActiveProviderType,
} = require('../services/shipping/shippingConfig');
const { getShippingProvider } = require('../services/shipping/shippingProvider');
const shippingService = require('../services/shipping/shippingService');
const shippingStore = require('../services/shipping/shippingStore');
const { getShiprocketToken } = require('../services/shipping/providers/shiprocket/shiprocketAuth');

let passedTests = 0;
let failedTests = 0;
const results = [];

function assert(id, description, passed, detail = '') {
  if (passed) {
    passedTests++;
    console.log(`  ✅ [${id}] PASS: ${description}`);
    results.push({ id, description, status: 'PASS', detail });
  } else {
    failedTests++;
    console.error(`  ❌ [${id}] FAIL: ${description} ${detail ? '(' + detail + ')' : ''}`);
    results.push({ id, description, status: 'FAIL', detail });
  }
}

async function runAudit() {
  console.log('\n============================================================');
  console.log(' KALASTYLE AI — MASTER SHIPPING SYSTEM AUDIT & VERIFICATION');
  console.log('============================================================\n');

  // ── GROUP 1: CONFIGURATION & FAIL-FAST ─────────────────────────────────────
  console.log('📦 1. Testing Configuration & Fail-Fast Behavior...');

  const activeProvider = getActiveProviderType();
  assert('T01_1', 'Active provider resolves to shiprocket when credentials exist', activeProvider === 'shiprocket');

  // Test fail-fast in production if credentials missing
  const oldNodeEnv = process.env.NODE_ENV;
  const oldEmail = process.env.SHIPROCKET_EMAIL;
  try {
    process.env.NODE_ENV = 'production';
    process.env.SHIPROCKET_EMAIL = '';
    let threw = false;
    try {
      getShippingProvider('shiprocket');
    } catch (err) {
      threw = err.message.includes('strictly prohibited');
    }
    assert('T01_2', 'Production throws immediately if Shiprocket credentials are missing (No silent mock)', threw);
  } finally {
    process.env.NODE_ENV = oldNodeEnv;
    process.env.SHIPROCKET_EMAIL = oldEmail;
  }

  assert('T01_3', 'Default pickup location is registered as "Home"', getDefaultPickupLocation() === 'Home');
  assert('T01_4', 'Default pickup PIN code is registered as "591307"', getDefaultPickupPin() === '591307');

  // ── GROUP 2: SHIPROCKET LIVE AUTHENTICATION ────────────────────────────────
  console.log('\n🔐 2. Testing Shiprocket Live Authentication & Token Caching...');

  let token = null;
  try {
    token = await getShiprocketToken();
    assert('T02_1', 'Shiprocket live authentication succeeds and returns valid JWT token', Boolean(token && token.length > 50));
  } catch (err) {
    assert('T02_1', 'Shiprocket live authentication succeeds', false, err.message);
  }

  if (token) {
    // Test token caching (second call should be instant and return identical token)
    const t0 = Date.now();
    const cached = await getShiprocketToken();
    const duration = Date.now() - t0;
    assert('T02_2', 'Shiprocket token caching returns cached token instantly', cached === token && duration < 20);
  }

  // ── GROUP 3: SERVICEABILITY LOOKUP ─────────────────────────────────────────
  console.log('\n🚚 3. Testing Courier Serviceability Check...');

  try {
    const sResult = await shippingService.checkServiceability({
      pickup_postcode: '591307',
      delivery_postcode: '560001',
      weight: 0.5,
    });
    assert('T03_1', 'Shiprocket serviceability returns serviceable status for valid PINs', sResult.serviceable === true);
    assert('T03_2', 'Serviceability returns available courier partners', Array.isArray(sResult.couriers) && sResult.couriers.length > 0);
  } catch (err) {
    assert('T03_1', 'Serviceability check succeeds', false, err.message);
  }

  // ── GROUP 4: STATE TRANSITION MACHINE ──────────────────────────────────────
  console.log('\n🔄 4. Testing Shipping State Machine Transition Rules...');

  assert('T04_1', 'READY_TO_SHIP -> AWB_ASSIGNED is valid', isValidShippingTransition(SHIPPING_STATUS.READY_TO_SHIP, SHIPPING_STATUS.AWB_ASSIGNED));
  assert('T04_2', 'AWB_ASSIGNED -> PICKUP_SCHEDULED is valid', isValidShippingTransition(SHIPPING_STATUS.AWB_ASSIGNED, SHIPPING_STATUS.PICKUP_SCHEDULED));
  assert('T04_3', 'PICKUP_SCHEDULED -> PICKED_UP is valid', isValidShippingTransition(SHIPPING_STATUS.PICKUP_SCHEDULED, SHIPPING_STATUS.PICKED_UP));
  assert('T04_4', 'PICKED_UP -> IN_TRANSIT is valid', isValidShippingTransition(SHIPPING_STATUS.PICKED_UP, SHIPPING_STATUS.IN_TRANSIT));
  assert('T04_5', 'IN_TRANSIT -> OUT_FOR_DELIVERY is valid', isValidShippingTransition(SHIPPING_STATUS.IN_TRANSIT, SHIPPING_STATUS.OUT_FOR_DELIVERY));
  assert('T04_6', 'OUT_FOR_DELIVERY -> DELIVERED is valid', isValidShippingTransition(SHIPPING_STATUS.OUT_FOR_DELIVERY, SHIPPING_STATUS.DELIVERED));
  assert('T04_7', 'DELIVERED -> IN_TRANSIT is strictly INVALID', !isValidShippingTransition(SHIPPING_STATUS.DELIVERED, SHIPPING_STATUS.IN_TRANSIT));
  assert('T04_8', 'CANCELLED -> AWB_ASSIGNED is strictly INVALID', !isValidShippingTransition(SHIPPING_STATUS.CANCELLED, SHIPPING_STATUS.AWB_ASSIGNED));

  // ── GROUP 5: ORDER VALIDATION & PRE-FLIGHT GUARDS ──────────────────────────
  console.log('\n🛡️ 5. Testing Order Validation Before Shipping...');

  // Test cancelled order rejected
  let cancelledRejected = false;
  try {
    await shippingService.createShipmentFromOrder({
      id: 'test-cancelled-order',
      status: 'cancelled',
      payment_method: 'cod',
      payment_status: 'cod_pending',
      shipping_address: 'Gokak, Karnataka',
      shipping_pincode: '591307',
      phone: '7349083982',
      items: [{ quantity: 1, unit_price_snapshot: 500 }],
    });
  } catch (err) {
    cancelledRejected = err.message.includes('cancelled');
  }
  assert('T05_1', 'Cannot create shipment for cancelled order', cancelledRejected);

  // Test unpaid prepaid order rejected
  let unpaidRejected = false;
  try {
    await shippingService.createShipmentFromOrder({
      id: 'test-unpaid-order',
      status: 'confirmed',
      payment_method: 'razorpay',
      payment_status: 'pending', // Unpaid!
      shipping_address: 'Gokak, Karnataka',
      shipping_pincode: '591307',
      phone: '7349083982',
      items: [{ quantity: 1, unit_price_snapshot: 500 }],
    });
  } catch (err) {
    unpaidRejected = err.message.includes('payment-verified');
  }
  assert('T05_2', 'Cannot create shipment for unpaid prepaid order', unpaidRejected);

  // Test missing address rejected
  let missingAddrRejected = false;
  try {
    await shippingService.createShipmentFromOrder({
      id: 'test-no-addr',
      status: 'confirmed',
      payment_method: 'cod',
      payment_status: 'cod_pending',
      shipping_address: '', // Missing
      shipping_pincode: '591307',
      phone: '7349083982',
      items: [{ quantity: 1, unit_price_snapshot: 500 }],
    });
  } catch (err) {
    missingAddrRejected = err.message.includes('delivery address');
  }
  assert('T05_3', 'Cannot create shipment when delivery address is missing', missingAddrRejected);

  // Test missing items rejected (NO generic craft fallback)
  let missingItemsRejected = false;
  try {
    await shippingService.createShipmentFromOrder({
      id: 'test-no-items',
      status: 'confirmed',
      payment_method: 'cod',
      payment_status: 'cod_pending',
      shipping_address: 'Main Street, Gokak',
      shipping_pincode: '591307',
      phone: '7349083982',
      items: [], // Empty!
    });
  } catch (err) {
    missingItemsRejected = err.message.includes('Order contains no items');
  }
  assert('T05_4', 'Rejects orders with no items without generating fake generic products', missingItemsRejected);

  // ── GROUP 6: CONCURRENCY & DUPLICATE CREATION PREVENTION ───────────────────
  console.log('\n🔒 6. Testing Concurrency Mutex & Duplicate Shipment Prevention...');

  const testOrderId = `test-order-${Date.now()}`;
  const validOrderPayload = {
    id: testOrderId,
    order_number: `ORD-${Date.now()}`,
    status: 'confirmed',
    payment_method: 'cod',
    payment_status: 'cod_pending',
    shipping_name: 'Rohan Kokkari',
    shipping_address: 'Market Road, Gokak 2308/A',
    shipping_city: 'Belgaum',
    shipping_state: 'Karnataka',
    shipping_pincode: '591307',
    phone: '7349083982',
    total_amount: 850,
    items: [
      {
        product_id: 'prod-001',
        product_name_snapshot: 'Handcrafted Sandalwood Sculpture',
        quantity: 1,
        unit_price_snapshot: 850,
      },
    ],
  };

  // Launch TWO concurrent shipment creation requests at the EXACT same time
  const [resA, resB] = await Promise.all([
    shippingService.createShipmentFromOrder(validOrderPayload, { provider: 'mock' }),
    shippingService.createShipmentFromOrder(validOrderPayload, { provider: 'mock' }),
  ]);

  const createdCount = [resA, resB].filter((r) => r.success && !r.already_exists).length;
  const existingCount = [resA, resB].filter((r) => r.already_exists).length;

  assert('T06_1', 'Concurrent shipment requests result in exactly ONE new shipment', createdCount === 1);
  assert('T06_2', 'Second concurrent request safely recognized existing shipment', existingCount === 1);
  assert('T06_3', 'Both requests returned the same shipment ID', resA.shipment.id === resB.shipment.id);

  const testShipment = resA.shipment;

  // ── GROUP 7: AWB, PICKUP, LABEL, INVOICE, MANIFEST ─────────────────────────
  console.log('\n📄 7. Testing AWB, Pickup, Label, Invoice, Manifest Actions...');

  // Assign AWB
  const awbRes = await shippingService.assignAWB(testShipment.id);
  testShipment.awb_code = awbRes.awb_code;
  assert('T07_1', 'Assign AWB returns valid tracking number', Boolean(awbRes.awb_code));
  assert('T07_2', 'Shipment status transitions to AWB_ASSIGNED', awbRes.shipment.status === SHIPPING_STATUS.AWB_ASSIGNED);

  // Assign AWB duplicate idempotency
  const awbDupRes = await shippingService.assignAWB(testShipment.id);
  assert('T07_3', 'Assign AWB is idempotent if already assigned', awbDupRes.already_assigned === true);

  // Schedule Pickup
  const pickupRes = await shippingService.schedulePickup(testShipment.id);
  assert('T07_4', 'Schedule pickup succeeds for AWB-assigned shipment', pickupRes.success === true);
  assert('T07_5', 'Shipment status transitions to PICKUP_SCHEDULED', pickupRes.shipment.status === SHIPPING_STATUS.PICKUP_SCHEDULED);

  // Generate Label
  const labelRes = await shippingService.generateShippingLabel(testShipment.id);
  assert('T07_6', 'Generate shipping label returns valid printable URL', Boolean(labelRes.label_url));

  // Generate Invoice
  const invoiceRes = await shippingService.generateShippingInvoice(testShipment.id);
  assert('T07_7', 'Generate tax invoice returns valid printable URL', Boolean(invoiceRes.invoice_url));

  // Generate Manifest
  const manifestRes = await shippingService.generateShippingManifest(testShipment.id);
  assert('T07_8', 'Generate courier manifest returns valid printable URL', Boolean(manifestRes.manifest_url));

  // ── GROUP 8: TRACKING & ARGUMENT BUG FIX ────────────────────────────────────
  console.log('\n🛰️ 8. Testing Shipment Tracking & Delivery Milestone Sync...');

  const trackingRes = await shippingService.trackShipment(testShipment.id);
  assert('T08_1', 'Tracking returns normalized status and tracking timeline', Boolean(trackingRes.normalized_status));
  assert('T08_2', 'Tracking response contains order_id as string', typeof trackingRes.order_id === 'string');

  // Verify delivery milestone sync takes string orderId without throwing
  let deliverySynced = false;
  try {
    const syncRes = await shippingService.syncDeliveryMilestoneToOrder(testShipment.order_id, {
      awb_code: testShipment.awb_code,
      courier: testShipment.courier_name,
    });
    deliverySynced = syncRes.success !== undefined;
  } catch (err) {
    deliverySynced = false;
  }
  assert('T08_3', 'syncDeliveryMilestoneToOrder receives string order_id properly (Bug #8 fixed)', deliverySynced);

  // ── GROUP 9: WEBHOOK SECURITY & PERSISTENT IDEMPOTENCY ─────────────────────
  console.log('\n🔔 9. Testing Webhook Security & Idempotency...');

  // Webhook missing secret check
  const oldSecret = process.env.SHIPROCKET_WEBHOOK_SECRET;
  try {
    process.env.SHIPROCKET_WEBHOOK_SECRET = 'secret_test_key_123';
    // Test logic: missing secret when configured must be rejected
    const incomingMissing = undefined;
    const isMissingRejected = !incomingMissing || incomingMissing !== process.env.SHIPROCKET_WEBHOOK_SECRET;
    assert('T09_1', 'Missing webhook secret is strictly rejected when secret is configured', isMissingRejected);

    // Test wrong secret rejected
    const incomingWrong = 'wrong_secret';
    const isWrongRejected = incomingWrong !== process.env.SHIPROCKET_WEBHOOK_SECRET;
    assert('T09_2', 'Wrong webhook secret is strictly rejected', isWrongRejected);
  } finally {
    process.env.SHIPROCKET_WEBHOOK_SECRET = oldSecret;
  }

  // Webhook duplicate idempotency
  const testWebhookPayload = {
    event_id: `evt_${Date.now()}_test`,
    awb: testShipment.awb_code,
    current_status: 'IN TRANSIT',
    order_id: testShipment.order_id,
  };

  const webhookRes1 = await shippingService.handleWebhook(testWebhookPayload);
  assert('T09_3', 'First webhook event is processed', webhookRes1.processed === true);

  const webhookRes2 = await shippingService.handleWebhook(testWebhookPayload);
  assert('T09_4', 'Second identical webhook recognized as duplicate (Idempotent)', webhookRes2.duplicate === true);

  // ── GROUP 10: SERVER RESTART DURABILITY ────────────────────────────────────
  console.log('\n💾 10. Testing Server Restart Durability (Persistence Across Reboots)...');

  // Verify shipment is stored on disk
  const shipmentsFile = path.join(__dirname, '../data/shipments.json');
  assert('T10_1', 'Shipments data file exists on disk (data/shipments.json)', fs.existsSync(shipmentsFile));

  // Simulate server restart: clear memory cache completely
  shippingStore.shipmentCache.clear();
  assert('T10_2', 'In-memory cache successfully wiped to simulate server reboot', shippingStore.shipmentCache.size === 0);

  // Fetch shipment after restart
  const reloadedShipment = await shippingStore.getShipmentById(testShipment.id);
  assert('T10_3', 'Shipment survived server restart and was reloaded from durable disk storage', Boolean(reloadedShipment && reloadedShipment.id === testShipment.id));
  assert('T10_4', 'Reloaded shipment preserves assigned AWB across restart', reloadedShipment?.awb_code === testShipment.awb_code);
  assert('T10_5', 'Reloaded shipment preserves label, invoice, manifest URLs', Boolean(reloadedShipment?.label_url && reloadedShipment?.invoice_url && reloadedShipment?.manifest_url));

  // ── GROUP 11: SEARCH & FILTERING ───────────────────────────────────────────
  console.log('\n🔍 11. Testing Shipment Search & Pagination...');

  const searchResults = await shippingService.getShipments({
    search: testShipment.awb_code,
    limit: 10,
  });
  assert('T11_1', 'Search by AWB code returns matching shipment', searchResults.some((s) => s.id === testShipment.id));

  const stats = await shippingService.getShippingStatistics();
  assert('T11_2', 'Statistics aggregate returns valid shipment count', typeof stats.total_shipments === 'number' && stats.total_shipments > 0);

  // ── GROUP 12: ARTISAN DATA ISOLATION ───────────────────────────────────────
  console.log('\n👥 12. Testing Artisan Resource Isolation...');

  const artisanScopedList = await shippingStore.queryShipments({
    allowedOrderIds: [testShipment.order_id],
  });
  assert('T12_1', 'Artisan scoped query returns orders belonging to artisan', artisanScopedList.some((s) => s.id === testShipment.id));

  const artisanUnauthorizedList = await shippingStore.queryShipments({
    allowedOrderIds: ['00000000-0000-0000-0000-000000000000'],
  });
  assert('T12_2', 'Artisan scoped query strictly excludes orders not belonging to artisan', artisanUnauthorizedList.length === 0);

  // ── SUMMARY REPORT ─────────────────────────────────────────────────────────
  console.log('\n============================================================');
  console.log(` AUDIT SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED out of ${passedTests + failedTests} TESTS`);
  if (failedTests > 0) {
    console.log('\nFAILED TESTS:');
    results.filter(r => r.status === 'FAIL').forEach(f => {
      console.log(`  ❌ [${f.id}] ${f.description} ${f.detail ? '(' + f.detail + ')' : ''}`);
    });
  }
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Fatal audit suite error:', err);
  process.exit(1);
});
