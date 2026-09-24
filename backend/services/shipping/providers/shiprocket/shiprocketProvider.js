/**
 * backend/services/shipping/providers/shiprocket/shiprocketProvider.js
 * ─────────────────────────────────────────────────────────────────
 * Concrete Shiprocket Shipping Provider Adapter.
 * Encapsulates all Shiprocket API functionality behind the generic
 * shipping provider interface.
 */

const { checkServiceability } = require('./shiprocketServiceability');
const { createOrder } = require('./shiprocketOrders');
const { assignAwb } = require('./shiprocketAwb');
const { schedulePickup } = require('./shiprocketPickup');
const { generateLabel, generateInvoice, generateManifest } = require('./shiprocketLabels');
const { trackShipment } = require('./shiprocketTracking');

class ShiprocketProvider {
  constructor() {
    this.name = 'shiprocket';
  }

  async checkServiceability(params) {
    return checkServiceability(params);
  }

  async createOrder(shipmentData) {
    return createOrder(shipmentData);
  }

  async assignAwb(params) {
    return assignAwb(params);
  }

  async schedulePickup(params) {
    return schedulePickup(params);
  }

  async generateLabel(providerShipmentId) {
    return generateLabel(providerShipmentId);
  }

  async generateInvoice(providerOrderId) {
    return generateInvoice(providerOrderId);
  }

  async trackShipment(params) {
    return trackShipment(params);
  }

  async generateManifest(providerShipmentId) {
    return generateManifest(providerShipmentId);
  }
}

module.exports = new ShiprocketProvider();
