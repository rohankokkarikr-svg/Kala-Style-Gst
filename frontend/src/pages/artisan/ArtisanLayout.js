import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { HiChartPie, HiCollection, HiSparkles, HiShoppingBag, HiCurrencyRupee, HiUser, HiLogout, HiMenu, HiX, HiLightBulb, HiChartBar } from 'react-icons/hi';
import { useAuth } from '../../context/AuthContext';
import { artisanAPI } from '../../services/api';
import NotificationCenter from '../../components/NotificationCenter';
import toast from 'react-hot-toast';

export default function ArtisanLayout() {
  const { logout, user, refreshUser } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState(user?.artisan_profile || null);

  // Fetch live artisan profile from server on mount
  useEffect(() => {
    artisanAPI.getMyProfile()
      .then(({ data }) => {
        if (data) setProfile(data);
      })
      .catch(() => {});
  }, []);

  // Synchronize when auth user changes
  useEffect(() => {
    if (user?.artisan_profile) {
      setProfile(user.artisan_profile);
    }
  }, [user]);

  // Real-time listener: immediately update badge when Admin verifies
  useEffect(() => {
    const handleSync = (e) => {
      const payload = e.detail?.payload;
      if (payload?.verification_status) {
        setProfile(prev => ({
          ...(prev || {}),
          verification_status: payload.verification_status,
        }));
        if (payload.verification_status === 'verified') {
          toast.success('🎉 Congratulations! Your artisan store has been verified by Admin!');
        } else if (payload.verification_status === 'suspended') {
          toast.error('⚠️ Your artisan store has been suspended by Admin');
        }
        if (refreshUser) refreshUser();
      }
    };
    window.addEventListener('kala:sync:artisans_updated', handleSync);
    return () => window.removeEventListener('kala:sync:artisans_updated', handleSync);
  }, [refreshUser]);

  const currentStatus = profile?.verification_status || user?.artisan_profile?.verification_status || 'pending';

  const links = [
    { name: 'Dashboard',      path: '/artisan',                icon: HiChartPie },
    { name: 'My Products',    path: '/artisan/products',       icon: HiCollection },
    { name: 'AI Studio',     path: '/artisan/ai-studio',      icon: HiSparkles,     highlight: true },
    { name: 'Price Suggester',path: '/artisan/ai-price',       icon: HiCurrencyRupee, highlight: true },
    { name: 'Artisan Story',  path: '/artisan/ai-story',       icon: HiUser,          highlight: true },
    { name: 'AI Insights',    path: '/artisan/ai-insights',    icon: HiLightBulb,     highlight: true },
    { name: 'Orders',         path: '/artisan/orders',         icon: HiShoppingBag },
    { name: 'Earnings',       path: '/artisan/earnings',       icon: HiCurrencyRupee },
    { name: 'Profile',        path: '/artisan/profile',        icon: HiUser },
  ];

  const isActive = (path) => path === '/artisan' ? location.pathname === '/artisan' : location.pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-dark-900 flex">
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={'fixed md:sticky top-0 left-0 z-50 h-screen w-64 bg-dark-800 border-r border-dark-600 transform transition-transform duration-300 ease-in-out ' + (sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0')}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-dark-600 flex justify-between items-center">
            <Link to="/" className="flex items-center gap-3">
              <img
                src="/images/kalastyle_logo.png"
                alt="KalaStyle AI"
                className="h-10 w-10 object-cover rounded-full ring-2 ring-gold-500/80 shadow-gold"
              />
              <div className="leading-tight">
                <div className="font-serif text-lg font-bold gold-text">KalaStyle AI</div>
                <div className="text-xs text-gray-400 uppercase tracking-widest">Artisan Studio</div>
              </div>
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-400"><HiX className="w-6 h-6" /></button>
          </div>
          {user && (
            <div className="px-4 py-3 border-b border-dark-600 bg-dark-700/50">
              <p className="text-white font-semibold text-sm truncate">{user.name}</p>
              <p className="text-gold-400 text-xs">{profile?.store_name || user.artisan_profile?.store_name || 'Artisan'}</p>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <span className={'text-[10px] px-2 py-0.5 rounded-full font-medium ' + (currentStatus === 'verified' ? 'bg-green-500/20 text-green-400' : currentStatus === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400')}>
                  {currentStatus === 'verified' ? '✓ Verified' : currentStatus === 'rejected' ? '✗ Rejected' : '⏳ Pending Verification'}
                </span>
                {user.role === 'admin' && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-gold-500/20 text-gold-400 border border-gold-500/40">
                    👑 ADMIN
                  </span>
                )}
              </div>
              {user.role === 'admin' && (
                <Link
                  to="/admin"
                  className="flex items-center justify-center gap-2 mt-2.5 py-1.5 px-3 rounded-xl bg-gold-500/15 hover:bg-gold-500/25 border border-gold-500/40 text-gold-300 font-bold text-xs transition-all shadow-gold"
                >
                  <HiChartBar className="w-4 h-4 text-gold-400" /> Switch to Admin Center 🛡️
                </Link>
              )}
            </div>
          )}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {links.map((l) => {
              const active = isActive(l.path);
              return (
                <Link key={l.name} to={l.path} onClick={() => setSidebarOpen(false)}
                  className={'admin-sidebar-item ' + (active ? 'active ' : '') + (l.highlight ? 'bg-gold-500/5 border border-gold-500/20' : '')}>
                  <l.icon className="w-5 h-5 shrink-0" />
                  {l.name}
                  {l.highlight && !active && <span className="ml-auto text-[9px] font-bold text-gold-500 bg-gold-500/10 px-1.5 py-0.5 rounded-full">AI</span>}
                </Link>
              );
            })}
          </nav>
          <div className="p-4 border-t border-dark-600 space-y-2">
            <Link to="/products" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-gold-400 transition-colors">← Back to Shop</Link>
            <button onClick={logout} className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-red-400 hover:bg-red-400/10 transition-colors">
              <HiLogout className="w-5 h-5 shrink-0" /> Logout
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-dark-600 bg-dark-800/90 backdrop-blur-md flex items-center justify-between px-4 md:px-8 shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden text-gray-400 p-2"><HiMenu className="w-6 h-6" /></button>
            <span className="font-serif font-bold text-white text-base md:text-lg">Artisan Workshop Studio</span>
          </div>
          <div className="flex items-center gap-3">
            {user?.role === 'admin' && (
              <Link
                to="/admin"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-gold-300 hover:text-gold-200 bg-gold-500/15 hover:bg-gold-500/25 border border-gold-500/40 px-3 py-1.5 rounded-xl transition-all shadow-gold"
                title="Switch to Admin Control Center"
              >
                <HiChartBar className="w-4 h-4 text-gold-400" />
                <span>Admin Center 🛡️</span>
              </Link>
            )}
            <NotificationCenter />
            <Link to="/products" className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-gray-300 hover:text-gold-400 bg-dark-700/60 border border-dark-600 px-3 py-1.5 rounded-xl transition-all">
              Live Shop →
            </Link>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-8"><Outlet /></div>
      </main>
    </div>
  );
}
