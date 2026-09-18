/**
 * backend/services/shipping/providers/mockShippingProvider.js
 * ─────────────────────────────────────────────────────────────────
 * High-fidelity Mock Shipping Provider for local development, offline demos,
 * automated testing, and zero-credential environments.
 * Strictly and clearly labels all generated AWBs, labels, and tracking
 * events as [DEMO].
 */

const { SHIPPING_STATUS } = require('../shippingConfig');

class MockShippingProvider {
  constructor() {
    this.name = 'mock';
  }

  async checkServiceability({ pickup_postcode, delivery_postcode, weight = 0.5, cod = false }) {
    const isDelhiOrBangalore = ['110001', '560001', '400001', '600001', '500001', '700001'].includes(delivery_postcode);
    const serviceable = true;

    const couriers = [
      {
        courier_company_id: 'mock_delhivery',
        courier_name: 'Delhivery Surface [DEMO]',
        rate: cod ? 85.0 : 65.0,
        estimated_delivery_days: '2-4 Days',
        cod_available: true,
        rating: 4.8,
        is_surface: true,
      },
      {
        courier_company_id: 'mock_bluedart',
        courier_name: 'Blue Dart Air [DEMO]',
        rate: cod ? 120.0 : 95.0,
        estimated_delivery_days: '1-2 Days',
        cod_available: true,
        rating: 4.9,
        is_surface: false,
      },
      {
        courier_company_id: 'mock_dtdc',
        courier_name: 'DTDC Standard [DEMO]',
        rate: cod ? 75.0 : 55.0,
        estimated_delivery_days: '3-5 Days',
        cod_available: true,
        rating: 4.6,
        is_surface: true,
      },
    ];

    return {
      serviceable,
      delivery_postcode,
      pickup_postcode: pickup_postcode || '560001',
      available_couriers_count: couriers.length,
      lowest_rate: couriers[2].rate,
      cheapest_courier: couriers[2],
      cheapest: couriers[2],
      recommended_courier: couriers[0],
      couriers,
      is_mock: true,
    };
  }

  async createOrder(shipmentData) {
    const randomId = Math.floor(100000 + Math.random() * 900000);
    const providerOrderId = `MOCK-ORD-${randomId}`;
    const providerShipmentId = `MOCK-SHP-${randomId}`;

    return {
      success: true,
      provider_order_id: providerOrderId,
      provider_shipment_id: providerShipmentId,
      status: 'NEW',
      status_code: 1,
      awb_code: null,
      courier_company_id: null,
      courier_name: null,
      is_mock: true,
    };
  }

  async assignAwb({ provider_shipment_id, courier_id }) {
    const randomAwb = Math.floor(1000000000 + Math.random() * 9000000000);
    const awbCode = `DEMO-AWB-${randomAwb}`;
    const courierName = courier_id?.includes('bluedart')
      ? 'Blue Dart Air [DEMO]'
      : 'Delhivery Surface [DEMO]';

    return {
      success: true,
      provider_shipment_id: String(provider_shipment_id),
      awb_code: awbCode,
      courier_company_id: courier_id || 'mock_delhivery',
      courier_name: courierName,
      applied_weight: 0.5,
      routing_code: 'DEL/BOM/01 [DEMO]',
      rto_routing_code: 'BLR/01 [DEMO]',
      is_mock: true,
    };
  }

  async schedulePickup({ provider_shipment_id, pickup_date }) {
    const scheduledDate = pickup_date || new Date().toISOString().split('T')[0];
    return {
      success: true,
      pickup_status: 'SCHEDULED [DEMO]',
      pickup_token_number: `DEMO-TOKEN-${Math.floor(10000 + Math.random() * 90000)}`,
      pickup_scheduled_date: scheduledDate,
      message: 'Pickup scheduled successfully with courier partner [DEMO MODE].',
      is_mock: true,
    };
  }

  async generateLabel(providerShipmentId) {
    return {
      success: true,
      label_url: 'https://shiprocket.co/assets/demo-label.pdf',
      is_created: true,
      is_mock: true,
    };
  }

  async generateInvoice(providerOrderId) {
    return {
      success: true,
      invoice_url: 'https://shiprocket.co/assets/demo-invoice.pdf',
      is_created: true,
      is_mock: true,
    };
  }

  async trackShipment({ awb_code, provider_shipment_id }) {
    const awb = awb_code || `DEMO-AWB-${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const now = new Date();
    const isoHoursAgo = (h) => new Date(now.getTime() - h * 3600000).toISOString();

    const scans = [
      {
        date: isoHoursAgo(2),
        activity: 'Package arrived at sorting facility [DEMO]',
        location: 'Bengaluru Hub',
        sr_status: 'IN TRANSIT',
      },
      {
        date: isoHoursAgo(12),
        activity: 'Package picked up from artisan workshop [DEMO]',
        location: 'KalaStyle Artisan Hub, Channapatna',
        sr_status: 'PICKED UP',
      },
      {
        date: isoHoursAgo(24),
        activity: 'Pickup scheduled with courier [DEMO]',
        location: 'Dispatch Center',
        sr_status: 'PICKUP SCHEDULED',
      },
      {
        date: isoHoursAgo(36),
        activity: 'Air Waybill assigned [DEMO]',
        location: 'System Generated',
        sr_status: 'AWB ASSIGNED',
      },
    ];

    const edd = new Date(now.getTime() + 48 * 3600000).toISOString().split('T')[0];

    return {
      success: true,
      awb_code: awb,
      provider_shipment_id: String(provider_shipment_id || 'MOCK-SHP-123456'),
      courier_name: 'Delhivery Surface [DEMO]',
      raw_status: 'IN TRANSIT',
      normalized_status: SHIPPING_STATUS.IN_TRANSIT,
      is_delivered: false,
      current_location: 'Bengaluru Hub',
      estimated_delivery_date: edd,
      last_update: scans[0].date,
      tracking_url: `https://shiprocket.co/tracking/${awb}`,
      scans,
      milestones: scans.map((s) => ({
        timestamp: s.date,
        activity: s.activity,
        location: s.location,
        status: s.sr_status,
      })),
      is_mock: true,
    };
  }
}

module.exports = new MockShippingProvider();
