/**
 * backend/services/shipping/providers/shiprocket/shiprocketServiceability.js
 * ─────────────────────────────────────────────────────────────────
 * Serviceability and courier rate lookup via Shiprocket API.
 */

const { request } = require('./shiprocketClient');
const { getDefaultWeight, getDefaultPickupPin } = require('../../shippingConfig');

/**
 * Check delivery serviceability and fetch available courier rates between pincodes.
 *
 * @param {object} params
 * @param {string} params.pickup_postcode  6-digit pickup PIN
 * @param {string} params.delivery_postcode 6-digit delivery PIN
 * @param {number} [params.weight=0.5] Package weight in kg
 * @param {boolean} [params.cod=false] Whether Cash on Delivery is requested
 * @param {number} [params.declared_value=0] Total shipment order value in INR
 * @returns {Promise<object>} Serviceability info and courier rate options
 */
async function checkServiceability({
  pickup_postcode,
  delivery_postcode,
  weight,
  cod = false,
  declared_value = 0,
}) {
  if (!delivery_postcode) {
    throw new Error('delivery_postcode is required to check shipping serviceability.');
  }

  const queryParams = {
    pickup_postcode: String(pickup_postcode || getDefaultPickupPin()).trim(),
    delivery_postcode: String(delivery_postcode).trim(),
    weight: String(weight || getDefaultWeight()),
    cod: cod ? 1 : 0,
    declared_value: declared_value || 0,
  };

  const response = await request({
    method: 'GET',
    path: '/courier/serviceability/',
    params: queryParams,
  });

  const availableCouriers = response?.data?.available_courier_companies || [];
  const serviceable = availableCouriers.length > 0;

  // Normalize courier list with clear pricing and delivery estimates
  const couriers = availableCouriers.map((c) => ({
    courier_company_id: c.courier_company_id,
    courier_name: c.courier_name,
    rate: parseFloat(c.rate) || 0,
    estimated_delivery_days: c.estimated_delivery_days || c.etd || '3-5 Days',
    cod_available: Boolean(c.cod),
    rating: parseFloat(c.rating) || 4.5,
    is_surface: Boolean(c.is_surface),
  }));

  // Sort by lowest price first
  couriers.sort((a, b) => a.rate - b.rate);

  return {
    serviceable,
    delivery_postcode: queryParams.delivery_postcode,
    pickup_postcode: queryParams.pickup_postcode,
    available_couriers_count: couriers.length,
    lowest_rate: couriers[0]?.rate || null,
    recommended_courier: couriers[0] || null,
    cheapest_courier: couriers[0] || null,
    cheapest: couriers[0] || null,
    couriers,
  };
}

module.exports = {
  checkServiceability,
};
