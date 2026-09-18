/**
 * backend/services/shipping/providers/shiprocket/shiprocketAwb.js
 * ─────────────────────────────────────────────────────────────────
 * Shiprocket AWB (Air Waybill) generation and courier assignment.
 */

const { request } = require('./shiprocketClient');

/**
 * Assign an AWB number and courier service to a created Shiprocket shipment.
 *
 * @param {object} params
 * @param {string} params.provider_shipment_id Shiprocket shipment ID
 * @param {string|number} [params.courier_id] Specific courier company ID (optional)
 * @returns {Promise<object>} Assigned AWB details
 */
async function assignAwb({ provider_shipment_id, courier_id }) {
  if (!provider_shipment_id) {
    throw new Error('provider_shipment_id is required to assign an AWB.');
  }

  const payload = {
    shipment_id: String(provider_shipment_id),
  };
  if (courier_id) {
    payload.courier_id = String(courier_id);
  }

  const response = await request({
    method: 'POST',
    path: '/courier/assign/awb',
    data: payload,
  });

  const awbData = response?.response?.data || response;

  if (!awbData?.awb_code) {
    const errorMsg = response?.message || 'Failed to assign AWB from Shiprocket';
    throw new Error(errorMsg);
  }

  return {
    success: true,
    provider_shipment_id: String(provider_shipment_id),
    awb_code: String(awbData.awb_code),
    courier_company_id: String(awbData.courier_company_id || courier_id || ''),
    courier_name: String(awbData.courier_name || 'Assigned Courier'),
    applied_weight: awbData.applied_weight || null,
    routing_code: awbData.routing_code || null,
    rto_routing_code: awbData.rto_routing_code || null,
    raw_response: response,
  };
}

module.exports = {
  assignAwb,
};
