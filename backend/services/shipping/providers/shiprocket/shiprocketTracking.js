/**
 * backend/services/shipping/providers/shiprocket/shiprocketTracking.js
 * ─────────────────────────────────────────────────────────────────
 * Realtime tracking data retrieval and milestone timeline normalization.
 */

const { request } = require('./shiprocketClient');
const { normalizeShiprocketStatus, SHIPPING_STATUS } = require('../../shippingConfig');

/**
 * Track shipment progress by AWB code or Shiprocket shipment ID.
 *
 * @param {object} params
 * @param {string} [params.awb_code] Air Waybill tracking number
 * @param {string} [params.provider_shipment_id] Shiprocket shipment ID
 * @returns {Promise<object>} Normalized tracking timeline and current status
 */
async function trackShipment({ awb_code, provider_shipment_id }) {
  if (!awb_code && !provider_shipment_id) {
    throw new Error('Either awb_code or provider_shipment_id is required to track a shipment.');
  }

  const endpoint = awb_code
    ? `/courier/track/awb/${encodeURIComponent(awb_code)}`
    : `/courier/track/shipment/${encodeURIComponent(provider_shipment_id)}`;

  const response = await request({
    method: 'GET',
    path: endpoint,
  });

  const trackingData = response?.tracking_data || response;
  const trackUrl =
    trackingData?.track_url ||
    (awb_code ? `https://shiprocket.co/tracking/${encodeURIComponent(awb_code)}` : null);

  const rawStatus =
    trackingData?.shipment_status ||
    trackingData?.current_status ||
    trackingData?.shipment_track?.[0]?.current_status ||
    'IN TRANSIT';

  const normalizedStatus = normalizeShiprocketStatus(rawStatus);

  // Extract scan activities/history
  const rawScans =
    trackingData?.shipment_track_activities ||
    trackingData?.scans ||
    trackingData?.shipment_track?.[0]?.scans ||
    [];

  const scans = rawScans.map((scan) => ({
    date: scan.date || scan['sr-status-label-date'] || new Date().toISOString(),
    activity: scan.activity || scan.status || 'Package in transit',
    location: scan.location || scan.city || 'Processing Hub',
    sr_status: scan['sr-status'] || null,
  }));

  const estimatedDelivery =
    trackingData?.edd ||
    trackingData?.estimated_delivery_date ||
    trackingData?.shipment_track?.[0]?.edd ||
    null;

  return {
    success: true,
    awb_code: awb_code || trackingData?.shipment_track?.[0]?.awb_code || null,
    provider_shipment_id: String(provider_shipment_id || trackingData?.shipment_id || ''),
    courier_name: trackingData?.courier_name || 'Courier Partner',
    raw_status: rawStatus,
    normalized_status: normalizedStatus,
    is_delivered: normalizedStatus === SHIPPING_STATUS.DELIVERED,
    current_location: scans[0]?.location || 'In Transit',
    estimated_delivery_date: estimatedDelivery,
    last_update: scans[0]?.date || new Date().toISOString(),
    tracking_url: trackUrl,
    scans,
    raw_response: trackingData,
  };
}

module.exports = {
  trackShipment,
};
