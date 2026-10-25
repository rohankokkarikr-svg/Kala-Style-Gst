import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { orderAPI } from '../services/api';
import apiCache from '../utils/apiCache';
import { supabase } from '../lib/supabase';
import { HiShoppingBag, HiPencilAlt, HiLocationMarker, HiTruck } from 'react-icons/hi';
import toast from 'react-hot-toast';
import ReviewModal from '../components/ReviewModal';
import EditOrderModal from '../components/EditOrderModal';
import { extractOrderLocation } from '../utils/locationHelper';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewProduct, setReviewProduct] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);

  const isCancelable = (order) => {
    const st = (order.order_status || order.status || '').toLowerCase();
    if (!['pending', 'payment_verification_pending', 'confirmed'].includes(st)) return false;
    const ageMs = Date.now() - new Date(order.created_at).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    return ageHours <= 12;
  };

  const getRemainingTimeText = (createdAt) => {
    const ageMs = Date.now() - new Date(createdAt).getTime();
    const remainingMs = (12 * 60 * 60 * 1000) - ageMs;
    if (remainingMs <= 0) return '';
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}h ${minutes}m left to cancel`;
    }
    return `${minutes}m left to cancel`;
  };

  const handleCancelOrder = async (orderId) => {
    const confirmCancel = window.confirm('Are you sure you want to cancel this order? This action cannot be undone.');
    if (!confirmCancel) return;

    try {
      await orderAPI.cancelOrder(orderId);
      toast.success('Order cancelled successfully! 🚫');
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled', order_status: 'cancelled' } : o));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to cancel order');
    }
  };

  const fetchOrders = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      apiCache.invalidateOrders();
      const { data } = await orderAPI.getMyOrders();
      if (Array.isArray(data)) {
        setOrders(data);
      }
    } catch (err) {
      if (!quiet) toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // 1. Real-time listener: auto-update order status when Admin or Artisan updates status
  useEffect(() => {
    const handleSync = (e) => {
      const payload = e.detail?.payload || e.detail || {};
      const targetIds = [
        payload.orderId,
        payload.order_id,
        payload.orderNumber,
        payload.order_number,
        payload.id,
        payload.artisanOrderId,
        payload.artisan_order_id,
      ].filter(Boolean).map(String);

      const nextStatus = payload.order_status || payload.status;
      if (targetIds.length > 0 && nextStatus) {
        setOrders(prev => prev.map(o => {
          const isMatch = targetIds.includes(String(o.id)) ||
            targetIds.includes(String(o.order_number)) ||
            (Array.isArray(o.artisan_orders) && o.artisan_orders.some(ao => targetIds.includes(String(ao.id))));
          if (!isMatch) return o;

          const updatedAos = (o.artisan_orders || []).map(ao => {
            if (targetIds.includes(String(ao.id)) || (o.artisan_orders || []).length === 1) {
              return { ...ao, status: nextStatus };
            }
            return ao;
          });

          return {
            ...o,
            status: nextStatus,
            order_status: nextStatus,
            artisan_orders: updatedAos.length > 0 ? updatedAos : o.artisan_orders,
            ...(payload.shipping_status ? { shipping_status: payload.shipping_status } : {}),
            ...(payload.payment_status ? { payment_status: payload.payment_status } : {})
          };
        }));
      }
      // Refresh to sync complete relation fields
      fetchOrders(true);
    };
    window.addEventListener('kala:sync:orders_updated', handleSync);
    window.addEventListener('kala:sync:artisan_orders_updated', handleSync);
    window.addEventListener('kala:sync:payments_updated', handleSync);
    window.addEventListener('kala:sync:shipment_updated', handleSync);
    return () => {
      window.removeEventListener('kala:sync:orders_updated', handleSync);
      window.removeEventListener('kala:sync:artisan_orders_updated', handleSync);
      window.removeEventListener('kala:sync:payments_updated', handleSync);
      window.removeEventListener('kala:sync:shipment_updated', handleSync);
    };
  }, []);

  // 2. Direct Supabase Realtime Edge listener for Customer orders
  useEffect(() => {
    if (!supabase || typeof supabase.channel !== 'function') return;

    const channel = supabase
      .channel('customer_orders_live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          fetchOrders(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'artisan_orders' },
        () => {
          fetchOrders(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 3. Heartbeat polling (every 8 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchOrders(true);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const getOrderEffectiveStatus = (order) => {
    if (!order) return 'pending';

    // 1. Check artisan_orders first for direct artisan updates
    const aos = Array.isArray(order.artisan_orders) ? order.artisan_orders : [];
    const aoStatuses = aos.map(ao => (ao?.status || '').toLowerCase().trim()).filter(Boolean);

    if (aoStatuses.length > 0) {
      if (aoStatuses.every(s => s === 'cancelled' || s === 'rejected')) {
        return aoStatuses.includes('rejected') ? 'rejected' : 'cancelled';
      }
      if (aoStatuses.every(s => s === 'delivered' || s === 'completed')) return 'delivered';
      if (aoStatuses.some(s => ['dispatched', 'shipped', 'out_for_delivery'].includes(s))) return 'dispatched';
      if (aoStatuses.some(s => ['preparing', 'processing', 'ready_for_pickup', 'in_preparation'].includes(s))) return 'preparing';
      if (aoStatuses.some(s => ['accepted', 'confirmed'].includes(s))) return 'accepted';
      if (aoStatuses.some(s => s === 'delivered')) return 'delivered';
    }

    // 2. Master order status
    const s = (order.order_status || order.status || '').toLowerCase().trim();
    const ship = (order.shipping_status || '').toLowerCase().trim();

    if (s === 'rejected') return 'rejected';
    if (s === 'cancelled') return 'cancelled';
    if (s === 'delivered' || s === 'completed' || ship === 'delivered') return 'delivered';
    if (['dispatched', 'shipped', 'out_for_delivery'].includes(s) || ship === 'in_transit') return 'dispatched';
    if (['preparing', 'processing', 'ready_for_pickup', 'in_preparation', 'partially_processing'].includes(s) || ship === 'ready_to_ship') return 'preparing';
    if (['accepted', 'confirmed'].includes(s)) return 'accepted';
    if (s === 'partially_delivered') return 'delivered';
    return s || 'pending';
  };

  const getStatusColor = (status) => {
    const s = (status || '').toLowerCase();
    switch(s) {
      case 'delivered':
      case 'completed':
      case 'partially_delivered':
        return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'shipped':
      case 'dispatched':
      case 'out_for_delivery':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'preparing':
      case 'processing':
      case 'ready_for_pickup':
      case 'partially_processing':
      case 'in_preparation':
        return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
      case 'accepted':
      case 'confirmed':
        return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
      case 'cancelled':
      case 'rejected':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'payment_verification_pending':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30 animate-pulse';
      default:
        return 'text-gold-400 bg-gold-500/10 border-gold-500/20';
    }
  };

  const renderStatusText = (status) => {
    const s = (status || '').toLowerCase();
    const map = {
      pending: '⏳ Awaiting Artisan Confirmation',
      confirmed: '⏳ Awaiting Artisan Confirmation',
      accepted: '✅ Accepted by Artisan',
      preparing: '🎨 Crafting in Progress',
      processing: '🎨 Crafting in Progress',
      in_preparation: '🎨 Crafting in Progress',
      partially_processing: '🎨 Crafting in Progress',
      ready_for_pickup: '📬 Ready for Dispatch',
      dispatched: '🚚 Dispatched',
      shipped: '🚚 Out for Delivery',
      out_for_delivery: '🛵 Out for Delivery',
      delivered: '🎉 Delivered ✓',
      completed: '🎉 Delivered ✓',
      partially_delivered: '🎉 Delivered (Craft Item) ✓',
      cancelled: '🚫 Cancelled',
      rejected: '❌ Rejected by Artisan',
      payment_verification_pending: '⏱️ Pending Verification',
    };
    return map[s] || status;
  };

  const getEffectivePaymentMethod = (order) => {
    let pm = order.payment_method || '';
    if (!pm && order.shipping_address) {
      const match = order.shipping_address.match(/\[Method:\s*([^\]]+)\]/i);
      if (match) pm = match[1];
    }
    if (!pm) return 'Cash on Delivery (COD)';
    const pmLower = pm.toLowerCase();
    if (pmLower === 'upi' || pmLower.startsWith('upi')) {
      return 'UPI / QR Code';
    }
    if (pmLower.includes('razorpay') || pmLower.includes('online')) {
      return 'Razorpay (UPI / Online)';
    }
    if (pmLower.includes('cod')) {
      return 'Cash on Delivery (COD)';
    }
    return pm.replace('_', ' ');
  };



  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-dark-600 border-t-gold-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
        <HiShoppingBag className="w-20 h-20 text-dark-500 mb-6" />
        <h2 className="text-2xl font-serif font-bold text-white mb-2">No orders yet</h2>
        <p className="text-gray-400 mb-8">When you place an order, it will appear here.</p>
        <Link to="/products" className="btn-primary">Start Shopping</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-serif font-bold text-white mb-8">My Orders</h1>
      
      <div className="space-y-6">
        {orders.map((order) => (
          <div key={order.id} className="bg-dark-800 border border-dark-600 rounded-2xl p-6 shadow-card">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4 border-b border-dark-600 pb-4">
              <div>
                <p className="text-sm font-semibold text-gray-300">Order #{order.id?.substring(0,8)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Placed on {new Date(order.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Total Amount</p>
                  <p className="font-extrabold text-white text-lg">₹{order.total_price?.toLocaleString()}</p>
                  {order.discount_amount > 0 && (
                    <p className="text-[10px] text-gold-400 font-medium animate-pulse">
                      Save ₹{order.discount_amount.toLocaleString()} with {order.coupon_code}
                    </p>
                  )}
                </div>
                {(() => {
                  const effectiveStatus = getOrderEffectiveStatus(order);
                  return (
                    <span className={`badge border px-3 py-1 uppercase tracking-wider text-xs font-bold ${getStatusColor(effectiveStatus)}`}>
                      {renderStatusText(effectiveStatus)}
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Visual Real-Time Mini Status Track on Order Card */}
            {(() => {
              const effectiveStatus = getOrderEffectiveStatus(order);

              const isRejected = effectiveStatus === 'rejected';
              const isCancelled = effectiveStatus === 'cancelled';
              let percent = 20;
              let barColor = 'from-amber-500 to-gold-400';

              if (effectiveStatus === 'delivered' || effectiveStatus === 'completed' || effectiveStatus === 'partially_delivered') {
                percent = 100;
                barColor = 'from-emerald-500 to-green-400';
              } else if (['dispatched', 'shipped', 'out_for_delivery'].includes(effectiveStatus)) {
                percent = 80;
                barColor = 'from-blue-500 to-cyan-400';
              } else if (['preparing', 'processing', 'ready_for_pickup', 'in_preparation', 'partially_processing'].includes(effectiveStatus)) {
                percent = 60;
                barColor = 'from-purple-500 to-indigo-400';
              } else if (effectiveStatus === 'accepted' || effectiveStatus === 'confirmed') {
                percent = 40;
                barColor = 'from-emerald-500 to-teal-400';
              } else if (isRejected || isCancelled) {
                percent = 100;
                barColor = 'from-red-600 to-rose-500';
              }

              return (
                <div className="mb-4 pb-3 border-b border-dark-700/60">
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="font-semibold text-gray-400 flex items-center gap-1.5">
                      {isRejected ? (
                        <span className="text-red-400 font-bold">❌ Rejected by Artisan</span>
                      ) : isCancelled ? (
                        <span className="text-red-400 font-bold">🚫 Cancelled</span>
                      ) : effectiveStatus === 'accepted' ? (
                        <span className="text-emerald-400 font-bold">✅ Confirmed by Artisan</span>
                      ) : percent <= 20 ? (
                        <span className="text-amber-300 font-bold flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
                          Awaiting Artisan Confirmation
                        </span>
                      ) : (
                        <span className="text-white font-bold">{renderStatusText(effectiveStatus)}</span>
                      )}
                    </span>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {percent}% Progress
                    </span>
                  </div>
                  <div className="w-full bg-dark-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${barColor} transition-all duration-500 rounded-full`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            <div className="space-y-4">
              {order.items?.map((item, idx) => (
                <div key={idx} className="flex gap-4 items-center">
                  <div className="w-16 h-20 bg-dark-900 rounded border border-dark-600 overflow-hidden shrink-0">
                    <img 
                      src={item.product?.image_url} 
                      alt="" 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">{item.product?.name || 'Unknown Product'}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Size: {item.size} • Qty: {item.quantity}
                    </p>
                    <button
                      onClick={() => setReviewProduct(item.product || { name: item.name || item.product_name || 'Handcrafted Artisan Product' })}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300 font-semibold border border-gold-500/30 hover:border-gold-500/60 px-2.5 py-1.5 rounded-md bg-gold-500/5 hover:bg-gold-500/10 transition-all cursor-pointer"
                    >
                      <HiPencilAlt className="w-3.5 h-3.5" />
                      Write a Review
                    </button>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-gray-300 font-semibold">₹{(item.price_at_time * item.quantity).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Payment Details block */}
            <div className="mt-6 pt-4 border-t border-dark-600 flex flex-wrap gap-4 text-xs justify-between items-center bg-dark-900/50 p-4 rounded-xl">
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">Payment Method</span>
                  <span className="font-bold text-gray-300 capitalize">
                    {getEffectivePaymentMethod(order)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">Payment Status</span>
                  <span className={`font-black ${
                    order.payment_status?.toLowerCase() === 'paid' ? 'text-green-400' : 'text-amber-500'
                  }`}>
                    {order.payment_status?.toLowerCase() === 'paid'
                      ? 'Paid ✓'
                      : order.payment_status === 'pending_verification'
                      ? 'Verification Pending'
                      : (String(order.payment_method || '').toLowerCase() === 'cod' ? 'COD Payment Pending' : 'Payment Pending')}
                  </span>
                </div>
              </div>
              {order.transaction_id && (
                <div className="text-right">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">Transaction ID</span>
                  <span className="font-mono font-bold text-gray-300 bg-dark-900 px-2 py-1 rounded border border-dark-600">{order.transaction_id}</span>
                </div>
              )}
            </div>

            {/* Delivery Address block */}
            {(() => {
              const loc = extractOrderLocation(order);
              return (
                <div className="mt-4 p-3 bg-dark-900/40 rounded-xl border border-dark-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1 mb-0.5">
                      <HiLocationMarker className="w-3.5 h-3.5 text-gold-400" /> Delivery Address
                    </span>
                    <p className="text-gray-300 leading-relaxed">{loc.cleanAddress}</p>
                  </div>
                  {loc.mapsUrl && (
                    <a
                      href={loc.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold shrink-0 transition-all ${
                        loc.hasLiveGps
                          ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-dark-800 hover:bg-dark-700 text-gray-300 border-dark-600'
                      }`}
                    >
                      {loc.hasLiveGps ? '📍 Live Delivery Pin' : '🗺️ View on Maps'} ↗
                    </a>
                  )}
                </div>
              );
            })()}

            <div className="mt-6 pt-4 border-t border-dark-600 flex items-center justify-between flex-wrap gap-3">
              <span className="text-[11px] text-gray-400 italic font-medium flex items-center gap-1">
                {isCancelable(order) ? `⏱️ ${getRemainingTimeText(order.created_at)}` : ''}
              </span>
              <div className="flex items-center gap-2.5 flex-wrap">
                <Link
                  to={`/orders/${order.id}/tracking`}
                  className="px-3 py-2 text-xs font-semibold text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-500/60 bg-blue-500/5 hover:bg-blue-500/10 rounded-lg transition-all flex items-center gap-1.5 no-underline"
                >
                  <HiTruck className="w-3.5 h-3.5" /> Track Order
                </Link>
                {/* If order is unpaid UPI, show instant Pay Now via UPI button */}
                {order.payment_status !== 'paid' && (order.payment_method === 'upi' || order.payment_method === 'razorpay') && (
                  <Link
                    to={`/payment-gateway?orderId=${order.id}`}
                    className="px-3.5 py-2 text-xs font-bold text-dark-900 bg-gradient-to-r from-gold-400 to-gold-500 hover:from-gold-300 hover:to-gold-400 rounded-lg shadow-gold-sm transition-all flex items-center gap-1.5 no-underline cursor-pointer"
                  >
                    ⚡ Pay Now via UPI
                  </Link>
                )}
                {isCancelable(order) && (
                  <>
                    <button
                      onClick={() => setEditingOrder(order)}
                      className="px-4 py-2 text-xs font-semibold text-gold-400 hover:text-gold-300 border border-gold-500/30 hover:border-gold-500/60 bg-gold-500/5 hover:bg-gold-500/10 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <HiPencilAlt className="w-3.5 h-3.5" /> Edit Order
                    </button>
                    <button
                      onClick={() => handleCancelOrder(order.id)}
                      className="px-4 py-2 text-xs font-semibold text-red-400 hover:text-red-500 border border-red-500/30 hover:border-red-500/60 bg-red-500/5 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      🚫 Cancel Order
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <ReviewModal 
        isOpen={!!reviewProduct} 
        onClose={() => setReviewProduct(null)} 
        product={reviewProduct} 
        productName={reviewProduct?.name}
      />

      <EditOrderModal
        isOpen={!!editingOrder}
        onClose={() => setEditingOrder(null)}
        order={editingOrder}
        remainingTimeText={editingOrder ? getRemainingTimeText(editingOrder.created_at) : ''}
        onOrderUpdated={(updated) => {
          setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
        }}
      />
    </div>
  );
}
