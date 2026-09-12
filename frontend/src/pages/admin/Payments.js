import React, { useEffect, useState, useCallback } from 'react';
import { 
  HiCurrencyRupee, 
  HiClock, 
  HiRefresh,
  HiSearch,
  HiFilter,
  HiCheck,
  HiCreditCard,
  HiLightningBolt,
  HiShieldCheck
} from 'react-icons/hi';
import { adminAPI } from '../../services/api';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';
import toast from 'react-hot-toast';

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isLiveConnected, setIsLiveConnected] = useState(true);

  // Hook for triggering global real-time synchronization
  const { triggerLiveSync } = useRealtimeSync('PAYMENTS_UPDATED', () => {
    fetchPayments(false);
  });

  const fetchPayments = useCallback(async (isManual = false) => {
    if (isManual) {
      setIsRefreshing(true);
    }
    try {
      const { data } = await adminAPI.getPayments();
      setPayments(data || []);
      setLastUpdated(new Date());
      setIsLiveConnected(true);
      if (isManual) {
        toast.success('Payment transactions updated');
      }
    } catch (err) {
      console.error('Failed to fetch payment records:', err);
      if (isManual) {
        toast.error('Failed to load payment records');
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // ─── Real-time Subscriptions & Listeners ───────────────────────────
  useEffect(() => {
    fetchPayments(false);

    // 1. DOM Realtime Events from RealtimeSyncContext (BroadcastChannel & Socket.IO)
    const handleSyncEvent = () => {
      fetchPayments(false);
    };

    window.addEventListener('kala:sync:payments_updated', handleSyncEvent);
    window.addEventListener('kala:sync:orders_updated', handleSyncEvent);
    window.addEventListener('kala:sync:all', handleSyncEvent);
    setIsLiveConnected(true);

    return () => {
      window.removeEventListener('kala:sync:payments_updated', handleSyncEvent);
      window.removeEventListener('kala:sync:orders_updated', handleSyncEvent);
      window.removeEventListener('kala:sync:all', handleSyncEvent);
    };
  }, [fetchPayments]);

  // ─── Direct Real-time Payment Status Update ────────────────────────
  const handleUpdateStatus = async (orderId, newStatus) => {
    if (!orderId || updatingId) return;
    setUpdatingId(orderId);

    const previousPayments = [...payments];
    const normalizedStatus = (newStatus === 'paid' || newStatus === 'successful') ? 'successful' : newStatus;

    // Optimistic UI update
    setPayments(prev =>
      prev.map(p => {
        if (p.orderId === orderId) {
          return {
            ...p,
            status: normalizedStatus,
            rawPaymentStatus: newStatus
          };
        }
        return p;
      })
    );

    try {
      const dbPaymentStatus = (newStatus === 'successful' || newStatus === 'paid') ? 'paid' : newStatus;
      await adminAPI.updatePaymentStatus(orderId, {
        payment_status: dbPaymentStatus,
      });

      // Broadcast real-time change across all devices
      triggerLiveSync('PAYMENTS_UPDATED', { orderId, payment_status: dbPaymentStatus });
      triggerLiveSync('ORDERS_UPDATED', { orderId, payment_status: dbPaymentStatus });

      toast.success(`Payment #${orderId.slice(0, 8)} marked as ${dbPaymentStatus.toUpperCase()}`);
    } catch (err) {
      console.error('Failed to update payment status:', err);
      // Rollback optimistic state
      setPayments(previousPayments);
      toast.error('Failed to update payment status on server');
    } finally {
      setUpdatingId(null);
    }
  };

  // ─── Filtered Payments ─────────────────────────────────────────────
  const filteredPayments = payments.filter(p => {
    const s = (p.status || '').toLowerCase();
    const matchesSearch = !search || 
      p.transactionId?.toLowerCase().includes(search.toLowerCase()) ||
      p.customerName?.toLowerCase().includes(search.toLowerCase()) ||
      p.customerEmail?.toLowerCase().includes(search.toLowerCase()) ||
      p.customerPhone?.toLowerCase().includes(search.toLowerCase()) ||
      p.orderId?.toLowerCase().includes(search.toLowerCase()) ||
      p.paymentMethod?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'successful' && (s === 'successful' || s === 'paid' || s === 'completed')) ||
      (statusFilter === 'pending' && s === 'pending') ||
      (statusFilter === 'failed' && s === 'failed') ||
      (statusFilter === 'refunded' && s === 'refunded');

    const m = (p.paymentMethod || '').toLowerCase();
    const matchesMethod = methodFilter === 'all' ||
      (methodFilter === 'cod' && m.includes('cod')) ||
      (methodFilter === 'upi' && m.includes('upi')) ||
      (methodFilter === 'card' && (m.includes('card') || m.includes('razorpay')));

    return matchesSearch && matchesStatus && matchesMethod;
  });

  // ─── Real-time Financial Calculations ──────────────────────────────
  const totalSettledVolume = payments
    .filter(p => {
      const s = (p.status || '').toLowerCase();
      return s === 'successful' || s === 'paid' || s === 'completed';
    })
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const totalPendingVolume = payments
    .filter(p => (p.status || '').toLowerCase() === 'pending')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const successfulCount = payments.filter(p => {
    const s = (p.status || '').toLowerCase();
    return s === 'successful' || s === 'paid' || s === 'completed';
  }).length;



  const getMethodBadge = (method = '') => {
    const m = (method || '').toLowerCase();
    if (m.includes('cod')) {
      return (
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
          💵 COD (Cash)
        </span>
      );
    }
    if (m.includes('phonepe') || m.includes('gpay') || m.includes('upi')) {
      return (
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
          <HiLightningBolt className="w-3 h-3 text-cyan-400" /> UPI Intent / QR
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
        <HiCreditCard className="w-3 h-3 text-purple-400" /> Razorpay Online
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header with Live Real-time Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-dark-800/40 p-4 rounded-xl border border-dark-600/40">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-serif font-bold text-white flex items-center gap-2">
              <HiCurrencyRupee className="text-gold-400 w-7 h-7" /> Payment Monitoring & Settlements
            </h1>
            
            {/* Live Streaming Indicator */}
            <div className={`flex items-center gap-2 ${isLiveConnected ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-emerald-500/10' : 'bg-gray-500/15 border-gray-500/30 text-gray-400'} border px-3 py-1 rounded-full text-xs font-semibold shadow-sm`}>
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isLiveConnected ? 'bg-emerald-400' : 'bg-gray-400'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isLiveConnected ? 'bg-emerald-500' : 'bg-gray-500'}`}></span>
              </span>
              <span className="tracking-wide text-[11px] font-mono">{isLiveConnected ? 'LIVE REALTIME DATA' : 'CONNECTING...'}</span>
            </div>
          </div>
          <p className="text-gray-400 text-sm mt-1">
            Real-time tracking of marketplace transactions, payment gateways, and settlement records.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {lastUpdated && (
            <span className="text-[11px] text-gray-400 font-mono hidden md:inline">
              Updated: {lastUpdated.toLocaleTimeString('en-IN')}
            </span>
          )}
          <button
            onClick={() => fetchPayments(true)}
            disabled={isRefreshing}
            className="btn-secondary flex items-center gap-2 text-xs py-2 px-3 hover:border-gold-500/40 transition-all"
            title="Force refresh transaction records"
          >
            <HiRefresh className={`w-4 h-4 text-gold-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Refresh Transactions'}</span>
          </button>
        </div>
      </div>

      {/* Financial Metrics Cards (Calculated in Real-Time) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Settled Volume */}
        <div className="card p-5 border-l-4 border-l-green-500 relative overflow-hidden bg-gradient-to-br from-green-500/5 to-transparent">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Settled Volume</p>
              <p className="text-2xl font-bold text-white mt-1">₹{totalSettledVolume.toLocaleString('en-IN')}</p>
            </div>
            <span className="p-2 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30">
              <HiShieldCheck className="w-5 h-5" />
            </span>
          </div>
          <p className="text-[11px] text-green-400 mt-2 flex items-center gap-1 font-medium">
            <span>✓ Verified platform payments ({successfulCount} orders)</span>
          </p>
        </div>

        {/* Total Transactions & Pending */}
        <div className="card p-5 border-l-4 border-l-blue-500 relative overflow-hidden bg-gradient-to-br from-blue-500/5 to-transparent">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Transactions</p>
              <p className="text-2xl font-bold text-white mt-1">{payments.length}</p>
            </div>
            <span className="p-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <HiClock className="w-5 h-5" />
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            ₹{totalPendingVolume.toLocaleString('en-IN')} pending settlement
          </p>
        </div>

        {/* Gateway Health */}
        <div className="card p-5 border-l-4 border-l-gold-500 relative overflow-hidden bg-gradient-to-br from-gold-500/5 to-transparent">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Platform Gateway Health</p>
              <p className="text-2xl font-bold text-gold-400 mt-1">100% Operational</p>
            </div>
            <span className="p-2 rounded-lg bg-gold-500/20 text-gold-400 border border-gold-500/30">
              <HiCreditCard className="w-5 h-5" />
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-mono">
            Razorpay UPI, Cards & COD Active
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="card p-4 flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full lg:w-96">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by transaction ID, customer, order ID, phone..."
            className="w-full bg-dark-700 border border-dark-500 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-gold-500/60"
          />
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto flex-wrap justify-between lg:justify-end">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <HiFilter className="text-gray-500 w-4 h-4 shrink-0" />
            <span className="text-xs text-gray-400 shrink-0 mr-1">Status:</span>
            {['all', 'successful', 'pending', 'failed', 'refunded'].map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`text-xs px-2.5 py-1.5 rounded-lg capitalize transition-all border ${
                  statusFilter === st 
                    ? 'bg-gold-500/20 border-gold-500/50 text-gold-400 font-semibold' 
                    : 'border-dark-600 text-gray-400 hover:text-white hover:border-dark-500'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Method Filter */}
          <div className="flex items-center gap-1">
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="bg-dark-700 border border-dark-500 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-gold-500/60"
            >
              <option value="all">All Methods</option>
              <option value="cod">Cash on Delivery (COD)</option>
              <option value="upi">UPI / Intent</option>
              <option value="card">Cards / Online</option>
            </select>
          </div>
        </div>
      </div>

      {/* Real-time Transactions Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-14 shimmer rounded-lg" />)}
          </div>
        ) : filteredPayments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-dark-800/80 text-gray-400 border-b border-dark-600 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Transaction ID</th>
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status & Action</th>
                  <th className="py-3 px-4 text-right">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/50">
                {filteredPayments.map((p, idx) => {
                  const currentStatus = (p.status || 'pending').toLowerCase();
                  const isPending = currentStatus === 'pending';
                  const isUpdating = updatingId === p.orderId;

                  return (
                    <tr key={p.orderId || idx} className="hover:bg-dark-700/30 transition-colors">
                      {/* Transaction ID */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-gold-400 font-semibold">{p.transactionId}</span>
                      </td>

                      {/* Order ID */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-gray-400">
                          #{p.orderId ? p.orderId.slice(0, 8).toUpperCase() : '-'}
                        </span>
                      </td>

                      {/* Customer Info */}
                      <td className="py-3 px-4">
                        <p className="font-semibold text-white truncate">{p.customerName || 'Customer'}</p>
                        <p className="text-gray-400 text-[10px] truncate font-mono">
                          {p.customerPhone || p.customerEmail || 'No contact'}
                        </p>
                      </td>

                      {/* Payment Method */}
                      <td className="py-3 px-4">
                        {getMethodBadge(p.paymentMethod)}
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-white text-sm">
                          ₹{(Number(p.amount) || 0).toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* Status & Live Real-Time Management */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          {p.rawPaymentStatus === 'pending_verification' || p.orderStatus === 'payment_verification_pending' ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm" title="Only the related artisan can confirm this UTR">
                                <HiClock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                                <span>Awaiting Artisan UTR Confirmation</span>
                              </span>
                            </div>
                          ) : (
                            <>
                              {/* Live Status Selector */}
                              <div className="relative">
                                <select
                                  value={p.status === 'paid' ? 'successful' : p.status}
                                  disabled={isUpdating}
                                  onChange={(e) => handleUpdateStatus(p.orderId, e.target.value)}
                                  className={`text-xs rounded-lg px-2.5 py-1 font-semibold border transition-all cursor-pointer bg-dark-800 ${
                                    (p.status === 'successful' || p.status === 'paid')
                                      ? 'border-emerald-500/50 text-emerald-400 hover:border-emerald-400'
                                      : p.status === 'failed'
                                      ? 'border-red-500/50 text-red-400 hover:border-red-400'
                                      : p.status === 'refunded'
                                      ? 'border-blue-500/50 text-blue-400 hover:border-blue-400'
                                      : 'border-yellow-500/50 text-yellow-400 hover:border-yellow-400'
                                  } focus:outline-none`}
                                >
                                  <option value="pending" className="bg-dark-800 text-yellow-400">🟡 Pending</option>
                                  <option value="successful" className="bg-dark-800 text-emerald-400">🟢 Successful / Paid</option>
                                  <option value="failed" className="bg-dark-800 text-red-400">🔴 Failed</option>
                                  <option value="refunded" className="bg-dark-800 text-blue-400">🔵 Refunded</option>
                                </select>
                              </div>

                              {/* 1-Click Quick Action: Mark Paid if pending */}
                              {isPending && (
                                <button
                                  onClick={() => handleUpdateStatus(p.orderId, 'paid')}
                                  disabled={isUpdating}
                                  className="px-2 py-1 text-[10px] font-semibold rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/40 transition-all flex items-center gap-1 shadow-sm"
                                  title="1-Click Mark as Paid / Verified"
                                >
                                  <HiCheck className="w-3 h-3" />
                                  <span>{isUpdating ? 'Saving...' : 'Mark Paid'}</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>

                      {/* Date & Time */}
                      <td className="py-3 px-4 text-right text-gray-400 font-mono text-[11px]">
                        {p.date ? new Date(p.date).toLocaleString('en-IN') : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-gray-400 space-y-2">
            <HiClock className="w-8 h-8 text-gray-500 mx-auto" />
            <p className="text-sm font-semibold">No transactions match your search or filter</p>
            <p className="text-xs text-gray-500">Real-time sync is actively waiting for new orders and payments.</p>
          </div>
        )}
      </div>
    </div>
  );
}
