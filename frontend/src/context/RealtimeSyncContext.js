import React, { createContext, useContext, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { supabase } from '../lib/supabase';
import { apiCache } from '../utils/apiCache';

const RealtimeSyncContext = createContext({
  triggerLiveSync: () => {},
});

export const RealtimeSyncProvider = ({ children }) => {
  const socketRef = useRef(null);
  const broadcastChannelRef = useRef(null);
  const supabaseChannelRef = useRef(null);

  // Unified dispatcher for all incoming real-time events across any channel
  const handleIncomingSync = (type, payload) => {
    // 1. Invalidate corresponding client memory cache
    switch (type) {
      case 'PRODUCTS_UPDATED':
        apiCache.invalidateProducts();
        break;
      case 'CATEGORIES_UPDATED':
        apiCache.invalidateCategories();
        break;
      case 'ORDERS_UPDATED':
      case 'PAYMENTS_UPDATED':
        apiCache.invalidateOrders();
        break;
      case 'SETTINGS_UPDATED':
        apiCache.invalidateSettings();
        break;
      default:
        break;
    }

    // 2. Dispatch custom DOM event for active components
    try {
      const eventName = `kala:sync:${(type || '').toLowerCase()}`;
      window.dispatchEvent(
        new CustomEvent(eventName, { detail: { type, payload, timestamp: Date.now() } })
      );
      window.dispatchEvent(
        new CustomEvent('kala:sync:all', { detail: { type, payload, timestamp: Date.now() } })
      );
    } catch (e) {
      console.warn('Realtime event dispatch notice:', e);
    }
  };

  useEffect(() => {
    // ─── 1. Setup Backend Socket.IO Connection ───
    try {
      const isBrowser = typeof window !== 'undefined';
      const isLocalHost = isBrowser && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '0.0.0.0'
      );
      const envUrl = (process.env.REACT_APP_API_URL || '').trim();

      // Authoritative socket URL: In production, always point to Render backend
      let socketUrl = 'https://kala-style-gst-1.onrender.com';
      if (isLocalHost) {
        socketUrl = envUrl ? envUrl.replace(/\/api\/?$/, '') : 'http://localhost:5000';
      } else if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
        socketUrl = envUrl.replace(/\/api\/?$/, '');
      }

      const socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 2000,
        timeout: 10000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        // Connected to real-time sync server
      });

      socket.on('KALA_SYNC', (data) => {
        if (data && data.type) {
          handleIncomingSync(data.type, data.payload);
        }
      });
    } catch (err) {
      console.warn('Socket.io client setup notice:', err.message);
    }

    // ─── 2. Setup Supabase Realtime Edge Channel ───
    try {
      if (supabase && typeof supabase.channel === 'function') {
        const channel = supabase.channel('kalastyle_live_sync', {
          config: { broadcast: { self: false } },
        });

        channel
          .on('broadcast', { event: 'KALA_SYNC' }, ({ payload }) => {
            if (payload && payload.type) {
              handleIncomingSync(payload.type, payload.data);
            }
          })
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'orders' },
            (change) => {
              handleIncomingSync('ORDERS_UPDATED', change.new || change.old || {});
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'artisan_orders' },
            (change) => {
              handleIncomingSync('ORDERS_UPDATED', change.new || change.old || {});
              handleIncomingSync('ARTISAN_ORDERS_UPDATED', change.new || change.old || {});
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'payments' },
            (change) => {
              handleIncomingSync('PAYMENTS_UPDATED', change.new || change.old || {});
            }
          )
          .subscribe();

        supabaseChannelRef.current = channel;
      }
    } catch (supaErr) {
      console.warn('Supabase realtime channel notice:', supaErr.message);
    }

    // ─── 3. Setup Browser BroadcastChannel (Same-Device Instant Sync) ───
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('kalastyle_device_sync');
        bc.onmessage = (event) => {
          if (event.data && event.data.type) {
            handleIncomingSync(event.data.type, event.data.payload);
          }
        };
        broadcastChannelRef.current = bc;
      }
    } catch (bcErr) {
      console.warn('BroadcastChannel notice:', bcErr.message);
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (supabaseChannelRef.current && supabase.removeChannel) {
        supabase.removeChannel(supabaseChannelRef.current);
      }
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
      }
    };
  }, []);

  /**
   * Triggers an immediate multi-device sync message across all channels
   */
  const triggerLiveSync = (type, payload = {}) => {
    // 1. Send via backend socket
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('KALA_SYNC_CLIENT', { type, payload });
    }

    // 2. Broadcast via Supabase Realtime Edge
    if (supabaseChannelRef.current) {
      supabaseChannelRef.current.send({
        type: 'broadcast',
        event: 'KALA_SYNC',
        payload: { type, data: payload },
      }).catch(() => {});
    }

    // 3. Broadcast to all other tabs on this device
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({ type, payload });
    }

    // 4. Update local state
    handleIncomingSync(type, payload);
  };

  return (
    <RealtimeSyncContext.Provider value={{ triggerLiveSync }}>
      {children}
    </RealtimeSyncContext.Provider>
  );
};

export const useRealtimeSync = (eventType, callback) => {
  const { triggerLiveSync } = useContext(RealtimeSyncContext);

  useEffect(() => {
    if (!eventType || !callback) return;

    const eventName = `kala:sync:${eventType.toLowerCase()}`;
    const handler = (e) => {
      if (e.detail) {
        callback(e.detail.payload, e.detail);
      }
    };

    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [eventType, callback]);

  return { triggerLiveSync };
};

export default RealtimeSyncContext;
