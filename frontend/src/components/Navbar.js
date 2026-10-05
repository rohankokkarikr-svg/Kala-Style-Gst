import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useRecommendations } from '../context/RecommendationContext';
import {
  HiShoppingCart,
  HiHeart,
  HiMenu,
  HiX,
  HiSearch,
  HiLogout,
  HiChartBar,
  HiStar,
  HiChevronDown,
  HiUser
} from 'react-icons/hi';
import { FaTrophy } from 'react-icons/fa';
import UserAvatar from './UserAvatar';
import NotificationCenter from './NotificationCenter';

const POPULAR_SEARCHES = [
  'Banarasi Silk Saree',
  'Mithila Madhubani Art',
  'Channapatna Wooden Toys',
  'Jaipur Blue Pottery',
  'Pashmina Shawl',
  'Dokra Brass Jewelry',
  'Assam Bamboo Basket',
  'Lucknowi Chikankari Kurta',
  'Terracotta Clay Pot',
  'Golden Jute Rug'
];

// Clean category links with pure typography (NO emojis or symbols)
const NAV_CATEGORIES = [
  { label: 'All Handicrafts', href: '/products' },
  { label: 'Textiles', href: '/products?category=Handloom+%26+Textiles' },
  { label: 'Home Décor', href: '/products?category=Home+D%C3%A9cor+%26+Furnishings' },
  { label: 'Jewelry', href: '/products?category=Handmade+Jewelry+%26+Accessories' },
  { label: 'Pottery', href: '/products?category=Pottery+%26+Terracotta' },
  { label: 'Woodcraft', href: '/products?category=Wooden+Handicrafts' },
  { label: 'Paintings', href: '/products?category=Traditional+Paintings+%26+Wall+Art' },
  { label: 'Eco-Friendly', href: '/products?category=Eco-Friendly+%26+Natural+Products' },
];

export default function Navbar() {
  const { user, logout, isAdmin, isArtisan } = useAuth();
  const { totalItems } = useCart();
  const { totalWishlistItems } = useWishlist();
  const { trackSearch } = useRecommendations();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    if (searchQuery.trim()) {
      trackSearch(searchQuery.trim());
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setSearchOpen(false);
    }
  };

  const handleSuggestionClick = (term) => {
    trackSearch(term);
    navigate(`/products?search=${encodeURIComponent(term)}`);
    setSearchQuery('');
    setSearchOpen(false);
  };

  const isCurrentCategory = (href) => {
    if (href === '/products') {
      return location.pathname === '/products' && !location.search;
    }
    if (href.includes('?category=')) {
      const catParam = new URLSearchParams(href.split('?')[1]).get('category');
      const curParam = new URLSearchParams(location.search).get('category');
      if (!curParam || !catParam) return false;
      const clean = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      return clean(curParam) === clean(catParam);
    }
    return false;
  };

  return (
    <>
      {/* 
        Solid opaque background (bg-dark-900) ensures no page text/breadcrumbs 
        bleed through or cause overlapping "text over text"
      */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-dark-900 border-b border-dark-700/90 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20 gap-4">
            
            {/* 1. Left: Brand Logo & Title */}
            <Link to="/" className="flex items-center gap-2.5 sm:gap-3 shrink-0">
              <img
                src="/images/kalastyle_logo.png"
                alt="KalaStyle AI"
                className="h-9 w-9 sm:h-11 sm:w-11 object-cover rounded-full ring-2 ring-gold-500/80 shadow-gold"
              />
              <div className="flex flex-col leading-tight">
                <span className="font-serif text-base sm:text-xl font-bold gold-text whitespace-nowrap">
                  KalaStyle AI
                </span>
                <span className="text-[8px] sm:text-[9px] text-gray-400 tracking-widest uppercase font-semibold whitespace-nowrap">
                  Artisan Marketplace
                </span>
              </div>
            </Link>

            {/* 2. Center: Clean Category Navigation Links (NO symbols/emojis, perfectly aligned) */}
            <nav className="hidden xl:flex items-center gap-6">
              {NAV_CATEGORIES.map((item) => (
                <Link
                  key={item.label}
                  to={item.href}
                  className={`text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap ${
                    isCurrentCategory(item.href)
                      ? 'text-gold-400 border-b-2 border-gold-500 pb-1'
                      : 'text-gray-300 hover:text-gold-400'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* 3. Right: Search, Wishlist, Cart & Account */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">

              {/* Search Toggle Button */}
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className={`p-2 rounded-full transition-colors ${
                  searchOpen
                    ? 'bg-gold-500 text-dark-950 shadow-gold'
                    : 'text-gray-300 hover:text-gold-400 hover:bg-dark-800'
                }`}
                aria-label="Search"
                title="Search products"
              >
                <HiSearch className="w-5 h-5" />
              </button>

              {/* Wishlist Link */}
              <Link
                to="/wishlist"
                className="relative p-2 text-gray-300 hover:text-red-400 hover:bg-dark-800 rounded-full transition-colors"
                aria-label="Wishlist"
                title="My Wishlist"
              >
                <HiHeart className="w-5 h-5" />
                {totalWishlistItems > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] font-bold h-4.5 min-w-4.5 px-1 rounded-full flex items-center justify-center shadow-md">
                    {totalWishlistItems}
                  </span>
                )}
              </Link>

              {/* Cart Link */}
              <Link
                to="/cart"
                className="relative p-2 text-gray-300 hover:text-gold-400 hover:bg-dark-800 rounded-full transition-colors"
                aria-label="Cart"
                title="My Shopping Cart"
              >
                <HiShoppingCart className="w-5 h-5" />
                {totalItems > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-gold-500 text-dark-950 text-[10px] font-extrabold h-4.5 min-w-4.5 px-1 rounded-full flex items-center justify-center shadow-gold">
                    {totalItems}
                  </span>
                )}
              </Link>
              {/* Notification Center */}
              <NotificationCenter />

              {/* User Avatar / Sign In */}
              {user ? (
                <div className="relative group">
                  <button className="flex items-center gap-1.5 p-1 pl-2 pr-2.5 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-full transition-all">
                    <UserAvatar name={user.name} size={28} ring />
                    <span className="hidden lg:block text-xs font-semibold text-gray-200">
                      {user.name?.split(' ')[0]}
                    </span>
                    {isAdmin && (
                      <span className="hidden xl:inline-block px-1.5 py-0.2 bg-gold-500/20 text-gold-400 border border-gold-500/40 rounded text-[9px] font-bold">
                        ADMIN
                      </span>
                    )}
                    <HiChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gold-400 transition-transform group-hover:rotate-180" />
                  </button>

                  {/* Dropdown Menu */}
                  <div className="absolute right-0 top-full mt-2 w-52 bg-dark-900 border border-dark-600 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 p-2 z-50">
                    <div className="px-3 py-2 border-b border-dark-700 mb-1">
                      <p className="text-xs font-bold text-white truncate">{user.name}</p>
                      <p className="text-[10px] text-gold-400 uppercase tracking-wider font-semibold">
                        {isAdmin ? '👑 Administrator' : isArtisan ? '🎨 Master Artisan' : 'Member'}
                      </p>
                    </div>

                    {isAdmin && (
                      <Link to="/admin" className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-gold-500/15 hover:bg-gold-500/25 text-xs text-gold-300 font-bold border border-gold-500/30 mb-1">
                        <HiChartBar className="w-4 h-4 text-gold-400" /> Admin Control Center
                      </Link>
                    )}

                    <Link to="/profile" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-dark-800 text-xs text-gray-300 hover:text-white">
                      <HiUser className="w-3.5 h-3.5 text-gold-400" /> My Profile
                    </Link>
                    <Link to="/leaderboard" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-dark-800 text-xs text-gray-300 hover:text-white">
                      <FaTrophy className="w-3.5 h-3.5 text-gold-400" /> Leaderboard
                    </Link>
                    <Link to="/wishlist" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-dark-800 text-xs text-gray-300 hover:text-white">
                      <HiHeart className="w-3.5 h-3.5 text-red-400" /> My Wishlist
                    </Link>
                    <Link to="/orders" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-dark-800 text-xs text-gray-300 hover:text-white">
                      <HiShoppingCart className="w-3.5 h-3.5 text-gray-400" /> My Orders
                    </Link>
                    <Link to="/rewards" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-dark-800 text-xs text-gold-400 hover:text-gold-300">
                      <HiStar className="w-3.5 h-3.5 text-gold-400" /> Rewards
                    </Link>

                    {isArtisan && (
                      <Link to="/artisan" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-gold-500/20 text-xs text-gold-400 font-semibold border-t border-dark-700 mt-1 pt-2">
                        Artisan Studio
                      </Link>
                    )}

                    <button
                      onClick={logout}
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl hover:bg-red-500/20 text-xs text-red-400 hover:text-red-300 border-t border-dark-700 mt-1"
                    >
                      <HiLogout className="w-3.5 h-3.5" /> Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="bg-gold-500 hover:bg-gold-400 text-dark-950 font-bold text-xs px-4 py-2 rounded-full shadow-gold transition-all whitespace-nowrap"
                >
                  Sign In
                </Link>
              )}

              {/* Mobile Drawer Button */}
              <button
                onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
                className="xl:hidden p-2 text-gray-300 hover:text-white hover:bg-dark-800 rounded-full transition-colors"
                aria-label="Toggle navigation menu"
              >
                {mobileDrawerOpen ? <HiX className="w-6 h-6 text-gold-400" /> : <HiMenu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Clean Dropdown Search Bar */}
        {searchOpen && (
          <div className="bg-dark-950 border-t border-dark-700 px-4 py-4 shadow-2xl animate-slide-up">
            <div className="max-w-3xl mx-auto space-y-3">
              <form onSubmit={handleSearchSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Banarasi sarees, Madhubani art, Blue pottery, Brass crafts..."
                    className="w-full bg-dark-800 border border-dark-600 focus:border-gold-500 rounded-full py-2.5 pl-10 pr-10 text-sm text-white placeholder-gray-400 focus:outline-none transition-all shadow-inner"
                  />
                  <HiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gold-500 w-4 h-4 pointer-events-none" />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      <HiX className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  className="bg-gold-500 hover:bg-gold-400 text-dark-950 font-bold px-6 py-2.5 rounded-full text-xs uppercase tracking-wider transition-all shadow-gold"
                >
                  Search
                </button>
              </form>

              {/* Quick Tags (Pure text, no emojis) */}
              <div className="flex items-center flex-wrap gap-2 text-xs">
                <span className="text-gray-400 font-semibold">Popular:</span>
                {POPULAR_SEARCHES.slice(0, 6).map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => handleSuggestionClick(term)}
                    className="px-3 py-1 rounded-full bg-dark-800 hover:bg-gold-500/20 text-gray-300 hover:text-gold-400 border border-dark-700 hover:border-gold-500/40 transition-all text-xs"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Mobile Slide-out Drawer */}
        <div
          className={`fixed inset-0 z-50 bg-black/75 backdrop-blur-sm transition-opacity duration-300 xl:hidden ${
            mobileDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setMobileDrawerOpen(false)}
        />

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] h-screen bg-dark-950 border-r border-dark-700 flex flex-col transform transition-transform duration-300 ease-in-out xl:hidden ${
            mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between p-4 border-b border-dark-700 bg-dark-900">
            <Link to="/" onClick={() => setMobileDrawerOpen(false)} className="flex items-center gap-2.5">
              <img
                src="/images/kalastyle_logo.png"
                alt="KalaStyle AI"
                className="h-8 w-8 object-cover rounded-full ring-2 ring-gold-500/80"
              />
              <span className="font-serif text-base font-bold gold-text">KalaStyle AI</span>
            </Link>
            <button
              onClick={() => setMobileDrawerOpen(false)}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg"
              aria-label="Close menu"
            >
              <HiX className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            <div className="text-[10px] font-bold text-gold-400 uppercase tracking-widest px-3 py-1 mb-1">
              Handicrafts Categories
            </div>

            <Link
              to="/"
              onClick={() => setMobileDrawerOpen(false)}
              className={`block py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
                location.pathname === '/' && !location.search
                  ? 'bg-gold-500 text-dark-950 font-bold'
                  : 'text-gray-300 hover:text-gold-400 hover:bg-dark-800'
              }`}
            >
              Home
            </Link>

            {NAV_CATEGORIES.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                onClick={() => setMobileDrawerOpen(false)}
                className={`block py-2.5 px-3 rounded-xl text-xs font-medium transition-all ${
                  isCurrentCategory(item.href)
                    ? 'bg-gold-500 text-dark-950 font-bold'
                    : 'text-gray-300 hover:text-gold-400 hover:bg-dark-800'
                }`}
              >
                {item.label}
              </Link>
            ))}

            <div className="pt-3 border-t border-dark-800 mt-3 space-y-2">

              <Link
                to="/leaderboard"
                onClick={() => setMobileDrawerOpen(false)}
                className="flex items-center gap-2.5 py-2 px-3 rounded-xl text-xs text-gold-400 hover:text-white hover:bg-dark-800"
              >
                <FaTrophy className="w-4 h-4 text-gold-400" /> Leaderboard
              </Link>

              {user && (
                <>
                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setMobileDrawerOpen(false)}
                      className="flex items-center gap-2.5 py-2 px-3 rounded-xl text-xs text-gold-300 font-bold bg-gold-500/15 border border-gold-500/30 hover:bg-gold-500/25 mb-1"
                    >
                      <HiChartBar className="w-4 h-4 text-gold-400" /> Admin Control Center
                    </Link>
                  )}
                  <Link
                    to="/profile"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 py-2 px-3 rounded-xl text-xs text-gray-300 hover:text-white hover:bg-dark-800"
                  >
                    <HiUser className="w-4 h-4 text-gold-400" /> My Profile
                  </Link>
                  <Link
                    to="/orders"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 py-2 px-3 rounded-xl text-xs text-gray-300 hover:text-white hover:bg-dark-800"
                  >
                    <HiShoppingCart className="w-4 h-4 text-gray-400" /> My Orders
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="p-4 border-t border-dark-700 bg-dark-900">
            {user ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2.5 px-1">
                  <UserAvatar name={user.name} size={32} ring />
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-white truncate">{user.name}</p>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-gold-500/20 text-gold-400 border border-gold-500/30">
                      {isAdmin ? '👑 Administrator' : isArtisan ? '🎨 Artisan' : 'Member'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    logout();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <HiLogout className="w-4 h-4" /> Sign Out
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                onClick={() => setMobileDrawerOpen(false)}
                className="w-full py-2.5 rounded-xl bg-gold-500 text-dark-950 text-xs font-bold text-center block shadow-gold"
              >
                Sign In / Join as Artisan
              </Link>
            )}
          </div>
        </aside>
      </header>

      {/* Spacer to push all page content cleanly below the fixed Navbar */}
      <div className="h-16 md:h-20" />
    </>
  );
}
