import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { orderAPI, shippingAPI } from '../services/api';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import {
  HiCheckCircle, HiClock, HiExclamationCircle, HiTruck,
  HiLocationMarker, HiShoppingBag, HiArrowLeft, HiRefresh,
  HiChatAlt2, HiExternalLink, HiClipboardCopy
} from 'react-icons/hi';
import { motion } from 'framer-motion';
import SendMessageModal from '../components/SendMessageModal';

const ARTISAN_STEPS = [
  { key: 'pending',           label: 'Order Received',     icon: '📦' },
  { key: 'accepted',          label: 'Accepted by Artisan', icon: '✅' },
  { key: 'preparing',         label: 'Preparing',           icon: '🎨' },
  { key: 'ready_for_pickup',  label: 'Ready for Pickup',    icon: '📬' },
  { key: 'dispatched',        label: 'Dispatched',          icon: '🚚' },
  { key: 'out_for_delivery',  label: 'Out for Delivery',    icon: '🛵' },
  { key: 'delivered',         label: 'Delivered',           icon: '🎉' },
];

const STATUS_ORDER = ARTISAN_STEPS.map(s => s.key);

const STATUS_ALIASES = {
  confirmed: 'accepted',
  approved: 'accepted',
  processing: 'preparing',
  in_preparation: 'preparing',
  packed: 'ready_for_pickup',
  ready: 'ready_for_pickup',
  shipped: 'dispatched',
  on_the_way: 'out_for_delivery',
  completed: 'delivered',
};

function normalizeStatus(st) {
  if (!st) return 'pending';
  const clean = String(st).toLowerCase().trim();
  return STATUS_ALIASES[clean] || clean;
}

function getStepIndex(status) {
  const normalized = normalizeStatus(status);
  const idx = STATUS_ORDER.indexOf(normalized);
  return idx === -1 ? 0 : idx;
}

function StatusBadge({ status, type = 'status', paymentMethod, isDelivered, shipmentStatus }) {
  const norm = normalizeStatus(status);
  const shippingDelivered = isDelivered ||
    String(shipmentStatus || '').toUpperCase() === 'DELIVERED' ||
    String(shipmentStatus || '').toLowerCase() === 'delivered';

  if (type === 'payment') {
    // COD before collection: cod_pending
    if (norm === 'cod_pending' || status === 'cod_pending') {
      return (
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          shippingDelivered
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
        }`}>
          {shippingDelivered ? 'COD — Collection Pending' : 'COD — Payment Pending'}
        </span>
      );
    }
    // COD after collection (current state: paid) or legacy cod_collected
    if (norm === 'paid' || status === 'paid' || status === 'cod_collected') {
      return (
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
          {paymentMethod === 'cod' ? 'Paid — COD Collected ✓' : 'Payment Paid ✓'}
        </span>
      );
    }
    if (norm === 'pending' || status === 'pending') {
      return (
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
          Payment Pending
        </span>
      );
    }
    if (norm === 'failed' || status === 'failed') {
      return (
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
          Payment Failed
        </span>
      );
    }
    if (status === 'refunded' || status === 'partially_refunded') {
      return (
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">
          {status === 'partially_refunded' ? 'Partially Refunded' : 'Refunded'}
        </span>
      );
    }
    // Fallback
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-500/20 text-gray-300 border border-gray-500/30">
        {status || 'Unknown'}
      </span>
    );
  }


  if (type === 'shipping') {
    const sMap = {
      pending:          { label: 'Logistics: Pending', color: 'bg-gray-500/20 text-gray-300 border border-gray-500/30' },
      ready_to_ship:    { label: 'Logistics: Ready to Ship', color: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
      awb_assigned:     { label: 'Logistics: AWB Assigned', color: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' },
      pickup_scheduled: { label: 'Logistics: Pickup Scheduled', color: 'bg-purple-500/20 text-purple-300 border border-purple-500/30' },
      picked_up:        { label: 'Logistics: Courier Picked Up', color: 'bg-purple-500/20 text-purple-300 border border-purple-500/30' },
      in_transit:       { label: 'Logistics: In Transit', color: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' },
      out_for_delivery: { label: 'Logistics: Out for Delivery', color: 'bg-amber-400/20 text-amber-300 border border-amber-400/30 font-medium' },
      delivered:        { label: 'Courier: Delivered ✓', color: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold' },
      returned:         { label: 'Logistics: Returned (RTO)', color: 'bg-red-500/20 text-red-300 border border-red-500/30' },
      failed:           { label: 'Logistics: Delivery Exception', color: 'bg-red-500/20 text-red-300 border border-red-500/30' },
    };
    const sCfg = sMap[norm] || sMap[String(status).toLowerCase()] || { label: `Logistics: ${status}`, color: 'bg-gray-500/20 text-gray-300 border border-gray-500/30' };
    return (
      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${sCfg.color}`}>{sCfg.label}</span>
    );
  }

  const map = {
    pending:          { label: 'Order Received', color: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' },
    confirmed:        { label: 'Order Confirmed', color: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium' },
    processing:       { label: 'Order Processing', color: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
    accepted:         { label: 'Accepted by Artisan', color: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
    preparing:        { label: 'Preparing Items',    color: 'bg-purple-500/20 text-purple-300 border border-purple-500/30' },
    ready_for_pickup: { label: 'Ready for Dispatch', color: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' },
    dispatched:       { label: 'Dispatched',         color: 'bg-orange-500/20 text-orange-300 border border-orange-500/30' },
    shipped:          { label: 'Shipped',            color: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' },
    out_for_delivery: { label: 'Out for Delivery',   color: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' },
    delivered:        { label: 'Order Complete ✓',   color: 'bg-green-500/20 text-green-300 border border-green-500/30 font-bold' },
    cancelled:        { label: 'Cancelled',          color: 'bg-red-500/20 text-red-300 border border-red-500/30' },
    rejected:         { label: 'Rejected',           color: 'bg-red-600/20 text-red-400 border border-red-600/30' },
  };
  const cfg = map[norm] || map[status] || { label: status, color: 'bg-gray-500/20 text-gray-300 border border-gray-500/30' };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.color}`}>{cfg.label}</span>
  );
}

function ArtisanTimeline({ artisanOrder, overallStatus }) {
  const effectiveStatus = artisanOrder?.status || overallStatus;
  const currentIdx = getStepIndex(effectiveStatus);
  const isCancelled = ['cancelled', 'rejected'].includes(normalizeStatus(effectiveStatus));

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-5 top-4 bottom-4 w-0.5 bg-dark-600/60" />
      <div className="space-y-3.5">
        {ARTISAN_STEPS.map((step, idx) => {
          const isDone = idx <= currentIdx && !isCancelled;
          const isCurrent = idx === currentIdx && !isCancelled;
          return (
            <div key={step.key} className="flex items-center gap-4 relative z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all shadow-md
                ${isDone ? 'bg-green-500/25 border-2 border-green-500 text-green-300' :
                  isCurrent ? 'bg-gold-500/25 border-2 border-gold-400 text-gold-300 ring-2 ring-gold-500/20 animate-pulse' :
                  'bg-dark-700 border border-dark-600/60 text-gray-600'}`}>
                {isDone ? '✓' : isCurrent ? step.icon : <span className="opacity-30">{idx + 1}</span>}
              </div>
              <div className="flex flex-col">
                <span className={`text-sm ${isDone ? 'text-white font-medium' : isCurrent ? 'text-gold-300 font-bold' : 'text-gray-500'}`}>
                  {step.label}
                </span>
                {isCurrent && (
                  <span className="text-[10px] text-gold-400/80 font-medium">
                    Current Milestone
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {isCancelled && (
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm bg-red-500/20 border-2 border-red-500 text-red-300 flex-shrink-0">
              ✕
            </div>
            <span className="text-sm text-red-400 font-semibold capitalize">{effectiveStatus}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrderTracking() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);

  const fetchOrder = async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const { data } = await orderAPI.getTracking(id);
      setOrder(data);
      if (data?.id) {
        try {
          const sRes = await shippingAPI.getByOrderId(data.id);
          if (sRes?.data) setShipment(sRes.data);
        } catch (e) {}
      }
    } catch (err) {
      // Automatic fallback: attempt to load order via getById
      try {
        const { data: fallbackData } = await orderAPI.getById(id);
        if (fallbackData) {
          setOrder(fallbackData);
          if (fallbackData.id) {
            try {
              const sRes = await shippingAPI.getByOrderId(fallbackData.id);
              if (sRes?.data) setShipment(sRes.data);
            } catch (e) {}
          }
          return;
        }
      } catch (fallbackErr) {
        // Fallback also failed
      }
      console.error('Failed to load order tracking:', err);
      const msg = err.response?.data?.error || 'Failed to load order tracking';
      if (!quiet) toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchOrder(); }, [id]);

  // 1. Broad DOM & Multi-device Sync Listener
  useEffect(() => {
    const handler = (e) => {
      const payload = e.detail?.payload || {};
      const targetId = payload.id || payload.orderId || payload.order_id || payload.order_number;
      if (
        !targetId ||
        targetId === id ||
        (order && (targetId === order.id || targetId === order.order_number))
      ) {
        fetchOrder(true);
      }
    };
    window.addEventListener('kala:sync:orders_updated', handler);
    window.addEventListener('kala:sync:artisan_orders_updated', handler);
    window.addEventListener('kala:sync:payments_updated', handler);
    window.addEventListener('kala:sync:shipment_updated', handler);
    return () => {
      window.removeEventListener('kala:sync:orders_updated', handler);
      window.removeEventListener('kala:sync:artisan_orders_updated', handler);
      window.removeEventListener('kala:sync:payments_updated', handler);
      window.removeEventListener('kala:sync:shipment_updated', handler);
    };
  }, [id, order]);

  // 2. Direct Supabase Realtime Edge Channel (PostgreSQL changes)
  useEffect(() => {
    if (!supabase || typeof supabase.channel !== 'function') return;

    const channel = supabase
      .channel(`tracking_edge_${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (change) => {
          const rec = change.new || change.old || {};
          if (
            rec.id === id ||
            rec.order_number === id ||
            (order && (rec.id === order.id || rec.order_number === order.order_number))
          ) {
            fetchOrder(true);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'artisan_orders' },
        (change) => {
          const rec = change.new || change.old || {};
          if (
            rec.order_id === id ||
            (order && rec.order_id === order.id)
          ) {
            fetchOrder(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, order]);

  // 3. Continuous Background Live Heartbeat (every 5 seconds for non-terminal orders)
  useEffect(() => {
    const isTerminal = ['delivered', 'cancelled', 'rejected'].includes(
      normalizeStatus(order?.order_status || order?.status)
    );
    if (isTerminal) return;

    const interval = setInterval(() => {
      fetchOrder(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [id, order?.order_status, order?.status]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-gold-400/30 border-t-gold-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <div className="text-5xl mb-4">🔍</div>
          <p>Order not found</p>
          <Link to="/orders" className="text-gold-400 hover:underline mt-2 inline-block">← Back to Orders</Link>
        </div>
      </div>
    );
  }

  const artisanOrders = order.artisan_orders || [];
  const isMultiArtisan = artisanOrders.length > 1;

  return (
    <div className="min-h-screen bg-dark-900 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link to="/orders" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
            <HiArrowLeft className="w-4 h-4" /> Back to Orders
          </Link>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Live Tracking
            </span>
            <button
              onClick={() => fetchOrder(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300 transition-colors"
            >
              <HiRefresh className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Order Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-dark-800 border border-dark-700/60 rounded-2xl p-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-xl font-serif font-bold text-white">
                {order.order_number || `Order #${id?.substring(0, 8)}`}
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Placed {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={order.order_status || order.status || 'pending'} type="status" />
              <StatusBadge 
                status={order.payment_status || 'pending'} 
                type="payment" 
                paymentMethod={order.payment_method} 
                isDelivered={order.shipping_status === 'DELIVERED' || order.status === 'delivered'} 
              />
              {(order.shipping_status || shipment?.status) && (
                <StatusBadge status={order.shipping_status || shipment?.status} type="shipping" />
              )}
            </div>
          </div>

          {/* Special notice for COD delivered but collection pending */}
          {order.payment_method === 'cod' && 
           (order.shipping_status === 'DELIVERED' || order.status === 'delivered') && 
           order.payment_status !== 'paid' && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 text-amber-300 text-xs">
              <span className="text-base">💵</span>
              <div>
                <p className="font-semibold">Shipment Delivered · COD Payment Collection Pending</p>
                <p className="text-amber-400/80 text-[11px] mt-0.5">Package has been handed over. Cash collection will reflect as Paid upon courier deposit reconciliation.</p>
              </div>
            </div>
          )}

          {/* Payment & Delivery Info */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="bg-dark-700/40 rounded-xl p-3">
              <p className="text-gray-500 text-xs mb-1">Payment Method</p>
              <p className="text-white font-medium capitalize">
                {order.payment_method === 'razorpay' ? '💳 Online (Razorpay)' :
                 order.payment_method === 'cod' ? '💵 Cash on Delivery' :
                 order.payment_method || 'N/A'}
              </p>
            </div>
            <div className="bg-dark-700/40 rounded-xl p-3">
              <p className="text-gray-500 text-xs mb-1">Total Amount</p>
              <p className="text-gold-400 font-bold text-lg">
                ₹{(order.total_amount || order.total_price || 0).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="bg-dark-700/40 rounded-xl p-3">
              <p className="text-gray-500 text-xs mb-1">Delivering to</p>
              <p className="text-white text-xs leading-relaxed line-clamp-2">
                {order.shipping_name && <strong>{order.shipping_name}, </strong>}
                {order.shipping_city || order.shipping_address?.split(',')[0]}
              </p>
            </div>
          </div>

          {/* Items */}
          {order.items && order.items.length > 0 && (
            <div className="mt-5">
              <p className="text-gray-500 text-xs mb-3 uppercase tracking-wide font-semibold">Items</p>
              <div className="flex flex-wrap gap-3">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-dark-700/40 rounded-lg px-3 py-2">
                    {item.product_image_snapshot && (
                      <img src={item.product_image_snapshot} alt="" className="w-8 h-8 rounded object-cover" />
                    )}
                    <div>
                      <p className="text-white text-xs font-medium line-clamp-1">{item.product_name_snapshot || 'Item'}</p>
                      <p className="text-gray-500 text-xs">Qty: {item.quantity} · Size: {item.size || 'Standard'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Shiprocket Logistics & Courier Tracking Card */}
        {(shipment || order.awb_code || order.shipping_status) && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-dark-800 border border-gold-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-dark-700/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gold-500/10 border border-gold-500/30 rounded-xl">
                  <HiTruck className="w-6 h-6 text-gold-400" />
                </div>
                <div>
                  <h2 className="text-base font-serif font-bold text-white flex items-center gap-2">
                    <span>Shiprocket Courier Logistics</span>
                    <span className="text-[10px] bg-gold-500/20 text-gold-300 font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Verified
                    </span>
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Courier: <strong className="text-white">{shipment?.courier_name || order.courier_name || 'Standard Courier'}</strong>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full text-xs font-bold uppercase tracking-wider">
                  {(shipment?.status || order.shipping_status || 'PROCESSING').replace(/_/g, ' ')}
                </span>
                {(shipment?.tracking_url || order.tracking_url) && (
                  <a
                    href={shipment?.tracking_url || order.tracking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1 bg-gold-500 hover:bg-gold-400 text-dark-900 font-bold rounded-lg text-xs transition-colors shadow-sm"
                  >
                    <span>Track on Courier Site</span>
                    <HiExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 text-xs">
              <div className="bg-dark-900/60 p-3 rounded-xl border border-dark-700/60">
                <span className="text-gray-400 block mb-1">Air Waybill (AWB)</span>
                {shipment?.awb_code || order.awb_code ? (
                  <div className="flex items-center justify-between font-mono font-bold text-gold-400">
                    <span>{shipment?.awb_code || order.awb_code}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(shipment?.awb_code || order.awb_code);
                        toast.success('AWB copied!');
                      }}
                      className="text-gray-400 hover:text-white"
                      title="Copy AWB"
                    >
                      <HiClipboardCopy className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-amber-400/80 font-medium">Assignment in progress</span>
                )}
              </div>

              <div className="bg-dark-900/60 p-3 rounded-xl border border-dark-700/60">
                <span className="text-gray-400 block mb-1">Estimated Delivery Date</span>
                <span className="font-semibold text-white">
                  {shipment?.estimated_delivery_date
                    ? new Date(shipment.estimated_delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '2 - 4 Business Days'}
                </span>
              </div>

              <div className="bg-dark-900/60 p-3 rounded-xl border border-dark-700/60">
                <span className="text-gray-400 block mb-1">Package Weight</span>
                <span className="font-semibold text-white">
                  {shipment?.package_weight || 0.5} kg (Standard Craft Packaging)
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Artisan Order Tracking */}
        {artisanOrders.length > 0 ? (
          <div className="space-y-4">
            {isMultiArtisan && (
              <div className="text-center">
                <p className="text-gold-400 text-sm font-medium">
                  🎨 This order has items from {artisanOrders.length} artisans — tracked separately below
                </p>
              </div>
            )}

            {artisanOrders.map((ao, idx) => (
              <motion.div
                key={ao.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-dark-800 border border-dark-700/60 rounded-2xl p-6"
              >
                {/* Artisan Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    {ao.artisan?.profile_image && (
                      <img src={ao.artisan.profile_image} alt={ao.artisan?.store_name} className="w-10 h-10 rounded-full object-cover border border-dark-600" />
                    )}
                    <div>
                      <p className="text-white font-semibold text-sm">
                        {ao.artisan?.store_name || `Artisan ${idx + 1}`}
                      </p>
                      <p className="text-gray-500 text-xs">
                        Subtotal: ₹{(ao.subtotal || 0).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={ao.status || order.order_status || order.status} type="status" />
                </div>

                {/* Timeline */}
                <ArtisanTimeline artisanOrder={ao} overallStatus={order.order_status || order.status} />

                {/* Delivery timestamps */}
                <div className="mt-4 space-y-1">
                  {ao.accepted_at && (
                    <p className="text-xs text-gray-500">
                      ✓ Accepted: {new Date(ao.accepted_at).toLocaleString('en-IN')}
                    </p>
                  )}
                  {ao.dispatched_at && (
                    <p className="text-xs text-gray-500">
                      🚚 Dispatched: {new Date(ao.dispatched_at).toLocaleString('en-IN')}
                    </p>
                  )}
                  {ao.delivered_at && (
                    <p className="text-xs text-green-400">
                      🎉 Delivered: {new Date(ao.delivered_at).toLocaleString('en-IN')}
                    </p>
                  )}
                  {ao.rejection_reason && (
                    <p className="text-xs text-red-400 mt-2">
                      ❌ Reason: {ao.rejection_reason}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          /* No artisan_orders yet (order just placed, being processed) */
          <div className="bg-dark-800 border border-dark-700/60 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">⏳</div>
            <p className="text-white font-semibold">Order Confirmed</p>
            <p className="text-gray-400 text-sm mt-1">
              {order.payment_method === 'cod'
                ? 'Your COD order is confirmed! Artisan will start preparing soon.'
                : 'Payment received. Artisan will accept and start preparing your order soon.'}
            </p>
          </div>
        )}

        {/* Need Help */}
        <div className="bg-dark-800/50 border border-dark-700/40 rounded-xl p-4 text-center space-y-2">
          <p className="text-gray-400 text-xs">
            Need help or have questions about this order?
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setMessageModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-500/15 hover:bg-gold-500/25 border border-gold-500/30 text-gold-400 font-bold text-xs transition-all cursor-pointer"
            >
              <HiChatAlt2 className="w-4 h-4" /> Message Support / Artisan
            </button>
            <a
              href={`https://wa.me/917676558335?text=Hi, I need help with my order ${order.order_number || id?.substring(0, 8)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400 hover:text-green-300 text-xs font-medium border border-green-500/20 bg-green-500/10 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"
            >
              WhatsApp Support
            </a>
          </div>
        </div>

        {/* Send Message Modal */}
        <SendMessageModal
          isOpen={messageModalOpen}
          onClose={() => setMessageModalOpen(false)}
          initialRecipientRole="admin"
          orderContext={order}
        />
      </div>
    </div>
  );
}
