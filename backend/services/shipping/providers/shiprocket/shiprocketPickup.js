/**
 * backend/services/shipping/providers/shiprocket/shiprocketPickup.js
 * ─────────────────────────────────────────────────────────────────
 * Shiprocket pickup scheduling.
 */

const { request } = require('./shiprocketClient');

/**
 * Schedule a courier pickup for a shipment that has an assigned AWB.
 *
 * @param {object} params
 * @param {string|Array<string>} params.provider_shipment_id Shiprocket shipment ID
 * @param {string} [params.pickup_date] Optional scheduled pickup date (YYYY-MM-DD)
 * @returns {Promise<object>} Pickup schedule status
 */
async function schedulePickup({ provider_shipment_id, pickup_date }) {
  if (!provider_shipment_id) {
    throw new Error('provider_shipment_id is required to schedule a pickup.');
  }

  const shipmentIds = Array.isArray(provider_shipment_id)
    ? provider_shipment_id.map(String)
    : [String(provider_shipment_id)];

  const payload = {
    shipment_id: shipmentIds,
  };
  if (pickup_date) {
    payload.pickup_date = [pickup_date];
  }

  const response = await request({
    method: 'POST',
    path: '/courier/generate/pickup',
    data: payload,
  });

  const pickupData = response?.response || response;

  return {
    success: true,
    pickup_status: pickupData?.pickup_status || 'SCHEDULED',
    pickup_token_number: pickupData?.pickup_token_number || null,
    pickup_scheduled_date: pickup_date || new Date().toISOString().split('T')[0],
    message: response?.message || 'Pickup scheduled successfully with courier partner.',
    raw_response: response,
  };
}

module.exports = {
  schedulePickup,
};
