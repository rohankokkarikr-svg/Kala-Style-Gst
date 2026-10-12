import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HiCollection, HiShoppingBag, HiCurrencyRupee, HiSparkles, HiArrowRight, HiStar } from 'react-icons/hi';
import { artisanAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function ArtisanDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    artisanAPI.getMyStats().then(({ data }) => { setStats(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const statCards = stats ? [
    { icon: HiCollection,    label: 'Total Products', value: stats.totalProducts,     color: 'text-blue-400',   bg: 'bg-blue-400/10' },
    { icon: HiShoppingBag,   label: 'Total Orders',   value: stats.totalOrders,       color: 'text-purple-400', bg: 'bg-purple-400/10' },
    { icon: HiCurrencyRupee, label: 'Total Revenue',  value: '₹' + (stats.totalRevenue || 0).toLocaleString(), color: 'text-green-400', bg: 'bg-green-400/10' },
    { icon: HiStar,          label: 'Avg. Rating',    value: '4.5 ★',                 color: 'text-gold-400',   bg: 'bg-gold-400/10' },
  ] : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-serif font-bold text-white">Welcome back, {user?.name?.split(' ')[0]}! 👋</h1>
        <p className="text-gray-400 mt-1">Here's what's happening with your artisan store.</p>
      </div>

      {/* Pending Orders Alert Banner */}
      {!loading && stats?.recentOrders?.some(o => (o.orders?.status === 'pending' || o.orders?.status === 'confirmed' || o.status === 'pending')) && (
        <div className="bg-gradient-to-r from-amber-500/20 via-dark-800 to-gold-500/10 border-2 border-amber-500/40 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg shadow-amber-500/10 animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-amber-500/20 text-amber-400 rounded-lg text-lg">⚡</span>
            <div>
              <p className="text-white font-bold text-sm">Action Required: New Orders Awaiting Your Confirmation!</p>
              <p className="text-gray-300 text-xs mt-0.5">Customers have placed orders. Review customer details and confirm or reject to update their live status bar.</p>
            </div>
          </div>
          <Link to="/artisan/orders?filter=pending" className="px-4 py-2 rounded-lg bg-gold-500 hover:bg-gold-400 text-dark-950 font-bold text-xs shrink-0 transition-all flex items-center gap-1.5 shadow-md">
            Review Orders <HiArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* AI Studio CTA */}
      <div className="bg-gradient-to-r from-gold-500/20 via-gold-500/10 to-transparent border border-gold-500/30 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-serif font-bold text-white flex items-center gap-2">
            <HiSparkles className="w-6 h-6 text-gold-400" /> AI Product Studio
          </h2>
          <p className="text-gray-400 text-sm mt-1">Upload a photo and describe your product — AI does the rest!</p>
        </div>
        <Link to="/artisan/ai-studio" className="btn-primary shrink-0 flex items-center gap-2 whitespace-nowrap">
          Create with AI <HiArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Stat Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <div key={i} className="card p-6 h-28 shimmer" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((s, i) => (
            <div key={i} className="stat-card">
              <div className={'p-3 rounded-xl ' + s.bg}><s.icon className={'w-6 h-6 ' + s.color} /></div>
              <div><p className="text-gray-400 text-sm">{s.label}</p><p className="text-2xl font-bold text-white">{s.value}</p></div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Orders */}
      <div className="card p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-white text-lg">Recent Orders</h3>
          <Link to="/artisan/orders" className="text-gold-400 hover:text-gold-300 text-sm">View All</Link>
        </div>
        {!loading && stats?.recentOrders?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-gray-400 border-b border-dark-500"><th className="pb-2 text-left">Product</th><th className="pb-2 text-left">Qty</th><th className="pb-2 text-left">Amount</th><th className="pb-2 text-left">Status</th></tr></thead>
              <tbody>
                {stats.recentOrders.slice(0,5).map((item, i) => (
                  <tr key={i} className="border-b border-dark-600/50 hover:bg-dark-700/30">
                    <td className="py-2 text-gray-300">{item.products?.name || 'Product'}</td>
                    <td className="py-2 text-gray-400">{item.quantity}</td>
                    <td className="py-2 text-gold-400">Rs.{(item.price_at_time * item.quantity).toLocaleString()}</td>
                    <td className="py-2"><span className="badge bg-green-500/20 text-green-400">{item.orders?.status || 'pending'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <HiShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No orders yet. <Link to="/artisan/ai-studio" className="text-gold-400">Create your first product!</Link></p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-white font-semibold mb-4">AI-Powered Tools</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: 'AI Smart Catalog',   href: '/artisan/ai-studio',   emoji: '🤖', desc: 'Upload photo → AI generates full product listing', ai: true },
            { label: 'Price Suggester',    href: '/artisan/ai-price',    emoji: '💰', desc: 'Transparent cost breakdown + AI price range', ai: true },
            { label: 'My Artisan Story',   href: '/artisan/ai-story',    emoji: '✍️', desc: 'AI writes your biography from your information', ai: true },
            { label: 'AI Insights',        href: '/artisan/ai-insights', emoji: '📊', desc: 'Real data trends and business insights', ai: true },
            { label: 'View My Products',   href: '/artisan/products',    emoji: '📦', desc: 'Manage your inventory' },
            { label: 'Update Profile',     href: '/artisan/profile',     emoji: '🏪', desc: 'Edit store information' },
          ].map((a, i) => (
            <Link key={i} to={a.href} className={'card p-5 hover:border-gold-500/40 group ' + (a.ai ? 'border-gold-500/20' : '')}>
              <div className="flex items-start justify-between mb-2">
                <div className="text-2xl">{a.emoji}</div>
                {a.ai && <span className="text-[9px] font-bold text-gold-500 bg-gold-500/10 px-1.5 py-0.5 rounded-full border border-gold-500/30">AI</span>}
              </div>
              <h4 className="font-semibold text-white group-hover:text-gold-400 transition-colors text-sm">{a.label}</h4>
              <p className="text-gray-500 text-xs mt-1">{a.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
