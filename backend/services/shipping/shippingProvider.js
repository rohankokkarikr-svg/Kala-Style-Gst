/**
 * backend/services/shipping/shippingProvider.js
 * ─────────────────────────────────────────────────────────────────
 * Shipping Provider Factory.
 * Determines the active shipping adapter based on system configuration
 * and credential availability.
 */

const { getActiveProviderType, getEmail, getPassword } = require('./shippingConfig');
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
    const email = getEmail();
    const password = getPassword();
    const hasCreds = Boolean(
      email &&
      !email.startsWith('your_') &&
      password &&
      !password.startsWith('your_')
    );

    if (!hasCreds) {
      if (process.env.NODE_ENV === 'production' || (process.env.SHIPPING_PROVIDER || '').toLowerCase() === 'shiprocket') {
        throw new Error(
          '[Shipping Engine] Shiprocket credentials (SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD) are not configured. Silent fallback to mock shipping in production is strictly prohibited.'
        );
      }
      console.warn('⚠️ [Shipping Engine] Shiprocket credentials missing in non-production. Falling back to mock provider for local development.');
      return mockShippingProvider;
    }

    return shiprocketProvider;
  }

  // Explicit mock requested in non-production
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️ [Shipping Engine] Warning: Mock shipping provider explicitly forced in production environment.');
  }

  return mockShippingProvider;
}

module.exports = {
  getShippingProvider,
};
