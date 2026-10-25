import React, { useEffect, useState } from 'react';
import { artisanAPI } from '../../services/api';
import { 
  HiLocationMarker, 
  HiPhone, 
  HiMail, 
  HiClipboardCopy, 
  HiRefresh, 
  HiSearch, 
  HiShoppingBag, 
  HiTruck,
  HiCheckCircle,
  HiClock,
  HiExternalLink,
  HiMap,
  HiCheck,
  HiX,
  HiShieldCheck,
  HiChatAlt2,
  HiXCircle
} from 'react-icons/hi';
import { FaWhatsapp } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { extractOrderLocation } from '../../utils/locationHelper';
import SendMessageModal from '../../components/SendMessageModal';

export default function ArtisanOrders() {
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [messageTarget, setMessageTarget] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);

  // Dedicated Artisan Order Acceptance / Rejection Workflow Modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null); // { orderId, artisanOrderId, orderNumber, customerName }
  const [selectedRejectReason, setSelectedRejectReason] = useState('Suspected Fake / Fraudulent Order');
  const [customRejectNote, setCustomRejectNote] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);

  const fetchOrders = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      let loaded = false;
      let rawData = null;
      // 1. Try modern artisan_orders based endpoint first
      try {
        const res = await artisanAPI.getArtisanOrders();
        if (res?.data && Array.isArray(res.data)) {
          rawData = res.data;
          loaded = true;
        }
      } catch (e) { /* fallback to getMyOrders */ }

      // 2. Fallback to getMyOrders
      if (!loaded) {
        try {
          const res = await artisanAPI.getMyOrders();
          if (res?.data && Array.isArray(res.data)) {
            rawData = res.data;
            loaded = true;
          }
        } catch (e) { /* fallback to getMyStats */ }
      }

      // 3. Fallback to recentOrders from stats
      if (!loaded) {
        try {
          const statsRes = await artisanAPI.getMyStats();
          rawData = statsRes?.data?.recentOrders || [];
        } catch (err) {
          console.error('Failed to load artisan orders:', err);
        }
      }

      if (rawData && Array.isArray(rawData)) {
        // Directly set raw artisan orders from server without auto-accepting
        setOrders(rawData);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // 1. DOM Real-time listener: reflect artisan order updates in real time
  useEffect(() => {
    const handleSync = (e) => { 
      // Skip background refetch if user has an update currently in-flight
      if (updatingId) return;

      if (e?.detail) {
        const payload = e.detail.payload || e.detail;
        const targetArtisanOrderId = payload.artisan_order_id || payload.artisanOrderId;
        const targetOrderId = payload.order_id || payload.orderId || payload.id;
        const newStatus = payload.status || payload.order_status;

        // Apply updated status to matching artisan order in state
        if (newStatus && (targetArtisanOrderId || targetOrderId)) {
          setOrders(prev => prev.map(item => {
            const matches = (targetArtisanOrderId && (item.id === targetArtisanOrderId || item.artisan_order_id === targetArtisanOrderId)) ||
                            (targetOrderId && (item.order_id === targetOrderId || item.order?.id === targetOrderId || item.orders?.id === targetOrderId));
            if (matches) {
              return {
                ...item,
                status: newStatus,
                item_status: newStatus,
                accepted_at: newStatus === 'accepted' ? (item.accepted_at || new Date().toISOString()) : item.accepted_at,
                order: item.order ? { ...item.order, status: newStatus, order_status: newStatus } : undefined,
                orders: item.orders ? { ...item.orders, status: newStatus, order_status: newStatus } : undefined,
              };
            }
            return item;
          }));
        }
      }
      fetchOrders(true); 
    };
    window.addEventListener('kala:sync:orders_updated', handleSync);
    window.addEventListener('kala:sync:payments_updated', handleSync);
    window.addEventListener('kala:sync:artisan_orders_updated', handleSync);
    window.addEventListener('kala:sync:shipment_updated', handleSync);
    return () => {
      window.removeEventListener('kala:sync:orders_updated', handleSync);
      window.removeEventListener('kala:sync:payments_updated', handleSync);
      window.removeEventListener('kala:sync:artisan_orders_updated', handleSync);
      window.removeEventListener('kala:sync:shipment_updated', handleSync);
    };
  }, [updatingId]);



  // Exclusive Artisan UTR Confirmation & Order Acceptance Handler
  const handleVerifyUtr = async (orderId, action) => {
    if (!orderId || verifyingId) return;
    setVerifyingId(orderId);

    const isApprove = action === 'approve';
    // Optimistic UI state update
    setOrders(prev => prev.map(item => {
      if (item.orders?.id === orderId) {
        return {
          ...item,
          orders: {
            ...item.orders,
            payment_status: isApprove ? 'paid' : 'failed',
            status: isApprove ? 'processing' : 'cancelled'
          }
        };
      }
      return item;
    }));

    try {
      await artisanAPI.verifyPayment(orderId, { action });
      if (isApprove) {
        toast.success(`🎉 UTR Verified! Order #${orderId.substring(0, 8).toUpperCase()} confirmed for preparation! 🚀`);
      } else {
        toast.error(`Order #${orderId.substring(0, 8).toUpperCase()} rejected due to invalid UTR.`);
      }
      const syncPayload = {
        orderId,
        order_id: orderId,
        id: orderId,
        status: isApprove ? 'accepted' : 'rejected',
        order_status: isApprove ? 'accepted' : 'rejected',
        payment_status: isApprove ? 'paid' : 'failed'
      };
      window.dispatchEvent(new CustomEvent('kala:sync:orders_updated', { detail: syncPayload }));
      window.dispatchEvent(new CustomEvent('kala:sync:artisan_orders_updated', { detail: syncPayload }));
      window.dispatchEvent(new CustomEvent('kala:sync:payments_updated', { detail: syncPayload }));
    } catch (err) {
      console.error('Failed to verify UTR:', err);
      toast.error(err.response?.data?.error || 'Failed to verify UTR and confirm order');
      fetchOrders();
    } finally {
      setVerifyingId(null);
    }
  };


  // Dedicated 1-Click Accept & Confirm Order
  const handleAcceptOrder = async (orderId, artisanOrderId) => {
    if (!orderId && !artisanOrderId) return;
    const targetId = artisanOrderId || orderId;
    setUpdatingId(targetId);

    const nowIso = new Date().toISOString();

    // Optimistically update local state immediately
    setOrders(prev => prev.map(item => {
      const isTarget = (artisanOrderId && item.id === artisanOrderId) ||
                       (!artisanOrderId && (item.orders?.id === orderId || item.order?.id === orderId || item.order_id === orderId));
      if (isTarget) {
        return {
          ...item,
          status: 'accepted',
          item_status: 'accepted',
          accepted_at: nowIso,
          orders: item.orders ? { ...item.orders, status: 'accepted', order_status: 'accepted' } : undefined,
          order: item.order ? { ...item.order, status: 'accepted', order_status: 'accepted' } : undefined,
        };
      }
      return item;
    }));

    try {
      if (artisanOrderId) {
        try {
          await artisanAPI.updateArtisanSubOrderStatus(artisanOrderId, { status: 'accepted', order_id: orderId });
        } catch (subErr) {
          console.warn('Sub-order acceptance failed, attempting master order fallback:', subErr);
          if (orderId && orderId !== artisanOrderId) {
            await artisanAPI.updateOrderStatus(orderId, { status: 'accepted' });
          } else {
            throw subErr;
          }
        }
      } else {
        await artisanAPI.updateOrderStatus(orderId, { status: 'accepted' });
      }

      // Definitively lock in the accepted state in state
      setOrders(prev => prev.map(item => {
        const isTarget = (artisanOrderId && item.id === artisanOrderId) ||
                         (!artisanOrderId && (item.orders?.id === orderId || item.order?.id === orderId || item.order_id === orderId));
        if (isTarget) {
          return {
            ...item,
            status: 'accepted',
            item_status: 'accepted',
            accepted_at: item.accepted_at || nowIso,
            orders: item.orders ? { ...item.orders, status: 'accepted', order_status: 'accepted' } : undefined,
            order: item.order ? { ...item.order, status: 'accepted', order_status: 'accepted' } : undefined,
          };
        }
        return item;
      }));

      toast.success('🎉 Order Confirmed! The customer will see "Accepted by Artisan" on their tracking status bar.');
      window.dispatchEvent(new CustomEvent('kala:sync:orders_updated', {
        detail: {
          id: orderId,
          orderId,
          order_id: orderId,
          status: 'accepted',
          order_status: 'accepted',
          artisanOrderId,
          artisan_order_id: artisanOrderId,
          payload: { id: orderId, orderId, order_id: orderId, status: 'accepted', order_status: 'accepted', artisanOrderId }
        }
      }));
      window.dispatchEvent(new CustomEvent('kala:sync:artisan_orders_updated', {
        detail: {
          id: artisanOrderId,
          artisanOrderId,
          artisan_order_id: artisanOrderId,
          orderId,
          order_id: orderId,
          status: 'accepted',
          payload: { id: artisanOrderId, artisanOrderId, orderId, order_id: orderId, status: 'accepted' }
        }
      }));
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to accept order');
      fetchOrders();
    } finally {
      setUpdatingId(null);
    }
  };

  const openRejectModal = (item, orderId, artisanOrderId) => {
    const orderObj = item.orders || item.order || {};
    const customerObj = orderObj.users || orderObj.user || {};
    const customerName = customerObj.name || orderObj.shipping_name || 'Customer';
    const orderNum = orderObj.order_number || String(orderId || artisanOrderId).substring(0, 8);
    setRejectTarget({ orderId, artisanOrderId, orderNumber: orderNum, customerName });
    setSelectedRejectReason('Suspected Fake / Fraudulent Order');
    setCustomRejectNote('');
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!rejectTarget) return;
    const { orderId, artisanOrderId } = rejectTarget;
    const finalReason = selectedRejectReason === 'Other'
      ? (customRejectNote.trim() || 'Order rejected by artisan')
      : (customRejectNote.trim() ? `${selectedRejectReason} (${customRejectNote.trim()})` : selectedRejectReason);

    setRejectLoading(true);
    const targetId = artisanOrderId || orderId;
    setUpdatingId(targetId);

    // Optimistically update
    setOrders(prev => prev.map(item => {
      const isTarget = (artisanOrderId && item.id === artisanOrderId) ||
                       (!artisanOrderId && (item.orders?.id === orderId || item.order?.id === orderId || item.order_id === orderId));
      if (isTarget) {
        return {
          ...item,
          status: 'rejected',
          item_status: 'rejected',
          rejection_reason: finalReason,
          orders: item.orders ? { ...item.orders, status: 'rejected', order_status: 'rejected', rejection_reason: finalReason } : undefined,
          order: item.order ? { ...item.order, status: 'rejected', order_status: 'rejected', rejection_reason: finalReason } : undefined,
        };
      }
      return item;
    }));

    try {
      if (artisanOrderId) {
        await artisanAPI.updateArtisanSubOrderStatus(artisanOrderId, { status: 'rejected', order_id: orderId, rejection_reason: finalReason });
      } else {
        await artisanAPI.updateOrderStatus(orderId, { status: 'rejected', rejection_reason: finalReason });
      }
      toast.error('❌ Order Rejected. Inventory restored and customer notified in real time.');
      setRejectModalOpen(false);
      setRejectTarget(null);
      window.dispatchEvent(new CustomEvent('kala:sync:orders_updated', {
        detail: { id: orderId, orderId, status: 'rejected', order_status: 'rejected', rejection_reason: finalReason, artisanOrderId }
      }));
      window.dispatchEvent(new CustomEvent('kala:sync:artisan_orders_updated', {
        detail: { id: artisanOrderId, artisanOrderId, orderId, status: 'rejected', rejection_reason: finalReason }
      }));
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to reject order');
      fetchOrders();
    } finally {
      setRejectLoading(false);
      setUpdatingId(null);
    }
  };

  const handleStatusChange = async (orderId, newStatus, artisanOrderId) => {
    if ((!orderId && !artisanOrderId) || !newStatus) return;
    const targetId = artisanOrderId || orderId;
    setUpdatingId(targetId);

    // Optimistically update order status in state only for the targeted item
    setOrders(prev => prev.map(item => {
      const isTarget = (artisanOrderId && item.id === artisanOrderId) ||
                       (!artisanOrderId && (item.orders?.id === orderId || item.order?.id === orderId || item.order_id === orderId));
      if (isTarget) {
        return {
          ...item,
          status: newStatus,
          item_status: newStatus,
          orders: item.orders ? { ...item.orders, status: newStatus, order_status: newStatus } : undefined,
          order: item.order ? { ...item.order, status: newStatus, order_status: newStatus } : undefined
        };
      }
      return item;
    }));

    try {
      if (artisanOrderId) {
        try {
          await artisanAPI.updateArtisanSubOrderStatus(artisanOrderId, { status: newStatus, order_id: orderId });
        } catch (subErr) {
          console.warn('Sub-order status update failed, attempting master order fallback:', subErr);
          if (orderId && orderId !== artisanOrderId) {
            await artisanAPI.updateOrderStatus(orderId, { status: newStatus });
          } else {
            throw subErr;
          }
        }
      } else if (orderId) {
        await artisanAPI.updateOrderStatus(orderId, { status: newStatus });
      }
      toast.success(`Order status updated to "${newStatus === 'delivered' ? 'Delivered ✓' : newStatus}"! 🚀`);
      
      // Update local state definitively with server confirmation
      setOrders(prev => prev.map(item => {
        const isTarget = (artisanOrderId && item.id === artisanOrderId) ||
                         (!artisanOrderId && (item.orders?.id === orderId || item.order?.id === orderId || item.order_id === orderId));
        if (isTarget) {
          return {
            ...item,
            status: newStatus,
            item_status: newStatus,
            orders: item.orders ? { ...item.orders, status: newStatus, order_status: newStatus } : undefined,
            order: item.order ? { ...item.order, status: newStatus, order_status: newStatus } : undefined
          };
        }
        return item;
      }));

      window.dispatchEvent(new CustomEvent('kala:sync:orders_updated', {
        detail: {
          id: orderId,
          orderId,
          status: newStatus,
          order_status: newStatus,
          artisanOrderId,
          payload: { id: orderId, orderId, status: newStatus, order_status: newStatus, artisanOrderId }
        }
      }));
      window.dispatchEvent(new CustomEvent('kala:sync:artisan_orders_updated', {
        detail: {
          id: artisanOrderId,
          artisanOrderId,
          orderId,
          status: newStatus,
          payload: { id: artisanOrderId, artisanOrderId, orderId, status: newStatus }
        }
      }));
    } catch (err) {
      console.error('Failed to update order status:', err);
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to update order status');
      fetchOrders();
    } finally {
      setUpdatingId(null);
    }
  };

  const copyToClipboard = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`📋 ${label} copied to clipboard!`);
  };

  // Status mapping aliases to handle all backend and database status conventions
  const STATUS_ALIASES = {
    preparing: 'processing',
    in_preparation: 'processing',
    ready_for_pickup: 'processing',
    partially_processing: 'processing',
    packed: 'processing',
    dispatched: 'shipped',
    out_for_delivery: 'shipped',
    on_the_way: 'shipped',
    completed: 'delivered',
    partially_delivered: 'delivered',
  };

  const normalizeArtisanStatus = (st) => {
    if (!st) return 'pending';
    const clean = String(st).toLowerCase().trim();
    return STATUS_ALIASES[clean] || clean;
  };

  const STATUS_CONFIG = {
    pending:                      { label: 'Pending Packing',          bg: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', icon: HiClock },
    confirmed:                    { label: 'Order Confirmed',          bg: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', icon: HiClock },
    payment_verification_pending: { label: 'UTR Pending Verification', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',   icon: HiClock },
    accepted:                     { label: 'Accepted by Artisan',      bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', icon: HiCheckCircle },
    processing:                   { label: 'In Preparation',           bg: 'bg-blue-500/20 text-blue-400 border-blue-500/40',       icon: HiShoppingBag },
    preparing:                    { label: 'In Preparation',           bg: 'bg-blue-500/20 text-blue-400 border-blue-500/40',       icon: HiShoppingBag },
    ready_for_pickup:             { label: 'Ready for Pickup',         bg: 'bg-blue-500/20 text-blue-400 border-blue-500/40',       icon: HiShoppingBag },
    shipped:                      { label: 'Out for Delivery',         bg: 'bg-purple-500/20 text-purple-400 border-purple-500/40', icon: HiTruck },
    dispatched:                   { label: 'Out for Delivery',         bg: 'bg-purple-500/20 text-purple-400 border-purple-500/40', icon: HiTruck },
    out_for_delivery:             { label: 'Out for Delivery',         bg: 'bg-purple-500/20 text-purple-400 border-purple-500/40', icon: HiTruck },
    delivered:                    { label: 'Delivered',                bg: 'bg-green-500/20 text-green-400 border-green-500/40',   icon: HiCheckCircle },
    completed:                    { label: 'Delivered',                bg: 'bg-green-500/20 text-green-400 border-green-500/40',   icon: HiCheckCircle },
    partially_delivered:          { label: 'Delivered (Item)',         bg: 'bg-green-500/20 text-green-400 border-green-500/40',   icon: HiCheckCircle },
    cancelled:                    { label: 'Cancelled',                bg: 'bg-red-500/20 text-red-400 border-red-500/40',         icon: HiClock },
    rejected:                     { label: 'Rejected',                 bg: 'bg-red-500/20 text-red-400 border-red-500/40',         icon: HiClock },
  };

  const filteredOrders = orders.filter(item => {
    const orderObj = item.orders || item.order || {};
    const advancedStatuses = ['processing', 'preparing', 'ready_for_pickup', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'];
    const candidates = [item.status, item.item_status, orderObj.order_status, orderObj.status].filter(Boolean);
    const advancedFound = candidates.find(c => advancedStatuses.includes(c));

    let rawStatus = 'pending';
    if (advancedFound) {
      rawStatus = advancedFound;
    } else if (candidates.includes('accepted') || item.accepted_at) {
      rawStatus = 'accepted';
    } else {
      rawStatus = candidates[0] || 'pending';
    }
    const status = normalizeArtisanStatus(rawStatus);
    const utrNo = orderObj.utr_number || orderObj.transaction_id || orderObj.razorpay_payment_id || orderObj.shipping_address?.match(/(?:Ref\.?\s*No|UTR)[:\s]+([A-Za-z0-9_-]+)/i)?.[1] || null;
    const isUtrPending = (orderObj.payment_status === 'pending_verification' || orderObj.status === 'payment_verification_pending') || (utrNo && orderObj.payment_status !== 'paid' && orderObj.status !== 'cancelled');

    if (filter === 'utr_pending') {
      if (!isUtrPending) return false;
    } else if (filter === 'processing') {
      if (status !== 'processing' && status !== 'accepted') return false;
    } else if (filter !== 'all' && status !== filter) {
      return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const customerObj = orderObj.users || orderObj.user || {};
      const customerName = (customerObj.name || orderObj.shipping_name || '').toLowerCase();
      const customerPhone = (orderObj.phone || customerObj.phone || '').toLowerCase();
      const firstItem = (item.items && item.items[0]) || item;
      const productObj = item.products || firstItem.product || { name: firstItem.product_name_snapshot };
      const productName = (productObj.name || '').toLowerCase();
      const address = (orderObj.shipping_address || '').toLowerCase();
      const orderId = String(orderObj.id || item.order_id || '').toLowerCase();

      return (
        customerName.includes(q) ||
        customerPhone.includes(q) ||
        productName.includes(q) ||
        address.includes(q) ||
        orderId.includes(q)
      );
    }
    return true;
  });

  const totalRevenue = orders.reduce((sum, item) => {
    const orderObj = item.orders || item.order || {};
    const itemSt = String(item.status || item.item_status || orderObj.status || orderObj.order_status || '').toLowerCase();
    if (itemSt === 'cancelled' || itemSt === 'rejected') return sum;
    const firstItem = (item.items && item.items[0]) || item;
    const price = item.subtotal || ((item.price_at_time || firstItem.price_at_time || firstItem.unit_price_snapshot || 0) * (item.quantity || firstItem.quantity || 1));
    return sum + price;
  }, 0);
  const pendingCount = orders.filter(o => {
    const st = o.status || o.orders?.status || o.order?.status || 'pending';
    return !st || st === 'pending';
  }).length;
  const utrPendingCount = orders.filter(item => {
    const orderObj = item.orders || item.order || {};
    const utrNo = orderObj.utr_number || orderObj.transaction_id || orderObj.razorpay_payment_id || orderObj.shipping_address?.match(/(?:Ref\.?\s*No|UTR)[:\s]+([A-Za-z0-9_-]+)/i)?.[1] || null;
    return (orderObj.payment_status === 'pending_verification' || orderObj.status === 'payment_verification_pending') || (utrNo && orderObj.payment_status !== 'paid' && orderObj.status !== 'cancelled');
  }).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-white">Artisan Orders & Shipping Details</h1>
          <p className="text-gray-400 text-sm mt-1">
            View complete customer information, delivery addresses, and products to dispatch
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchOrders} className="btn-secondary flex items-center gap-2 text-xs py-2 px-3">
            <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 border border-dark-700 bg-dark-800/80">
          <p className="text-xs text-gray-400 uppercase font-semibold">Total Orders</p>
          <p className="text-2xl font-bold text-white mt-1">{orders.length}</p>
          <p className="text-[11px] text-gray-500 mt-1">Orders with your crafts</p>
        </div>
        <div className="card p-4 border border-yellow-500/30 bg-yellow-500/5">
          <p className="text-xs text-yellow-400 uppercase font-semibold">Orders to Pack</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">{pendingCount}</p>
          <p className="text-[11px] text-gray-400 mt-1">Pending dispatch</p>
        </div>
        <div className="card p-4 border border-gold-500/30 bg-gold-500/5">
          <p className="text-xs text-gold-400 uppercase font-semibold">Total Payout Value</p>
          <p className="text-2xl font-bold text-gold-400 mt-1">₹{totalRevenue.toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-gray-400 mt-1">Your item sales earnings</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="card p-4 space-y-3 border border-dark-700 bg-dark-800">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1">
            {[
              { id: 'all', label: `All Orders (${orders.length})` },
              ...(utrPendingCount > 0 ? [{ id: 'utr_pending', label: `🔑 UTR Verification (${utrPendingCount})` }] : []),
              { id: 'pending', label: `Pending Dispatch (${pendingCount})` },
              { id: 'processing', label: 'Processing' },
              { id: 'shipped', label: 'Shipped' },
              { id: 'delivered', label: 'Delivered' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-all border ${
                  filter === tab.id
                    ? 'bg-gold-500/20 text-gold-400 font-semibold border-gold-500/40'
                    : 'text-gray-400 hover:text-white border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <HiSearch className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search customer, phone, address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Order List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="card h-48 shimmer rounded-xl" />)}
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className="space-y-4">
          {filteredOrders.map((item, idx) => {
            const orderObj = item.orders || item.order || {};
            const customerObj = orderObj.users || orderObj.user || {};
            const customerName = customerObj.name || orderObj.shipping_name || 'Customer';
            const customerPhone = orderObj.phone || customerObj.phone || '';
            const customerEmail = customerObj.email || '';
            const loc = extractOrderLocation(orderObj);
            const advancedStatuses = ['processing', 'preparing', 'ready_for_pickup', 'dispatched', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'];
            const candidates = [item.status, item.item_status, orderObj.order_status, orderObj.status].filter(Boolean);
            const advancedFound = candidates.find(c => advancedStatuses.includes(c));

            let rawStatus = 'pending';
            if (advancedFound) {
              rawStatus = advancedFound;
            } else if (candidates.includes('accepted') || item.accepted_at) {
              rawStatus = 'accepted';
            } else {
              rawStatus = candidates[0] || 'pending';
            }
            const statusKey = normalizeArtisanStatus(rawStatus);
            const statusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG[rawStatus] || STATUS_CONFIG.pending;
            const StatusIcon = statusConfig.icon;

            const firstItem = (item.items && item.items[0]) || item;
            const productObj = item.products || firstItem.product || {
              name: firstItem.product_name_snapshot,
              image_url: firstItem.product_image_snapshot,
              category: firstItem.category
            };
            const itemPrice = item.subtotal || ((item.price_at_time || firstItem.price_at_time || firstItem.unit_price_snapshot || productObj.price || 0) * (item.quantity || firstItem.quantity || 1));
            const itemQty = item.quantity || firstItem.quantity || 1;
            const itemSize = item.size || firstItem.size || 'Free Size';
            const effectiveOrderId = orderObj.id || item.order_id || item.id;
            const effectiveArtisanOrderId = item.order_id ? item.id : null;

            const locLabel = loc.hasLiveGps ? `\nLive GPS Pin: ${loc.mapsUrl}` : '';
            const fullShippingText = `Recipient: ${customerName}\nPhone: ${customerPhone}\nAddress:\n${loc.cleanAddress}${locLabel}\nProduct: ${productObj.name || 'Craft'} (Qty: ${itemQty}, Size: ${itemSize})`;

            return (
              <div key={item.id || idx} className="card p-5 border border-dark-600/80 hover:border-gold-500/40 transition-all bg-dark-800/95 space-y-4">
                {/* Header: Order ID, Status, Date */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-dark-700">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-gold-400 bg-gold-500/10 px-2.5 py-1 rounded-md border border-gold-500/30">
                      #{String(effectiveOrderId || idx).substring(0, 8).toUpperCase()}
                    </span>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${statusConfig.bg}`}>
                      <StatusIcon className="w-3 h-3" />
                      {statusConfig.label}
                    </span>
                    {orderObj.payment_method && (
                      <span className="text-[10px] font-medium text-gray-300 bg-dark-700 px-2 py-0.5 rounded border border-dark-600">
                        💳 {orderObj.payment_method.toUpperCase()} {orderObj.payment_status === 'completed' || orderObj.payment_status === 'paid' ? '• Paid' : ''}
                      </span>
                    )}
                    {orderObj.shipping_status && (
                      <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                        <HiTruck className="w-3 h-3 text-emerald-400" />
                        {orderObj.shipping_status.replace(/_/g, ' ')}
                        {orderObj.courier_name ? ` • ${orderObj.courier_name}` : ''}
                      </span>
                    )}
                    {orderObj.awb_code && (
                      <span className="text-[10px] font-mono text-gray-300 bg-dark-700 px-2 py-0.5 rounded border border-dark-600 flex items-center gap-1">
                        AWB: <strong className="text-gold-400">{orderObj.awb_code}</strong>
                        {orderObj.tracking_url && (
                          <a
                            href={orderObj.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 ml-1 inline-flex items-center gap-0.5"
                            title="Track Courier"
                          >
                            Track <HiExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    Ordered on: {orderObj.created_at ? new Date(orderObj.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  {/* Left Column: Product Info (5 cols) */}
                  <div className="lg:col-span-5 flex gap-3.5 items-start">
                    {productObj.image_url ? (
                      <img
                        src={productObj.image_url}
                        alt={productObj.name}
                        className="w-20 h-20 object-cover rounded-lg border border-dark-600 shrink-0"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=300&auto=format&fit=crop';
                        }}
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-lg bg-dark-700 flex items-center justify-center text-2xl border border-dark-600 shrink-0">
                        🎨
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-white text-sm line-clamp-1">{productObj.name || 'Handcrafted Product'}</h4>
                      <p className="text-gray-400 text-xs mt-0.5">{productObj.category || 'Indian Handicrafts'}</p>
                      
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span className="text-gray-300">
                          Qty: <strong className="text-white">{itemQty}</strong>
                        </span>
                        <span className="text-gray-400">|</span>
                        <span className="text-gray-300">
                          Size: <strong className="text-gold-400">{itemSize}</strong>
                        </span>
                      </div>

                      <div className="mt-2 text-sm">
                        <span className="text-xs text-gray-400 mr-1">Your Item Amount:</span>
                        <span className="font-bold text-gold-400 text-base">
                          ₹{itemPrice.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Middle Column: Customer Details (3 cols) */}
                  <div className="lg:col-span-3 p-3.5 rounded-xl bg-dark-900/60 border border-dark-700/80 flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1">
                        👤 Customer Details
                      </p>
                      <p className="font-bold text-white text-sm">{customerName}</p>
                      
                      {customerPhone && (
                        <p className="text-xs text-gray-300 mt-1 flex items-center gap-1 font-mono">
                          <HiPhone className="w-3.5 h-3.5 text-gold-400 shrink-0" />
                          +91 {customerPhone}
                        </p>
                      )}

                      {customerEmail && (
                        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1 truncate">
                          <HiMail className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                          {customerEmail}
                        </p>
                      )}
                    </div>

                    {/* Quick WhatsApp, In-App Message & Map contact */}
                    <div className="mt-3 pt-2.5 border-t border-dark-700/60 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMessageTarget({
                            recipientId: orderObj.user_id,
                            recipientName: customerName,
                            recipientRole: 'customer',
                            defaultTitle: `Regarding Order #${String(effectiveOrderId)?.substring(0, 8)}`,
                            orderContext: orderObj
                          });
                          setMessageModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300 font-bold py-1 px-2.5 rounded-lg bg-gold-500/10 hover:bg-gold-500/20 border border-gold-500/30 transition-all cursor-pointer"
                      >
                        <HiChatAlt2 className="w-3.5 h-3.5" /> Message Customer
                      </button>

                      {customerPhone && (
                        <a
                          href={`https://wa.me/91${customerPhone.replace(/\D/g, '')}?text=Hello%20${encodeURIComponent(customerName)},%20this%20is%20regarding%20your%20order%20%23${encodeURIComponent(String(effectiveOrderId).substring(0, 8))}%20for%20"${encodeURIComponent(productObj.name || 'craft item')}".%20We%20are%20preparing%20it%20for%20dispatch!`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 font-medium py-1 px-2 rounded bg-green-500/10 border border-green-500/20"
                        >
                          <FaWhatsapp className="w-3.5 h-3.5" /> Chat on WhatsApp
                        </a>
                      )}
                      {loc.mapsUrl && (
                        <a
                          href={loc.mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex items-center gap-1.5 text-xs font-medium py-1 px-2.5 rounded-lg border transition-all ${
                            loc.hasLiveGps
                              ? 'text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                              : 'text-blue-400 hover:text-blue-300 bg-blue-500/10 border-blue-500/20'
                          }`}
                        >
                          <HiLocationMarker className="w-3.5 h-3.5" /> {loc.hasLiveGps ? 'Live GPS Pin' : 'Map Pin'}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Complete Delivery Address (4 cols) */}
                  <div className="lg:col-span-4 p-3.5 rounded-xl bg-dark-900/60 border border-dark-700/80 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gold-400 flex items-center gap-1">
                          <HiLocationMarker className="w-3.5 h-3.5 text-gold-400" /> Delivery Address
                        </p>
                        <button
                          onClick={() => copyToClipboard(fullShippingText, 'Full shipping label')}
                          className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1 bg-dark-800 px-2 py-0.5 rounded border border-dark-600"
                          title="Copy shipping label"
                        >
                          <HiClipboardCopy className="w-3 h-3 text-gold-400" /> Copy Label
                        </button>
                      </div>

                      <div className="text-xs text-gray-200 leading-relaxed font-sans bg-dark-950/60 p-2.5 rounded-lg border border-dark-800 select-all">
                        {loc.cleanAddress}
                      </div>

                      {/* Customer Live GPS Navigation Box */}
                      {loc.hasLiveGps ? (
                        <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                              </span>
                              Customer Live GPS Attached
                            </span>
                            <span className="text-[10px] text-emerald-300/80 font-mono">
                              {loc.coordinatesText}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={loc.mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-dark-950 font-bold text-xs transition-all shadow-sm"
                            >
                              <HiExternalLink className="w-4 h-4" /> Open in Google Maps
                            </a>
                            <button
                              onClick={() => copyToClipboard(loc.mapsUrl, 'Live Location Link')}
                              className="p-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-gray-300 border border-dark-600 text-xs flex items-center justify-center"
                              title="Copy Maps Link"
                            >
                              <HiClipboardCopy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : loc.mapsUrl ? (
                        <div className="mt-2.5 p-2 rounded-lg bg-dark-800/80 border border-dark-700 flex items-center justify-between">
                          <span className="text-[10px] text-gray-400 flex items-center gap-1">
                            <HiMap className="w-3.5 h-3.5 text-blue-400" /> Address Navigation
                          </span>
                          <a
                            href={loc.mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                          >
                            Open in Maps <HiExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 pt-2 flex items-center justify-between text-[11px] text-gray-400 border-t border-dark-700/60">
                      <span>Recipient: <strong className="text-white">{customerName}</strong></span>
                      <button
                        onClick={() => copyToClipboard(loc.cleanAddress, 'Address')}
                        className="text-gold-400 hover:underline flex items-center gap-0.5"
                      >
                        Copy Address Only
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Real-Time Artisan Order Verification: Accept or Reject Banner ── */}
                {(() => {
                  const isAccepted = statusKey === 'accepted' || rawStatus === 'accepted';
                  const isRejected = statusKey === 'rejected' || rawStatus === 'rejected' || Boolean(item.rejected_at);
                  const isFurther = ['processing', 'preparing', 'ready_for_pickup', 'shipped', 'dispatched', 'out_for_delivery', 'delivered', 'completed'].includes(statusKey) || ['processing', 'preparing', 'ready_for_pickup', 'shipped', 'dispatched', 'out_for_delivery', 'delivered', 'completed'].includes(rawStatus);
                  const isAwaitingDecision = !isAccepted && !isRejected && !isFurther && (statusKey === 'pending' || rawStatus === 'pending');

                  if (isAwaitingDecision) {
                    return (
                      <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/15 via-dark-800 to-gold-500/10 border-2 border-gold-500/40 space-y-3.5 shadow-lg shadow-gold-500/5 animate-in fade-in duration-300">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="p-2.5 rounded-xl bg-gold-500/20 text-gold-400 border border-gold-500/40 text-lg shrink-0">
                              ⚡
                            </span>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-gold-300 uppercase tracking-wider">
                                  Action Required: Order Verification & Acceptance
                                </span>
                                <span className="text-[10px] bg-gold-500/20 text-gold-300 px-2.5 py-0.5 rounded-full border border-gold-500/30 font-bold animate-pulse">
                                  Awaiting Your Confirmation
                                </span>
                              </div>
                              <p className="text-xs text-gray-300 mt-1">
                                Customer has placed this order. Please verify customer and craft details. If this is a real order you can fulfill, click <strong>Accept & Confirm Order</strong>. If fraudulent, duplicate, or unfulfillable, click <strong>Reject Order</strong>.
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-mono font-bold text-gray-300 bg-dark-900/90 px-3 py-1.5 rounded-lg border border-dark-700 self-start sm:self-auto shrink-0">
                            {orderObj.payment_method === 'cod' ? '💵 Cash on Delivery' : '💳 Online Payment'}
                          </span>
                        </div>

                        {/* Customer & Craft quick summary */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-dark-950/70 p-3 rounded-lg border border-dark-700/80 text-xs">
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase font-semibold block">Customer Name</span>
                            <span className="font-semibold text-white">{customerName}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase font-semibold block">Contact Phone</span>
                            <span className="font-mono text-gold-400 font-semibold">{customerPhone || 'Not provided'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase font-semibold block">Destination</span>
                            <span className="text-gray-300 truncate block">{orderObj.shipping_city || orderObj.shipping_pincode || 'Customer address'}</span>
                          </div>
                        </div>

                        {/* Acceptance & Rejection Actions */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-gold-500/20">
                          <span className="text-[11px] text-gray-400 flex items-center gap-1.5">
                            <HiShieldCheck className="w-4 h-4 text-gold-400" />
                            <span>Your confirmation instantly updates the customer's live tracking status bar</span>
                          </span>
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              disabled={updatingId === effectiveOrderId || updatingId === effectiveArtisanOrderId}
                              onClick={() => openRejectModal(item, effectiveOrderId, effectiveArtisanOrderId)}
                              className="px-3.5 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer hover:shadow-md"
                            >
                              <HiX className="w-4 h-4" /> Reject Order
                            </button>
                            <button
                              type="button"
                              disabled={updatingId === effectiveOrderId || updatingId === effectiveArtisanOrderId}
                              onClick={() => handleAcceptOrder(effectiveOrderId, effectiveArtisanOrderId)}
                              className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/25 cursor-pointer"
                            >
                              <HiCheck className="w-4 h-4" />
                              {updatingId === effectiveOrderId || updatingId === effectiveArtisanOrderId ? 'Confirming...' : 'Accept & Confirm Order'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (isAccepted && !isFurther && !isRejected && statusKey !== 'cancelled') {
                    return (
                      <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2.5">
                          <HiCheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                          <div>
                            <span className="font-bold text-emerald-300">Order Confirmed by You:</span>
                            <span className="text-gray-300 ml-1.5">Customer tracking status bar is showing "Accepted by Artisan". Ready to begin preparation.</span>
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/20 px-2.5 py-1 rounded-full self-start sm:self-auto border border-emerald-500/30">
                          Accepted ✓
                        </span>
                      </div>
                    );
                  }

                  if (statusKey === 'processing' && !isRejected) {
                    return (
                      <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2.5">
                          <HiShoppingBag className="w-5 h-5 text-blue-400 shrink-0" />
                          <div>
                            <span className="font-bold text-blue-300">Craft In Preparation:</span>
                            <span className="text-gray-300 ml-1.5">You are actively crafting and packaging this order. Customer tracking is showing "In Preparation".</span>
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold text-blue-400 bg-blue-500/20 px-2.5 py-1 rounded-full self-start sm:self-auto border border-blue-500/30">
                          In Preparation 📦
                        </span>
                      </div>
                    );
                  }

                  if (statusKey === 'shipped' && !isRejected) {
                    return (
                      <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2.5">
                          <HiTruck className="w-5 h-5 text-purple-400 shrink-0" />
                          <div>
                            <span className="font-bold text-purple-300">Dispatched & In Transit:</span>
                            <span className="text-gray-300 ml-1.5">Order is on the way to the customer. Live tracking is active for customer & admin.</span>
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold text-purple-400 bg-purple-500/20 px-2.5 py-1 rounded-full self-start sm:self-auto border border-purple-500/30">
                          Out for Delivery 🚚
                        </span>
                      </div>
                    );
                  }

                  if (statusKey === 'delivered' && !isRejected) {
                    return (
                      <div className="p-3.5 rounded-xl bg-green-500/10 border border-green-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2.5">
                          <HiCheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                          <div>
                            <span className="font-bold text-green-300">Delivered Successfully:</span>
                            <span className="text-gray-300 ml-1.5">Customer received craft item. Earnings recorded in your balance.</span>
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold text-green-400 bg-green-500/20 px-2.5 py-1 rounded-full self-start sm:self-auto border border-green-500/30">
                          Delivered ✓
                        </span>
                      </div>
                    );
                  }

                  if (statusKey === 'cancelled' || rawStatus === 'cancelled') {
                    return (
                      <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2.5">
                          <HiXCircle className="w-5 h-5 text-red-400 shrink-0" />
                          <div>
                            <span className="font-bold text-red-300">Order Cancelled:</span>
                            <span className="text-gray-300 ml-1.5">This order is cancelled and is not counted towards your earnings, rewards, or leaderboard.</span>
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold text-red-400 bg-red-500/20 px-2.5 py-1 rounded-full self-start sm:self-auto border border-red-500/30">
                          Cancelled 🔴
                        </span>
                      </div>
                    );
                  }

                  if (isRejected) {
                    return (
                      <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2.5">
                          <HiXCircle className="w-5 h-5 text-red-400 shrink-0" />
                          <div>
                            <span className="font-bold text-red-300">Order Rejected by You:</span>
                            <span className="text-gray-300 ml-1.5">Reason: {item.rejection_reason || orderObj.rejection_reason || 'Unfulfillable order'}.</span>
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold text-red-400 bg-red-500/20 px-2.5 py-1 rounded-full self-start sm:self-auto border border-red-500/30">
                          Rejected ❌
                        </span>
                      </div>
                    );
                  }

                  return null;
                })()}

                {/* Exclusive Artisan UTR Verification & Order Confirmation Banner */}
                {(() => {
                  const utrNo = orderObj.utr_number || orderObj.transaction_id || orderObj.razorpay_payment_id || orderObj.shipping_address?.match(/(?:Ref\.?\s*No|UTR)[:\s]+([A-Za-z0-9_-]+)/i)?.[1] || null;
                  const isPendingUtr = (orderObj.payment_status === 'pending_verification' || orderObj.status === 'payment_verification_pending') || (utrNo && orderObj.payment_status !== 'paid' && orderObj.status !== 'cancelled');
                  const isPaid = orderObj.payment_status === 'paid' || orderObj.payment_status === 'completed';

                  if (isPendingUtr && utrNo) {
                    return (
                      <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/15 via-dark-800 to-amber-500/10 border-2 border-amber-500/40 space-y-3 shadow-lg shadow-amber-500/5 animate-in fade-in duration-300">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 text-base shrink-0">
                              🔑
                            </span>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                                  Customer Submitted UPI UTR / Ref. Number
                                </span>
                                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 font-semibold">
                                  Action Required
                                </span>
                              </div>
                              <p className="text-xs text-gray-300 mt-0.5">
                                Please check your bank or UPI app statement for this UTR number. Only you (the related artisan) have access to confirm this payment.
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-bold px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 self-start sm:self-auto flex items-center gap-1.5 font-mono">
                            <HiClock className="w-3.5 h-3.5 animate-spin" /> Awaiting Your Confirmation
                          </span>
                        </div>

                        {/* UTR Display Box */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-dark-950/80 p-3.5 rounded-lg border border-dark-700 gap-3">
                          <div>
                            <span className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider block">Submitted UTR / Transaction Ref:</span>
                            <span className="font-mono text-lg font-extrabold text-gold-400 select-all tracking-widest">
                              {utrNo}
                            </span>
                          </div>
                          <button
                            onClick={() => copyToClipboard(utrNo, 'UTR Number')}
                            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 hover:border-gold-500/50 self-start sm:self-auto"
                            title="Copy UTR Number"
                          >
                            <HiClipboardCopy className="w-4 h-4 text-gold-400" /> Copy UTR
                          </button>
                        </div>

                        {/* Artisan Verification Action Buttons */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-amber-500/20">
                          <span className="text-[11px] text-gray-400 flex items-center gap-1">
                            <HiShieldCheck className="w-4 h-4 text-amber-400" />
                            <span><strong className="text-white">Exclusive Access:</strong> Admin cannot approve this. Only you can verify & confirm.</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              disabled={verifyingId === orderObj.id}
                              onClick={() => handleVerifyUtr(orderObj.id, 'reject')}
                              className="px-3 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <HiX className="w-3.5 h-3.5" /> Reject Invalid UTR
                            </button>
                            <button
                              disabled={verifyingId === orderObj.id}
                              onClick={() => handleVerifyUtr(orderObj.id, 'approve')}
                              className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                            >
                              <HiCheck className="w-4 h-4" />
                              {verifyingId === orderObj.id ? 'Confirming...' : 'Verify UTR & Confirm Order'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (isPaid && utrNo) {
                    return (
                      <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <HiCheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="text-gray-300">
                            Payment Verified & Order Confirmed by You • UTR: <strong className="font-mono text-emerald-300 select-all">{utrNo}</strong>
                          </span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(utrNo, 'UTR Number')}
                          className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1"
                        >
                          <HiClipboardCopy className="w-3 h-3" /> Copy
                        </button>
                      </div>
                    );
                  }

                  return null;
                })()}

                {/* Artisan Order Fulfillment & Status Action Bar */}
                <div className="pt-3.5 border-t border-dark-700 flex flex-wrap items-center justify-between gap-3 bg-dark-900/60 p-3.5 rounded-xl border border-dark-700/60">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <HiTruck className="w-4 h-4 text-gold-400" /> Order Fulfillment Status:
                    </span>
                    <span className="text-[11px] text-gray-400 hidden sm:inline">• Update tracking for customer & admin</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Status Dropdown */}
                    <div className="relative">
                      <select
                        value={statusKey}
                        disabled={updatingId === effectiveOrderId || updatingId === effectiveArtisanOrderId}
                        onChange={(e) => handleStatusChange(effectiveOrderId, e.target.value, effectiveArtisanOrderId)}
                        className="bg-dark-800 border border-dark-600 hover:border-gold-500/50 text-xs text-white rounded-lg px-3 py-1.5 focus:border-gold-500 focus:outline-none font-medium cursor-pointer transition-all shadow-sm"
                      >
                        <option value="pending">🟡 Pending Confirmation</option>
                        <option value="accepted">✅ Confirmed by Artisan</option>
                        <option value="processing">📦 In Preparation</option>
                        <option value="shipped">🚚 Out for Delivery</option>
                        <option value="delivered">🟢 Delivered</option>
                        <option value="cancelled">🔴 Cancelled</option>
                        <option value="rejected">❌ Rejected</option>
                        {/* Hidden aliases for full DOM compatibility */}
                        <option value="preparing" className="hidden">📦 In Preparation</option>
                        <option value="dispatched" className="hidden">🚚 Out for Delivery</option>
                        <option value="partially_delivered" className="hidden">🟢 Delivered (Item)</option>
                      </select>
                    </div>

                    {/* Quick 1-Click Progressive Next-Step Buttons */}
                    {statusKey === 'pending' && (
                      <button
                        onClick={() => handleAcceptOrder(effectiveOrderId, effectiveArtisanOrderId)}
                        disabled={updatingId === effectiveOrderId || updatingId === effectiveArtisanOrderId}
                        className="text-xs py-1.5 px-3 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 font-semibold transition-all flex items-center gap-1 shadow-sm"
                      >
                        <HiCheck className="w-3.5 h-3.5" /> Accept & Confirm Order →
                      </button>
                    )}
                    {statusKey === 'accepted' && (
                      <button
                        onClick={() => handleStatusChange(effectiveOrderId, 'processing', effectiveArtisanOrderId)}
                        disabled={updatingId === effectiveOrderId || updatingId === effectiveArtisanOrderId}
                        className="text-xs py-1.5 px-3 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/40 hover:bg-blue-500/30 font-semibold transition-all flex items-center gap-1 shadow-sm"
                      >
                        <HiShoppingBag className="w-3.5 h-3.5" /> Start Preparation →
                      </button>
                    )}
                    {statusKey === 'processing' && (
                      <button
                        onClick={() => handleStatusChange(effectiveOrderId, 'shipped', effectiveArtisanOrderId)}
                        disabled={updatingId === effectiveOrderId || updatingId === effectiveArtisanOrderId}
                        className="text-xs py-1.5 px-3 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/40 hover:bg-purple-500/30 font-semibold transition-all flex items-center gap-1 shadow-sm"
                      >
                        <HiTruck className="w-3.5 h-3.5" /> Mark Shipped →
                      </button>
                    )}
                    {statusKey === 'shipped' && (
                      <button
                        onClick={() => handleStatusChange(effectiveOrderId, 'delivered', effectiveArtisanOrderId)}
                        disabled={updatingId === effectiveOrderId || updatingId === effectiveArtisanOrderId}
                        className="text-xs py-1.5 px-3 rounded-lg bg-green-500/20 text-green-400 border border-green-500/40 hover:bg-green-500/30 font-bold transition-all flex items-center gap-1 shadow-sm"
                      >
                        <HiCheckCircle className="w-3.5 h-3.5" /> Mark as Delivered ✓
                      </button>
                    )}
                    {statusKey === 'delivered' && (
                      <span className="text-xs py-1 px-2.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold flex items-center gap-1 shadow-sm">
                        <HiCheckCircle className="w-3.5 h-3.5" /> Delivered Successfully
                      </span>
                    )}
                    {(updatingId === effectiveOrderId || updatingId === effectiveArtisanOrderId) && (
                      <span className="text-xs text-gold-400 animate-pulse font-medium">Updating...</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card p-12 text-center border border-dark-700">
          <div className="text-5xl mb-3">📦</div>
          <h3 className="text-lg font-semibold text-white mb-1">No orders found</h3>
          <p className="text-gray-400 text-xs max-w-md mx-auto">
            {search ? `No orders matched "${search}".` : 'When customers purchase your handcrafted creations, their complete details and delivery addresses will appear here automatically!'}
          </p>
        </div>
      )}

      {/* Reject Order Confirmation Modal */}
      {rejectModalOpen && rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-dark-900 border border-red-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-dark-700 pb-3">
              <div className="flex items-center gap-2 text-red-400 font-bold text-base">
                <HiXCircle className="w-5 h-5" /> Reject Order #{rejectTarget.orderNumber}
              </div>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-300">
              Please choose a reason for rejecting the order from <strong>{rejectTarget.customerName}</strong>. This status will immediately reflect on the customer's live tracking status bar and refund prepaid amounts.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                Select Reason:
              </label>
              {[
                'Suspected Fake / Fraudulent Order',
                'Customer Phone or Address Unreachable',
                'Out of Raw Material / Craft Cannot Be Completed',
                'Delivery Location / Pincode Unserviceable',
                'Other'
              ].map((reasonOption) => (
                <label
                  key={reasonOption}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                    selectedRejectReason === reasonOption
                      ? 'bg-red-500/15 border-red-500/40 text-red-200 font-semibold'
                      : 'bg-dark-800/80 border-dark-700 text-gray-400 hover:text-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="rejectReason"
                    value={reasonOption}
                    checked={selectedRejectReason === reasonOption}
                    onChange={(e) => setSelectedRejectReason(e.target.value)}
                    className="accent-red-500"
                  />
                  <span>{reasonOption}</span>
                </label>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400">
                Additional Notes (Optional):
              </label>
              <textarea
                rows={2}
                value={customRejectNote}
                onChange={(e) => setCustomRejectNote(e.target.value)}
                placeholder="Provide any details for customer support or the buyer..."
                className="w-full bg-dark-800 border border-dark-700 rounded-lg p-2.5 text-xs text-white placeholder-gray-500 focus:border-red-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-dark-700">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-700 text-gray-300 text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectLoading}
                onClick={handleConfirmReject}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-md shadow-red-600/30 flex items-center gap-1.5"
              >
                <HiX className="w-4 h-4" />
                {rejectLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Send Message Modal */}
      {messageModalOpen && messageTarget && (
        <SendMessageModal
          isOpen={messageModalOpen}
          onClose={() => {
            setMessageModalOpen(false);
            setMessageTarget(null);
          }}
          initialRecipientId={messageTarget.recipientId}
          initialRecipientName={messageTarget.recipientName}
          initialRecipientRole={messageTarget.recipientRole}
          defaultTitle={messageTarget.defaultTitle}
          orderContext={messageTarget.orderContext}
        />
      )}
    </div>
  );
}

