const supabase = require('../config/supabase');

let ioInstance = null;
let supaChannel = null;

const initRealtime = (io) => {
  ioInstance = io;

  io.on('connection', (socket) => {
    // Client connected
    socket.on('join_room', (room) => {
      if (room) socket.join(room);
    });

    socket.on('ping_sync', () => {
      socket.emit('pong_sync', { timestamp: Date.now() });
    });
  });

  try {
    if (supabase && typeof supabase.channel === 'function') {
      supaChannel = supabase.channel('kalastyle_live_sync');
      supaChannel.subscribe();
    }
  } catch (supaErr) {
    console.warn('Backend Supabase realtime channel init notice:', supaErr.message);
  }

  console.log('⚡ KalaStyle Multi-Device Realtime Sync Engine Initialized');
};

/**
 * Sanitizes broadcast payloads to guarantee no customer PII (addresses, phone numbers,
 * emails, personal IDs, tokens) is ever leaked over public broadcast channels.
 */
const sanitizeBroadcastPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;

  const SENSITIVE_KEYS = new Set([
    'shipping_address', 'address', 'phone', 'customer_phone', 'mobile',
    'email', 'customer_email', 'billing_address', 'full_name', 'name',
    'password', 'token', 'secret', 'signature', 'razorpay_signature',
    'notes', 'aadhaar', 'pan', 'bank_account', 'ifsc'
  ]);

  if (Array.isArray(payload)) {
    return payload.map(item => sanitizeBroadcastPayload(item));
  }

  const clean = {};
  for (const [key, value] of Object.entries(payload)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      continue; // Strip PII
    }

    if (key === 'order' && value && typeof value === 'object') {
      // Retain only safe high-level sync fields for order notifications
      clean.order = {
        id: value.id,
        order_status: value.order_status || value.status,
        payment_status: value.payment_status,
        status: value.status,
        created_at: value.created_at,
        updated_at: value.updated_at
      };
    } else if (value && typeof value === 'object') {
      clean[key] = sanitizeBroadcastPayload(value);
    } else {
      clean[key] = value;
    }
  }

  return clean;
};

const broadcastSync = (type, payload = {}) => {
  const safePayload = sanitizeBroadcastPayload(payload);
  const eventData = {
    type,
    payload: safePayload,
    timestamp: Date.now()
  };

  // 1. Broadcast via Socket.IO
  if (ioInstance) {
    try {
      ioInstance.emit('KALA_SYNC', eventData);
      ioInstance.emit(`KALA_SYNC:${type}`, eventData);
    } catch (err) {
      console.error('❌ Error broadcasting realtime sync event via Socket.IO:', err.message);
    }
  }

  // 2. Broadcast via Supabase Realtime Channel
  try {
    if (supaChannel && typeof supaChannel.send === 'function') {
      supaChannel.send({
        type: 'broadcast',
        event: 'KALA_SYNC',
        payload: { type, data: safePayload }
      }).catch(() => {});
    }
  } catch (supaErr) {
    // Non-blocking notice
  }
};

module.exports = {
  initRealtime,
  broadcastSync,
  sanitizeBroadcastPayload,
  getIo: () => ioInstance,
};
