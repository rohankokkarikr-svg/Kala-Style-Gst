import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  HiChartPie, 
  HiUserGroup, 
  HiUsers, 
  HiCollection, 
  HiFolder, 
  HiShoppingBag, 
  HiCurrencyRupee, 
  HiSparkles, 
  HiStar, 
  HiExclamationCircle, 
  HiTrendingUp, 
  HiBell, 
  HiTemplate, 
  HiClipboardList, 
  HiCog, 
  HiLogout, 
  HiMenu, 
  HiX,
  HiExternalLink
} from 'react-icons/hi';
import { useAuth } from '../../context/AuthContext';
import NotificationCenter from '../../components/NotificationCenter';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navSections = [
    {
      group: 'Overview',
      items: [
        { name: 'Dashboard', path: '/admin', icon: HiChartPie, exact: true },
        { name: 'Analytics', path: '/admin/analytics', icon: HiTrendingUp },
      ]
    },
    {
      group: 'Community',
      items: [
        { name: 'Artisans', path: '/admin/artisans', icon: HiUserGroup },
        { name: 'Customers', path: '/admin/customers', icon: HiUsers },
      ]
    },
    {
      group: 'Catalog & Orders',
      items: [
        { name: 'Products', path: '/admin/products', icon: HiCollection },
        { name: 'Categories', path: '/admin/categories', icon: HiFolder },
        { name: 'Orders', path: '/admin/orders', icon: HiShoppingBag },
        { name: 'Payments', path: '/admin/payments', icon: HiCurrencyRupee },
      ]
    },
    {
      group: 'Intelligence & Safety',
      items: [
        { name: 'AI Operations Manager', path: '/admin/ai-manager', icon: HiSparkles, highlight: true },
        { name: 'Reviews', path: '/admin/reviews', icon: HiStar },
        { name: 'Reports & Safety', path: '/admin/reports', icon: HiExclamationCircle },
      ]
    },
    {
      group: 'Platform & Content',
      items: [
        { name: 'Notifications', path: '/admin/notifications', icon: HiBell },
        { name: 'Content & Banners', path: '/admin/content', icon: HiTemplate },
        { name: 'Activity Logs', path: '/admin/activity', icon: HiClipboardList },
        { name: 'Settings', path: '/admin/settings', icon: HiCog },
      ]
    }
  ];

  const isActive = (item) => {
    if (item.exact) {
      return location.pathname === '/admin' || location.pathname === '/admin/dashboard';
    }
    if (item.path === '/admin/ai-manager') {
      return location.pathname.startsWith('/admin/ai-manager') || location.pathname === '/admin/ai';
    }
    return location.pathname.startsWith(item.path);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-dark-900 flex text-gray-100">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:sticky top-0 left-0 z-50 h-screen w-64 bg-dark-800 border-r border-dark-600 
        transform transition-transform duration-300 ease-in-out flex flex-col
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Brand Header */}
        <div className="p-5 border-b border-dark-600 flex justify-between items-center bg-dark-850">
          <Link to="/admin" className="flex items-center gap-3">
            <img
              src="/images/kalastyle_logo.png"
              alt="KalaStyle AI"
              className="h-10 w-10 object-cover rounded-full ring-2 ring-gold-500/80 shadow-gold"
            />
            <div>
              <div className="font-serif text-lg font-bold gold-text">KalaStyle AI</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Admin Center
              </div>
            </div>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-400 hover:text-white p-1">
            <HiX className="w-6 h-6" />
          </button>
        </div>

        {/* User Info Capsule */}
        <div className="px-4 py-3 border-b border-dark-600/70 bg-dark-700/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-gold-500/20 border border-gold-500/40 text-gold-400 flex items-center justify-center font-bold text-xs shrink-0">
              {user?.name?.charAt(0) || 'A'}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-white truncate">{user?.name || 'Administrator'}</p>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-gold-500/20 text-gold-400 font-medium">Platform Admin</span>
            </div>
          </div>
          <Link to="/" target="_blank" title="View Storefront" className="text-gray-400 hover:text-gold-400 p-1">
            <HiExternalLink className="w-4 h-4" />
          </Link>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-4 text-sm custom-scrollbar">
          {navSections.map((sec, idx) => (
            <div key={idx} className="space-y-1">
              <p className="px-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                {sec.group}
              </p>
              {sec.items.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-all text-xs ${
                      active 
                        ? 'bg-gold-500/20 text-gold-400 border border-gold-500/40 shadow-sm' 
                        : 'text-gray-300 hover:text-white hover:bg-dark-700/60'
                    } ${item.highlight && !active ? 'border border-gold-500/20 bg-gold-500/5 text-gold-300' : ''}`}
                  >
                    <item.icon className={`w-4 h-4 shrink-0 ${active ? 'text-gold-400' : 'text-gray-400'}`} />
                    <span className="truncate">{item.name}</span>
                    {item.badge ? (
                      <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                        {item.badge}
                      </span>
                    ) : item.highlight ? (
                      <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-gold-500/20 text-gold-400 font-bold border border-gold-500/30">
                        AI
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer Actions */}
        <div className="p-3 border-t border-dark-600 bg-dark-850 space-y-1">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-gold-400 hover:bg-dark-700/50 transition-colors"
          >
            <span>←</span> Back to Storefront
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 w-full rounded-lg text-xs text-red-400 hover:bg-red-400/10 hover:text-red-300 transition-colors"
          >
            <HiLogout className="w-4 h-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-dark-900 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-dark-600/80 bg-dark-800/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden text-gray-400 hover:text-white p-2 rounded-lg hover:bg-dark-700"
            >
              <HiMenu className="w-6 h-6" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
              <span className="font-serif text-gold-400 font-semibold">Admin Center</span>
              <span>/</span>
              <span className="text-gray-200 capitalize">
                {location.pathname.replace('/admin/', '').replace('/admin', 'Dashboard')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NotificationCenter />
            <Link
              to="/admin/ai"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-500/10 border border-gold-500/30 text-gold-400 text-xs font-semibold hover:bg-gold-500/20 transition-all"
            >
              <HiSparkles className="w-3.5 h-3.5" />
              <span>AI Operations</span>
            </Link>
            <div className="h-6 w-px bg-dark-600 hidden sm:block" />
            <Link
              to="/"
              target="_blank"
              className="btn-secondary text-xs px-3 py-1.5 hidden sm:flex items-center gap-1.5"
            >
              <HiExternalLink className="w-3.5 h-3.5" /> Storefront
            </Link>
          </div>
        </header>

        {/* Viewport */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
