/**
 * backend/services/shipping/providers/shiprocket/shiprocketAuth.js
 * ─────────────────────────────────────────────────────────────────
 * Shiprocket JWT authentication manager.
 * Implements in-memory token caching, mutex locking, and automatic refresh.
 * Strictly guarantees credentials and tokens are NEVER leaked or logged.
 */

const axios = require('axios');
const { getApiUrl, getEmail, getPassword } = require('../../shippingConfig');

// In-memory token cache
let cachedToken = null;
let tokenExpiresAt = null;
let authPromise = null;

/**
 * Obtain a valid Shiprocket Bearer authentication token.
 * Reuses cached token if valid; requests a fresh token if expired or near expiry.
 *
 * @returns {Promise<string>} Valid Shiprocket bearer token
 */
async function getShiprocketToken() {
  const now = Date.now();

  // Return existing token if valid with at least 1 hour safety margin
  if (cachedToken && tokenExpiresAt && now < tokenExpiresAt - 3600000) {
    return cachedToken;
  }

  // Mutex lock: if a token request is already in-flight, await it
  if (authPromise) {
    return authPromise;
  }

  authPromise = (async () => {
    try {
      const email = getEmail();
      const password = getPassword();

      if (!email || email.startsWith('your_') || !password || password.startsWith('your_')) {
        throw new Error('Shiprocket credentials not configured. Please set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD.');
      }

      const apiUrl = getApiUrl();
      const loginUrl = `${apiUrl}/auth/login`;

      let lastErr;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await axios.post(
            loginUrl,
            { email, password },
            {
              headers: { 'Content-Type': 'application/json' },
              timeout: 15000,
            }
          );

          const token = response.data?.token;
          if (!token) {
            throw new Error('Shiprocket authentication returned no token.');
          }

          cachedToken = token;
          // Shiprocket tokens are valid for ~10 days. We conservatively cache for 7 days.
          tokenExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

          return cachedToken;
        } catch (err) {
          lastErr = err;
          cachedToken = null;
          tokenExpiresAt = null;
          // If network glitch or DNS error, wait 1 second and retry once
          if (attempt === 1 && (!err.response || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET')) {
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
          break;
        }
      }

      const status = lastErr.response?.status;
      const msg = lastErr.response?.data?.message || lastErr.message;
      throw new Error(`Shiprocket authentication failed [${status || 'NET_ERR'}]: ${msg}`);
    } finally {
      // Unconditionally reset authPromise so subsequent requests can re-authenticate
      authPromise = null;
    }
  })();

  return authPromise;
}

/**
 * Clear cached token to force re-authentication on next request (e.g. after a 401 error).
 */
function clearAuthToken() {
  cachedToken = null;
  tokenExpiresAt = null;
}

module.exports = {
  getShiprocketToken,
  clearAuthToken,
};
