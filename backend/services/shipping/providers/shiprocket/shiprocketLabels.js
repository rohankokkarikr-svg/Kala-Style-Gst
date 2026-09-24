/**
 * backend/services/shipping/providers/shiprocket/shiprocketLabels.js
 * ─────────────────────────────────────────────────────────────────
 * Shiprocket shipping label and invoice generation.
 */

const { request } = require('./shiprocketClient');

/**
 * Generate a printable PDF shipping label URL for one or more shipments.
 *
 * @param {string|Array<string>} providerShipmentId
 * @returns {Promise<object>} Generated label URL
 */
async function generateLabel(providerShipmentId) {
  if (!providerShipmentId) {
    throw new Error('provider_shipment_id is required to generate a shipping label.');
  }

  const shipmentIds = Array.isArray(providerShipmentId)
    ? providerShipmentId.map(String)
    : [String(providerShipmentId)];

  const response = await request({
    method: 'POST',
    path: '/courier/generate/label',
    data: {
      shipment_id: shipmentIds,
    },
  });

  const labelUrl = response?.label_url || response?.response?.label_url;
  if (!labelUrl) {
    throw new Error(response?.message || 'Failed to generate shipping label URL from Shiprocket.');
  }

  return {
    success: true,
    label_url: labelUrl,
    is_created: response?.is_created || true,
    raw_response: response,
  };
}

/**
 * Generate a printable tax invoice URL for one or more orders.
 *
 * @param {string|Array<string>} providerOrderId
 * @returns {Promise<object>} Generated invoice URL
 */
async function generateInvoice(providerOrderId) {
  if (!providerOrderId) {
    throw new Error('provider_order_id is required to generate an invoice.');
  }

  const orderIds = Array.isArray(providerOrderId)
    ? providerOrderId.map(String)
    : [String(providerOrderId)];

  const response = await request({
    method: 'POST',
    path: '/orders/print/invoice',
    data: {
      ids: orderIds,
    },
  });

  const invoiceUrl = response?.invoice_url;
  if (!invoiceUrl) {
    throw new Error(response?.message || 'Failed to generate invoice URL from Shiprocket.');
  }

  return {
    success: true,
    invoice_url: invoiceUrl,
    is_created: response?.is_created || true,
    raw_response: response,
  };
}

/**
 * Generate and print courier manifest PDF URL for assigned shipments.
 *
 * @param {string|Array<string>} providerShipmentId
 * @returns {Promise<object>} Generated manifest URL
 */
async function generateManifest(providerShipmentId) {
  if (!providerShipmentId) {
    throw new Error('provider_shipment_id is required to generate a manifest.');
  }

  const shipmentIds = Array.isArray(providerShipmentId)
    ? providerShipmentId.map(String)
    : [String(providerShipmentId)];

  const response = await request({
    method: 'POST',
    path: '/manifests/generate',
    data: {
      shipment_id: shipmentIds,
    },
  });

  const manifestUrl = response?.manifest_url || response?.response?.manifest_url;
  if (!manifestUrl) {
    throw new Error(response?.message || 'Failed to generate manifest URL from Shiprocket.');
  }

  return {
    success: true,
    manifest_url: manifestUrl,
    raw_response: response,
  };
}

module.exports = {
  generateLabel,
  generateInvoice,
  generateManifest,
};
