/**
 * backend/services/shipping/providers/shiprocket/shiprocketOrders.js
 * ─────────────────────────────────────────────────────────────────
 * Shiprocket order and shipment creation.
 */

const { request } = require('./shiprocketClient');
const {
  getDefaultPickupLocation,
  getDefaultWeight,
  getDefaultLength,
  getDefaultBreadth,
  getDefaultHeight,
} = require('../../shippingConfig');

/**
 * Format a Date object to 'YYYY-MM-DD HH:mm' expected by Shiprocket.
 */
function formatShiprocketDate(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const mins = pad(date.getMinutes());
  return `${year}-${month}-${day} ${hours}:${mins}`;
}

/**
 * Create a new shipment order in Shiprocket.
 *
 * @param {object} shipmentData
 * @param {string} shipmentData.order_id KalaStyle master order ID
 * @param {string} shipmentData.order_number KalaStyle human-readable order number (e.g. KALA-202612345)
 * @param {string} [shipmentData.order_date] ISO order date
 * @param {string} [shipmentData.pickup_location] Registered pickup location name
 * @param {string} shipmentData.billing_customer_name Customer full name
 * @param {string} shipmentData.billing_address Customer street address
 * @param {string} shipmentData.billing_city Customer city
 * @param {string} shipmentData.billing_pincode Customer postal PIN code
 * @param {string} shipmentData.billing_state Customer state
 * @param {string} shipmentData.billing_phone Customer phone number
 * @param {string} [shipmentData.billing_email] Customer email
 * @param {'COD'|'Prepaid'} shipmentData.payment_method Payment method
 * @param {number} shipmentData.subtotal Order subtotal
 * @param {Array<object>} shipmentData.order_items Items [{ name, sku, units, selling_price }]
 * @param {number} [shipmentData.weight] Package weight in kg
 * @param {number} [shipmentData.length] Package length in cm
 * @param {number} [shipmentData.breadth] Package breadth in cm
 * @param {number} [shipmentData.height] Package height in cm
 * @returns {Promise<object>} Created Shiprocket shipment response
 */
async function createOrder(shipmentData) {
  if (!shipmentData.order_number) {
    throw new Error('order_number is required to create a Shiprocket order.');
  }

  const orderItems = (shipmentData.order_items || []).map((item, idx) => ({
    name: item.name || `Craft Item ${idx + 1}`,
    sku: item.sku || `SKU-${idx + 1}`,
    units: parseInt(item.units || item.quantity, 10) || 1,
    selling_price: parseFloat(item.selling_price || item.unit_price) || 100,
    discount: item.discount || 0,
    tax: item.tax || 0,
  }));

function sanitizeAddress(addrStr) {
  if (!addrStr) return { address: 'Artisan Delivery Address', address_2: '' };
  let cleaned = String(addrStr)
    .replace(/📍\s*Live Location:[^\n,]*/gi, '')
    .replace(/https?:\/\/[^\s,]+/gi, '')
    .replace(/[^\x20-\x7E\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  cleaned = cleaned.replace(/(,\s*)+/g, ', ').replace(/^,\s*|,\s*$/g, '');
  if (!cleaned) cleaned = 'Artisan Delivery Address';

  const address = cleaned.substring(0, 90).trim();
  const address_2 = cleaned.length > 90 ? cleaned.substring(90, 180).trim() : '';
  return { address, address_2 };
}

  const { address, address_2 } = sanitizeAddress(shipmentData.billing_address);

  const payload = {
    order_id: shipmentData.order_number,
    order_date: formatShiprocketDate(shipmentData.order_date),
    pickup_location: shipmentData.pickup_location || getDefaultPickupLocation(),
    billing_customer_name: (shipmentData.billing_customer_name || 'Customer').substring(0, 50),
    billing_last_name: '',
    billing_address: address,
    billing_address_2: address_2,
    billing_city: shipmentData.billing_city || 'City',
    billing_pincode: String(shipmentData.billing_pincode || '').trim(),
    billing_state: shipmentData.billing_state || 'State',
    billing_country: 'India',
    billing_email: shipmentData.billing_email || 'order@kalastyle.com',
    billing_phone: String(shipmentData.billing_phone || '9999999999').replace(/[^0-9]/g, '').slice(-10),
    shipping_is_billing: true,
    order_items: orderItems,
    payment_method: shipmentData.payment_method === 'COD' ? 'COD' : 'Prepaid',
    sub_total: parseFloat(shipmentData.subtotal || shipmentData.total_amount) || 100,
    length: parseFloat(shipmentData.length) || getDefaultLength(),
    breadth: parseFloat(shipmentData.breadth) || getDefaultBreadth(),
    height: parseFloat(shipmentData.height) || getDefaultHeight(),
    weight: parseFloat(shipmentData.weight) || getDefaultWeight(),
  };

  try {
    let response = await request({
      method: 'POST',
      path: '/orders/create/adhoc',
      data: payload,
    });

    // Auto-heal if Shiprocket returned a list of valid pickup locations
    if (response?.message && response.message.toLowerCase().includes('wrong pickup location') && response?.data?.data?.[0]?.pickup_location) {
      const validPickup = response.data.data[0].pickup_location;
      console.log(`ℹ️ [Shiprocket] Auto-recovering pickup location: using registered location "${validPickup}"`);
      payload.pickup_location = validPickup;
      response = await request({
        method: 'POST',
        path: '/orders/create/adhoc',
        data: payload,
      });
    }

    return {
      success: true,
      provider_order_id: String(response.order_id || ''),
      provider_shipment_id: String(response.shipment_id || ''),
      status: response.status || 'NEW',
      status_code: response.status_code,
      awb_code: response.awb_code || null,
      courier_company_id: response.courier_company_id || null,
      courier_name: response.courier_name || null,
      raw_response: response,
    };
  } catch (err) {
    // If Shiprocket returned 400/422 with valid pickup locations attached
    const fallbackLocations = err.rawError?.data?.data;
    if (Array.isArray(fallbackLocations) && fallbackLocations[0]?.pickup_location) {
      const validPickup = fallbackLocations[0].pickup_location;
      console.log(`ℹ️ [Shiprocket] Retrying order creation with active account pickup location: "${validPickup}"`);
      payload.pickup_location = validPickup;
      const response = await request({
        method: 'POST',
        path: '/orders/create/adhoc',
        data: payload,
      });

      return {
        success: true,
        provider_order_id: String(response.order_id || ''),
        provider_shipment_id: String(response.shipment_id || ''),
        status: response.status || 'NEW',
        status_code: response.status_code,
        awb_code: response.awb_code || null,
        courier_company_id: response.courier_company_id || null,
        courier_name: response.courier_name || null,
        raw_response: response,
      };
    }

    if (err.message && err.message.toLowerCase().includes('billing/shipping address')) {
      throw new Error(
        `Shiprocket account requires a registered pickup address. Please log in to Shiprocket Dashboard (app.shiprocket.in) -> Settings -> Pickup Locations, and add a pickup address with nickname '${payload.pickup_location}'.`
      );
    }
    throw err;
  }
}

module.exports = {
  createOrder,
  formatShiprocketDate,
};
