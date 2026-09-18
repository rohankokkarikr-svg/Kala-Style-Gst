/**
 * backend/services/shipping/providers/shiprocket/shiprocketClient.js
 * ─────────────────────────────────────────────────────────────────
 * Centralized Shiprocket API HTTP client.
 * Provides automatic token injection, transparent 401 retry,
 * request validation, and safe error normalization.
 */

const axios = require('axios');
const { getApiUrl } = require('../../shippingConfig');
const { getShiprocketToken, clearAuthToken } = require('./shiprocketAuth');

/**
 * Perform an authenticated HTTP request to the Shiprocket API.
 *
 * @param {object} options
 * @param {'GET'|'POST'|'PUT'|'DELETE'|'PATCH'} options.method
 * @param {string} options.path  Relative path from API root (e.g. '/orders/create/adhoc')
 * @param {object} [options.data] Request body payload
 * @param {object} [options.params] URL query parameters
 * @param {number} [options.timeout=15000] Request timeout in milliseconds
 * @returns {Promise<any>} Response payload from Shiprocket
 */
async function request({ method = 'GET', path, data, params, timeout = 15000 }) {
  const token = await getShiprocketToken();
  const baseUrl = getApiUrl();
  const url = path.startsWith('http') ? path : `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

  try {
    const response = await axios({
      method,
      url,
      data,
      params,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  } catch (error) {
    // If token expired (401), clear cache and attempt a single retry
    if (error.response?.status === 401) {
      clearAuthToken();
      const freshToken = await getShiprocketToken();

      try {
        const retryRes = await axios({
          method,
          url,
          data,
          params,
          timeout,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freshToken}`,
          },
        });
        return retryRes.data;
      } catch (retryErr) {
        throw normalizeError(retryErr);
      }
    }

    throw normalizeError(error);
  }
}

/**
 * Normalize provider errors into user-safe format.
 */
function normalizeError(err) {
  const status = err.response?.status;
  const rawMsg =
    err.response?.data?.message ||
    (typeof err.response?.data?.errors === 'object' ? JSON.stringify(err.response.data.errors) : null) ||
    err.message;

  const safeMsg = rawMsg
    ? rawMsg.replace(/bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    : 'Shiprocket API request failed.';

  const errorObj = new Error(safeMsg);
  errorObj.statusCode = status || 500;
  errorObj.provider = 'shiprocket';
  errorObj.rawError = err.response?.data || null;
  return errorObj;
}

module.exports = {
  request,
};
