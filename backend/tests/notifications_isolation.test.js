const { describe, it } = require('node:test');
const assert = require('node:assert');
const notificationController = require('../controllers/notificationController');
const adminController = require('../controllers/adminController');

describe('Notification Isolation Suite — Targeted Admin & Order Messages', () => {

  it('createSystemNotification strictly forces audience to specific when target_user_id is provided', async () => {
    const fakeUserId = '11111111-1111-4111-8111-111111111111';
    const notif = await notificationController.createSystemNotification({
      title: 'Direct Order Alert',
      message: 'Your artisan order is confirmed',
      target_user_id: fakeUserId,
      target_audience: 'artisans', // even if caller accidentally supplies 'artisans'
    });

    assert.strictEqual(notif.target_user_id, fakeUserId);
    assert.strictEqual(notif.target_audience, 'specific', 'Audience must be forced to "specific" for targeted notifications');
  });

  it('createSystemNotification handles camelCase targetUserId and forces audience to specific', async () => {
    const fakeArtisanUserId = '22222222-2222-4222-8222-222222222222';
    const notif = await notificationController.createSystemNotification({
      title: 'Storefront Verified & Live! 🌟',
      message: 'Your store is live',
      targetUserId: fakeArtisanUserId,
      audience: 'artisan',
    });

    assert.strictEqual(notif.target_user_id, fakeArtisanUserId);
    assert.strictEqual(notif.target_audience, 'specific');
  });

  it('getMyNotifications strictly isolates notifications so only the targeted artisan receives direct admin messages', async () => {
    const artisan1Id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const artisan2Id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const customer1Id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    // Admin sends notification to Artisan 1
    const adminMessageToArtisan1 = await notificationController.createSystemNotification({
      title: 'Admin notice to Artisan 1',
      message: 'Quality check completed for your workshop',
      target_user_id: artisan1Id,
      target_audience: 'specific',
      sender_id: '99999999-9999-4999-8999-999999999999',
    });

    // 1. Artisan 1 requests their notifications
    let artisan1ResData = null;
    await notificationController.getMyNotifications(
      { user: { id: artisan1Id, role: 'artisan' } },
      { json: (d) => { artisan1ResData = d; } }
    );
    const artisan1Ids = (artisan1ResData?.notifications || []).map(n => n.id);
    assert(artisan1Ids.includes(adminMessageToArtisan1.id), 'Artisan 1 must receive their direct admin message');

    // 2. Artisan 2 requests their notifications
    let artisan2ResData = null;
    await notificationController.getMyNotifications(
      { user: { id: artisan2Id, role: 'artisan' } },
      { json: (d) => { artisan2ResData = d; } }
    );
    const artisan2Ids = (artisan2ResData?.notifications || []).map(n => n.id);
    assert(!artisan2Ids.includes(adminMessageToArtisan1.id), 'Artisan 2 must NOT receive Artisan 1 direct admin message');

    // 3. Customer 1 requests their notifications
    let customer1ResData = null;
    await notificationController.getMyNotifications(
      { user: { id: customer1Id, role: 'customer' } },
      { json: (d) => { customer1ResData = d; } }
    );
    const customer1Ids = (customer1ResData?.notifications || []).map(n => n.id);
    assert(!customer1Ids.includes(adminMessageToArtisan1.id), 'Customer 1 must NOT receive Artisan 1 direct admin message');
  });

  it('order notifications are strictly visible to related customer and related artisan only', async () => {
    const customerA = 'caaaaaaa-caaa-4caa-8caa-caaaaaaaaaaa';
    const customerB = 'cbbbbbbb-cbbb-4cbb-8cbb-cbbbbbbbbbbb';
    const artisanRelated = 'adaaaaaa-adaa-4ada-8ada-adaaaaaaaaaa';
    const artisanUnrelated = 'adbbbbbb-adbb-4adb-8adb-adbbbbbbbbbb';

    // Order placed:
    // 1. Notification for customer A
    const custNotif = await notificationController.createSystemNotification({
      title: 'Order #ORD-101 Confirmed! 🎉',
      message: 'Your order has been placed',
      target_user_id: customerA,
      target_audience: 'specific',
    });

    // 2. Notification for related artisan
    const artNotif = await notificationController.createSystemNotification({
      title: '🚨 Action Required: New Order #ORD-101 Needs Confirmation!',
      message: 'Please review and confirm order #ORD-101',
      target_user_id: artisanRelated,
      target_audience: 'specific',
      sender_id: customerA,
    });

    // Verify Customer A sees Customer A notif, but not Customer B
    let custARes = null;
    await notificationController.getMyNotifications(
      { user: { id: customerA, role: 'customer' } },
      { json: (d) => { custARes = d; } }
    );
    const custANotifIds = (custARes?.notifications || []).map(n => n.id);
    assert(custANotifIds.includes(custNotif.id), 'Customer A must see their own order notification');
    assert(!custANotifIds.includes(artNotif.id), 'Customer A must not see the artisan action notification');

    let custBRes = null;
    await notificationController.getMyNotifications(
      { user: { id: customerB, role: 'customer' } },
      { json: (d) => { custBRes = d; } }
    );
    const custBNotifIds = (custBRes?.notifications || []).map(n => n.id);
    assert(!custBNotifIds.includes(custNotif.id), 'Customer B must NOT see Customer A order notification');
    assert(!custBNotifIds.includes(artNotif.id), 'Customer B must NOT see artisan notification');

    // Verify Related Artisan sees their order notification, but Unrelated Artisan does not
    let artRelatedRes = null;
    await notificationController.getMyNotifications(
      { user: { id: artisanRelated, role: 'artisan' } },
      { json: (d) => { artRelatedRes = d; } }
    );
    const artRelatedIds = (artRelatedRes?.notifications || []).map(n => n.id);
    assert(artRelatedIds.includes(artNotif.id), 'Related Artisan must see their order notification');
    assert(!artRelatedIds.includes(custNotif.id), 'Artisan must not receive the customer-side confirmation notification');

    let artUnrelatedRes = null;
    await notificationController.getMyNotifications(
      { user: { id: artisanUnrelated, role: 'artisan' } },
      { json: (d) => { artUnrelatedRes = d; } }
    );
    const artUnrelatedIds = (artUnrelatedRes?.notifications || []).map(n => n.id);
    assert(!artUnrelatedIds.includes(artNotif.id), 'Unrelated Artisan must NOT see other artisan order notification');
    assert(!artUnrelatedIds.includes(custNotif.id), 'Unrelated Artisan must NOT see customer order notification');
  });

  it('adminController.sendNotification rejects non-existent recipient and refuses to broadcast', async () => {
    let statusCode = 200;
    let resBody = null;
    const req = {
      user: { id: '99999999-9999-4999-8999-999999999999', role: 'admin' },
      body: {
        title: 'Important Warning',
        message: 'Direct message to unknown user',
        target_audience: 'specific',
        target_user_id: '00000000-0000-4000-8000-000000000000', // Non-existent user
      }
    };
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (d) => { resBody = d; return res; }
    };

    await adminController.sendNotification(req, res);
    assert.strictEqual(statusCode, 400, 'Must return 400 when specific recipient is not found');
    assert(resBody?.error, 'Must return descriptive error message');
  });

});
