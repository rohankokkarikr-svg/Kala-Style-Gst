/**
 * backend/services/shipping/providers/shiprocket/shiprocketTracking.js
 * ─────────────────────────────────────────────────────────────────
 * Realtime tracking data retrieval and milestone timeline normalization.
 */

const { request } = require('./shiprocketClient');
const { normalizeShiprocketStatus, SHIPPING_STATUS } = require('../../shippingConfig');

/**
 * Track shipment progress in realtime by AWB code or Shiprocket shipment ID.
 *
 * @param {object} params
 * @param {string} [params.awb_code] Air Waybill tracking number
 * @param {string} [params.provider_shipment_id] Shiprocket shipment ID
 * @returns {Promise<object>} Normalized realtime tracking timeline and status
 */
async function trackShipment({ awb_code, provider_shipment_id }) {
  if (!awb_code && !provider_shipment_id) {
    return {
      success: true,
      awb_code: null,
      provider_shipment_id: null,
      courier_name: 'Shiprocket Logistics',
      raw_status: 'READY TO SHIP',
      normalized_status: SHIPPING_STATUS.READY_TO_SHIP,
      is_delivered: false,
      current_location: 'Order confirmed — Preparing for courier dispatch',
      estimated_delivery_date: null,
      last_update: new Date().toISOString(),
      tracking_url: null,
      scans: [],
      raw_response: null,
    };
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

  const trackStatus = trackingData?.track_status;
  const isPendingCourierScan = trackStatus === 0 || (Array.isArray(trackingData?.shipment_track_activities) && trackingData.shipment_track_activities.length === 0 && !trackingData?.current_status);

  let rawStatus =
    trackingData?.current_status ||
    trackingData?.shipment_status_label ||
    trackingData?.shipment_track?.[0]?.current_status ||
    (typeof trackingData?.shipment_status === 'string' ? trackingData.shipment_status : null);

  if (!rawStatus || isPendingCourierScan) {
    rawStatus = awb_code ? 'AWB ASSIGNED' : 'READY TO SHIP';
  }

  const normalizedStatus = normalizeShiprocketStatus(rawStatus);

  // Extract scan activities/history
  const rawScans =
    trackingData?.shipment_track_activities ||
    trackingData?.scans ||
    trackingData?.shipment_track?.[0]?.scans ||
    [];

  const scans = Array.isArray(rawScans) ? rawScans.map((scan) => ({
    date: scan.date || scan['sr-status-label-date'] || new Date().toISOString(),
    activity: scan.activity || scan.status || 'Package in transit',
    location: scan.location || scan.city || 'Processing Hub',
    sr_status: scan['sr-status'] || null,
  })) : [];

  const estimatedDelivery =
    trackingData?.edd ||
    trackingData?.estimated_delivery_date ||
    trackingData?.shipment_track?.[0]?.edd ||
    null;

  const courierName =
    trackingData?.courier_name ||
    trackingData?.shipment_track?.[0]?.courier_name ||
    'Courier Partner';

  let currentLocation = 'In Transit';
  if (scans.length > 0) {
    currentLocation = scans[0].location;
  } else if (normalizedStatus === SHIPPING_STATUS.READY_TO_SHIP) {
    currentLocation = 'Order Confirmed — Preparing for Courier Dispatch';
  } else if (normalizedStatus === SHIPPING_STATUS.AWB_ASSIGNED) {
    currentLocation = 'AWB Assigned — Awaiting Courier Pickup Scan';
  } else if (normalizedStatus === SHIPPING_STATUS.PICKUP_SCHEDULED) {
    currentLocation = 'Courier Pickup Scheduled';
  } else if (isPendingCourierScan) {
    currentLocation = 'Awaiting courier partner pickup scan';
  }

  return {
    success: true,
    awb_code: awb_code || trackingData?.shipment_track?.[0]?.awb_code || null,
    provider_shipment_id: String(provider_shipment_id || trackingData?.shipment_id || ''),
    courier_name: courierName,
    raw_status: rawStatus,
    normalized_status: normalizedStatus,
    is_delivered: normalizedStatus === SHIPPING_STATUS.DELIVERED,
    current_location: currentLocation,
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
