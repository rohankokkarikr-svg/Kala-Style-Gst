/**
 * backend/services/shipping/shippingProvider.js
 * ─────────────────────────────────────────────────────────────────
 * Shipping Provider Factory.
 * Determines the active shipping adapter based on system configuration
 * and credential availability.
 */

const { getActiveProviderType } = require('./shippingConfig');
const shiprocketProvider = require('./providers/shiprocket/shiprocketProvider');
const mockShippingProvider = require('./providers/mockShippingProvider');

/**
 * Get the currently active shipping provider adapter.
 *
 * @param {string} [overrideType] Optional provider type override ('shiprocket' | 'mock')
 * @returns {object} Provider implementing the standard shipping interface
 */
function getShippingProvider(overrideType) {
  const type = overrideType || getActiveProviderType();

  if (type === 'shiprocket') {
    return shiprocketProvider;
  }

  return mockShippingProvider;
}

module.exports = {
  getShippingProvider,
};
