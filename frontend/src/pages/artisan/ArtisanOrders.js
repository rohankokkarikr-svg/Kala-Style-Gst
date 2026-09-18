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
  HiChatAlt2
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

  const fetchOrders = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      // Try new artisan_orders based endpoint first (secure, uses artisan_id)
      const res = await artisanAPI.getArtisanOrders();
      if (res?.data && Array.isArray(res.data)) {
        setOrders(res.data);
        return;
      }
    } catch (e) { /* fallback */ }
    try {
      const res = await artisanAPI.getMyOrders();
      if (res?.data && Array.isArray(res.data)) {
        setOrders(res.data);
        return;
      }
    } catch {
      try {
        const statsRes = await artisanAPI.getMyStats();
        setOrders(statsRes?.data?.recentOrders || []);
      } catch (err) {
        console.error('Failed to load artisan orders:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // 1. DOM Real-time listener: instantly reflect when a customer places or updates an order
  useEffect(() => {
    const handleSync = () => { fetchOrders(true); };
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
  }, []);



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
      window.dispatchEvent(new CustomEvent('kala:sync:orders_updated', { detail: { orderId } }));
      window.dispatchEvent(new CustomEvent('kala:sync:payments_updated', { detail: { orderId } }));
    } catch (err) {
      console.error('Failed to verify UTR:', err);
      toast.error(err.response?.data?.error || 'Failed to verify UTR and confirm order');
      fetchOrders();
    } finally {
      setVerifyingId(null);
    }
  };

  // New: Handle artisan sub-order status machine transition
  const handleArtisanSubOrderStatus = async (artisanOrderId, newStatus) => {
    if (!artisanOrderId || !newStatus) return;
    setUpdatingId(artisanOrderId);
    try {
      await artisanAPI.updateArtisanSubOrderStatus(artisanOrderId, { status: newStatus });
      toast.success(`✅ Status updated to "${newStatus}"!`);
      // Optimistically update
      setOrders(prev => prev.map(ao => ao.id === artisanOrderId ? { ...ao, status: newStatus } : ao));
      window.dispatchEvent(new CustomEvent('kala:sync:artisan_orders_updated', { detail: { artisanOrderId, status: newStatus } }));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status');
      fetchOrders();
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    if (!orderId || !newStatus) return;
    setUpdatingId(orderId);

    // Optimistically update order status in state
    setOrders(prev => prev.map(item => {
      if (item.orders?.id === orderId) {
        return { ...item, orders: { ...item.orders, status: newStatus } };
      }
      return item;
    }));

    try {
      await artisanAPI.updateOrderStatus(orderId, { status: newStatus });
      toast.success(`Order #${orderId.substring(0, 8).toUpperCase()} updated to "${newStatus}"! 🚀`);
      window.dispatchEvent(new CustomEvent('kala:sync:orders_updated', { detail: { orderId, status: newStatus } }));
    } catch (err) {
      console.error('Failed to update order status:', err);
      toast.error(err.response?.data?.error || 'Failed to update order status');
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

  const STATUS_CONFIG = {
    pending:                      { label: 'Pending Packing',          bg: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', icon: HiClock },
    payment_verification_pending: { label: 'UTR Pending Verification', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',   icon: HiClock },
    processing:                   { label: 'In Preparation',           bg: 'bg-blue-500/20 text-blue-400 border-blue-500/40',       icon: HiShoppingBag },
    shipped:                      { label: 'Out for Delivery',         bg: 'bg-purple-500/20 text-purple-400 border-purple-500/40', icon: HiTruck },
    delivered:                    { label: 'Delivered',                bg: 'bg-green-500/20 text-green-400 border-green-500/40',   icon: HiCheckCircle },
    cancelled:                    { label: 'Cancelled',                bg: 'bg-red-500/20 text-red-400 border-red-500/40',         icon: HiClock },
  };

  const filteredOrders = orders.filter(item => {
    const status = item.orders?.status || 'pending';
    const utrNo = item.orders?.utr_number || item.orders?.transaction_id || item.orders?.shipping_address?.match(/(?:Ref\.?\s*No|UTR)[:\s]+([A-Za-z0-9_-]+)/i)?.[1] || null;
    const isUtrPending = (item.orders?.payment_status === 'pending_verification' || item.orders?.status === 'payment_verification_pending') || (utrNo && item.orders?.payment_status !== 'paid' && item.orders?.status !== 'cancelled');

    if (filter === 'utr_pending') {
      if (!isUtrPending) return false;
    } else if (filter !== 'all' && status !== filter) {
      return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const customerName = (item.orders?.users?.name || '').toLowerCase();
      const customerPhone = (item.orders?.phone || item.orders?.users?.phone || '').toLowerCase();
      const productName = (item.products?.name || '').toLowerCase();
      const address = (item.orders?.shipping_address || '').toLowerCase();
      const orderId = (item.orders?.id || '').toLowerCase();

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

  const totalRevenue = orders.reduce((sum, item) => sum + ((item.price_at_time || 0) * (item.quantity || 1)), 0);
  const pendingCount = orders.filter(o => !o.orders?.status || o.orders?.status === 'pending').length;
  const utrPendingCount = orders.filter(item => {
    const utrNo = item.orders?.utr_number || item.orders?.transaction_id || item.orders?.shipping_address?.match(/(?:Ref\.?\s*No|UTR)[:\s]+([A-Za-z0-9_-]+)/i)?.[1] || null;
    return (item.orders?.payment_status === 'pending_verification' || item.orders?.status === 'payment_verification_pending') || (utrNo && item.orders?.payment_status !== 'paid' && item.orders?.status !== 'cancelled');
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
            const orderObj = item.orders || {};
            const customerObj = orderObj.users || {};
            const customerName = customerObj.name || 'Customer';
            const customerPhone = orderObj.phone || customerObj.phone || '';
            const customerEmail = customerObj.email || '';
            const loc = extractOrderLocation(orderObj);
            const statusKey = orderObj.status || 'pending';
            const statusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG.pending;
            const StatusIcon = statusConfig.icon;

            const locLabel = loc.hasLiveGps ? `\nLive GPS Pin: ${loc.mapsUrl}` : '';
            const fullShippingText = `Recipient: ${customerName}\nPhone: ${customerPhone}\nAddress:\n${loc.cleanAddress}${locLabel}\nProduct: ${item.products?.name || 'Craft'} (Qty: ${item.quantity || 1}, Size: ${item.size || 'Free Size'})`;

            return (
              <div key={item.id || idx} className="card p-5 border border-dark-600/80 hover:border-gold-500/40 transition-all bg-dark-800/95 space-y-4">
                {/* Header: Order ID, Status, Date */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-dark-700">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-gold-400 bg-gold-500/10 px-2.5 py-1 rounded-md border border-gold-500/30">
                      #{String(orderObj.id || idx).substring(0, 8).toUpperCase()}
                    </span>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${statusConfig.bg}`}>
                      <StatusIcon className="w-3 h-3" />
                      {statusConfig.label}
                    </span>
                    {orderObj.payment_method && (
                      <span className="text-[10px] font-medium text-gray-300 bg-dark-700 px-2 py-0.5 rounded border border-dark-600">
                        💳 {orderObj.payment_method.toUpperCase()} {orderObj.payment_status === 'completed' ? '• Paid' : ''}
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
                    {item.products?.image_url ? (
                      <img
                        src={item.products.image_url}
                        alt={item.products.name}
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
                      <h4 className="font-semibold text-white text-sm line-clamp-1">{item.products?.name || 'Handcrafted Product'}</h4>
                      <p className="text-gray-400 text-xs mt-0.5">{item.products?.category || 'Indian Handicrafts'}</p>
                      
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span className="text-gray-300">
                          Qty: <strong className="text-white">{item.quantity || 1}</strong>
                        </span>
                        <span className="text-gray-400">|</span>
                        <span className="text-gray-300">
                          Size: <strong className="text-gold-400">{item.size || 'Free Size'}</strong>
                        </span>
                      </div>

                      <div className="mt-2 text-sm">
                        <span className="text-xs text-gray-400 mr-1">Your Item Amount:</span>
                        <span className="font-bold text-gold-400 text-base">
                          ₹{((item.price_at_time || item.products?.price || 0) * (item.quantity || 1)).toLocaleString('en-IN')}
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
                            defaultTitle: `Regarding Order #${orderObj.id?.substring(0, 8)}`,
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
                          href={`https://wa.me/91${customerPhone.replace(/\D/g, '')}?text=Hello%20${encodeURIComponent(customerName)},%20this%20is%20regarding%20your%20order%20%23${encodeURIComponent(orderObj.id?.substring(0, 8))}%20for%20"${encodeURIComponent(item.products?.name || 'craft item')}".%20We%20are%20preparing%20it%20for%20dispatch!`}
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
                          className={`inline-flex items-center gap-1.5 text-xs font-medium py-1 px-2 rounded border ${
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

                {/* Exclusive Artisan UTR Verification & Order Confirmation Banner */}
                {(() => {
                  const utrNo = orderObj.utr_number || orderObj.transaction_id || orderObj.shipping_address?.match(/(?:Ref\.?\s*No|UTR)[:\s]+([A-Za-z0-9_-]+)/i)?.[1] || null;
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
                        disabled={updatingId === orderObj.id}
                        onChange={(e) => handleStatusChange(orderObj.id, e.target.value)}
                        className="bg-dark-800 border border-dark-600 hover:border-gold-500/50 text-xs text-white rounded-lg px-3 py-1.5 focus:border-gold-500 focus:outline-none font-medium cursor-pointer transition-all shadow-sm"
                      >
                        <option value="pending">🟡 Pending Packing</option>
                        <option value="processing">📦 In Preparation</option>
                        <option value="shipped">🚚 Out for Delivery</option>
                        <option value="delivered">🟢 Delivered</option>
                        <option value="cancelled">🔴 Cancelled</option>
                      </select>
                    </div>

                    {/* Quick 1-Click Progressive Next-Step Buttons */}
                    {statusKey === 'pending' && (
                      <button
                        onClick={() => handleStatusChange(orderObj.id, 'processing')}
                        disabled={updatingId === orderObj.id}
                        className="text-xs py-1.5 px-3 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/40 hover:bg-blue-500/30 font-semibold transition-all flex items-center gap-1 shadow-sm"
                      >
                        <HiShoppingBag className="w-3.5 h-3.5" /> Start Preparation →
                      </button>
                    )}
                    {statusKey === 'processing' && (
                      <button
                        onClick={() => handleStatusChange(orderObj.id, 'shipped')}
                        disabled={updatingId === orderObj.id}
                        className="text-xs py-1.5 px-3 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/40 hover:bg-purple-500/30 font-semibold transition-all flex items-center gap-1 shadow-sm"
                      >
                        <HiTruck className="w-3.5 h-3.5" /> Mark Shipped →
                      </button>
                    )}
                    {statusKey === 'shipped' && (
                      <button
                        onClick={() => handleStatusChange(orderObj.id, 'delivered')}
                        disabled={updatingId === orderObj.id}
                        className="text-xs py-1.5 px-3 rounded-lg bg-green-500/20 text-green-400 border border-green-500/40 hover:bg-green-500/30 font-bold transition-all flex items-center gap-1 shadow-sm"
                      >
                        <HiCheckCircle className="w-3.5 h-3.5" /> Mark as Delivered ✓
                      </button>
                    )}
                    {updatingId === orderObj.id && (
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

