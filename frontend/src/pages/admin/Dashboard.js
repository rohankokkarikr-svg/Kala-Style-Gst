import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  HiUserGroup, 
  HiUsers, 
  HiCollection, 
  HiShoppingBag, 
  HiCurrencyRupee, 
  HiSparkles, 
  HiArrowRight, 
  HiRefresh,
  HiCheckCircle,
  HiClock,
  HiXCircle,
  HiPlus,
  HiBell,
  HiEye
} from 'react-icons/hi';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const { data: res } = await adminAPI.getOverview();
      setData(res);
    } catch (err) {
      console.error('Failed to load admin overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-dark-800 via-dark-800 to-gold-500/10 border border-dark-600 p-6 rounded-2xl">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-white flex items-center gap-3">
            <span>Marketplace Control Center</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-sans font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Synchronized
            </span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Complete platform oversight for Indian Artisans, Customers, Products, and AI Operations.
          </p>
        </div>
        <button
          onClick={fetchOverview}
          disabled={loading}
          className="btn-secondary self-start sm:self-auto flex items-center gap-2 text-xs py-2 px-3 shrink-0"
        >
          <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Primary KPI Stats Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="card h-28 shimmer" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Total Artisans */}
          <div className="card p-4 flex flex-col justify-between border-l-4 border-l-gold-500">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400">Total Artisans</span>
              <div className="p-2 rounded-lg bg-gold-500/10 text-gold-400">
                <HiUserGroup className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-white">{data?.totalArtisans || 0}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                <span className="text-green-400 font-semibold">{data?.verifiedArtisans || 0}</span> verified
                {data?.pendingArtisans > 0 && <span className="text-yellow-400 ml-1">({data.pendingArtisans} pending)</span>}
              </p>
            </div>
          </div>

          {/* Total Customers */}
          <div className="card p-4 flex flex-col justify-between border-l-4 border-l-blue-500">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400">Customers</span>
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <HiUsers className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-white">{data?.totalCustomers || 0}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Registered buyers</p>
            </div>
          </div>

          {/* Total Products */}
          <div className="card p-4 flex flex-col justify-between border-l-4 border-l-purple-500">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400">Total Products</span>
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                <HiCollection className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-white">{data?.productStats?.total || 0}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                <span className="text-green-400">{data?.productStats?.active || 0}</span> live / <span className="text-red-400">{data?.productStats?.outOfStock || 0}</span> OOS
              </p>
            </div>
          </div>

          {/* Total Orders */}
          <div className="card p-4 flex flex-col justify-between border-l-4 border-l-emerald-500">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400">Total Orders</span>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <HiShoppingBag className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-white">{data?.orderStats?.total || 0}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                <span className="text-yellow-400">{data?.orderStats?.pending || 0} pending</span>
              </p>
            </div>
          </div>

          {/* Total Revenue */}
          <div className="card p-4 flex flex-col justify-between border-l-4 border-l-cyan-500">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400">Revenue</span>
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <HiCurrencyRupee className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-white">₹{(data?.totalRevenue || 0).toLocaleString('en-IN')}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Platform GMV</p>
            </div>
          </div>

          {/* AI Catalogs */}
          <div className="card p-4 flex flex-col justify-between border-l-4 border-l-pink-500">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400">AI Powered</span>
              <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400">
                <HiSparkles className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-white">{data?.productStats?.aiGenerated || 0}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">AI catalogs generated</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Action Matrix */}
      <div className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-white">⚡ Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Add Category', path: '/admin/categories', icon: HiPlus, color: 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20' },
            { label: 'Pending Artisans', path: '/admin/artisans?status=pending', icon: HiUserGroup, color: 'text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20' },
            { label: 'Review Products', path: '/admin/products', icon: HiCollection, color: 'text-purple-400 bg-purple-500/10 hover:bg-purple-500/20' },
            { label: 'Manage Orders', path: '/admin/orders', icon: HiShoppingBag, color: 'text-green-400 bg-green-500/10 hover:bg-green-500/20' },
            { label: 'Broadcast Alert', path: '/admin/notifications', icon: HiBell, color: 'text-pink-400 bg-pink-500/10 hover:bg-pink-500/20' },
            { label: 'AI Review', path: '/admin/ai', icon: HiSparkles, color: 'text-gold-400 bg-gold-500/10 hover:bg-gold-500/20' },
          ].map((a, i) => (
            <Link
              key={i}
              to={a.path}
              className={`p-3.5 rounded-xl border border-dark-600 flex flex-col items-center justify-center text-center gap-2 transition-all group ${a.color}`}
            >
              <a.icon className="w-5 h-5 transition-transform group-hover:scale-110" />
              <span className="text-xs font-semibold text-white">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Operational Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Status Breakdown */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">Order Status Flow</h3>
            <Link to="/admin/orders" className="text-xs text-gold-400 hover:underline">View All</Link>
          </div>
          <div className="space-y-2.5">
            {[
              { label: 'Pending Payment / Verification', count: data?.orderStats?.pending || 0, color: 'bg-yellow-500', icon: HiClock },
              { label: 'Processing in Workshop', count: data?.orderStats?.processing || 0, color: 'bg-blue-500', icon: HiRefresh },
              { label: 'Shipped & In-Transit', count: data?.orderStats?.shipped || 0, color: 'bg-purple-500', icon: HiArrowRight },
              { label: 'Delivered to Customer', count: data?.orderStats?.delivered || 0, color: 'bg-green-500', icon: HiCheckCircle },
              { label: 'Cancelled / Returned', count: data?.orderStats?.cancelled || 0, color: 'bg-red-500', icon: HiXCircle },
            ].map((s, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-dark-700/50 border border-dark-600/70 text-xs">
                <div className="flex items-center gap-2.5 text-gray-300">
                  <span className={`w-2 h-2 rounded-full ${s.color}`} />
                  <span>{s.label}</span>
                </div>
                <span className="font-bold text-white">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Product Catalog Breakdown */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">Product Inventory Health</h3>
            <Link to="/admin/products" className="text-xs text-gold-400 hover:underline">Manage</Link>
          </div>
          <div className="space-y-2.5">
            {[
              { label: 'Active Live Listings', count: data?.productStats?.active || 0, text: 'text-green-400' },
              { label: 'Pending Quality Approval', count: data?.productStats?.pending || 0, text: 'text-yellow-400' },
              { label: 'Rejected / Needs Revision', count: data?.productStats?.rejected || 0, text: 'text-red-400' },
              { label: 'Out of Stock Items', count: data?.productStats?.outOfStock || 0, text: 'text-gray-400' },
              { label: 'AI Enhanced Listings', count: data?.productStats?.aiGenerated || 0, text: 'text-gold-400' },
            ].map((p, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-dark-700/50 border border-dark-600/70 text-xs">
                <span className="text-gray-300">{p.label}</span>
                <span className={`font-bold ${p.text}`}>{p.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Real-time Activity Feed */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">Recent Platform Activity</h3>
            <Link to="/admin/activity" className="text-xs text-gold-400 hover:underline">Full Log</Link>
          </div>
          {data?.recentActivity?.length > 0 ? (
            <div className="space-y-3">
              {data.recentActivity.map((act, idx) => (
                <div key={idx} className="flex items-start gap-3 p-2.5 rounded-lg bg-dark-700/40 border border-dark-600/50 text-xs">
                  <div className="p-1.5 rounded-full bg-gold-500/10 text-gold-400 shrink-0 mt-0.5">
                    <HiEye className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-gray-200 font-medium truncate">{act.message}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {act.time ? new Date(act.time).toLocaleString('en-IN') : 'Recently'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 text-xs">
              No recent activity recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

