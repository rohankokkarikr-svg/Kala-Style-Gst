import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  HiSparkles, 
  HiSearch, 
  HiChevronRight, 
  HiUser, 
  HiShoppingBag,
  HiColorSwatch,
  HiArrowSmUp
} from 'react-icons/hi';
import { FaTrophy } from 'react-icons/fa';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Link, useSearchParams } from 'react-router-dom';
import UserAvatar from '../components/UserAvatar';
import toast from 'react-hot-toast';

const LEVEL_COLORS = {
  Elite:   { badge: 'bg-gradient-to-r from-purple-600 to-indigo-600', text: 'text-purple-400', border: 'border-purple-500/40', bg: 'bg-purple-500/10', emoji: '👑' },
  Diamond: { badge: 'bg-gradient-to-r from-cyan-500 to-blue-600',    text: 'text-cyan-300',   border: 'border-cyan-400/40',   bg: 'bg-cyan-500/10',   emoji: '💎' },
  Gold:    { badge: 'bg-gradient-to-r from-yellow-500 to-amber-600', text: 'text-amber-400',  border: 'border-yellow-500/40', bg: 'bg-yellow-500/10', emoji: '🥇' },
  Silver:  { badge: 'bg-gradient-to-r from-slate-400 to-gray-500',   text: 'text-slate-300',  border: 'border-slate-400/40',  bg: 'bg-slate-400/10',  emoji: '🥈' },
  Bronze:  { badge: 'bg-gradient-to-r from-orange-600 to-amber-700', text: 'text-orange-400', border: 'border-orange-500/40', bg: 'bg-orange-500/10', emoji: '🥉' },
};

const MASTERY_COLORS = {
  'Grandmaster Creator': { badge: 'bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600', text: 'text-purple-300', border: 'border-purple-400/50', bg: 'bg-purple-500/10', emoji: '👑' },
  'Master Artisan':      { badge: 'bg-gradient-to-r from-amber-500 to-yellow-600',              text: 'text-amber-300',  border: 'border-amber-400/50',  bg: 'bg-amber-500/10',  emoji: '💎' },
  'Craft Guild Leader':  { badge: 'bg-gradient-to-r from-cyan-500 to-blue-600',                 text: 'text-cyan-300',   border: 'border-cyan-400/50',   bg: 'bg-cyan-500/10',   emoji: '🥇' },
  'Distinguished Maker': { badge: 'bg-gradient-to-r from-slate-400 to-gray-500',                text: 'text-slate-300',  border: 'border-slate-400/50',  bg: 'bg-slate-400/10',  emoji: '🥈' },
  'Rising Artisan':      { badge: 'bg-gradient-to-r from-orange-600 to-amber-700',              text: 'text-orange-400', border: 'border-orange-500/40', bg: 'bg-orange-500/10', emoji: '🥉' },
};

const getLevelCfg = (name) => LEVEL_COLORS[name] || LEVEL_COLORS.Bronze;
const getMasteryCfg = (name) => MASTERY_COLORS[name] || MASTERY_COLORS['Rising Artisan'];

export default function Leaderboard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [leaderboardData, setLeaderboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');

  // Determine initial active tab: check URL param or user's role
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    tabParam === 'artisans' ? 'artisans' : (user?.role === 'artisan' && !tabParam ? 'artisans' : 'customers')
  );

  useEffect(() => {
    if (tabParam === 'artisans' || tabParam === 'customers') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    setSearchFilter('');
    setSearchParams({ tab: newTab });
  };

  useEffect(() => {
    let isMounted = true;
    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        const res = await authAPI.getLeaderboard().catch(() => ({ data: null }));
        if (isMounted && res?.data) {
          setLeaderboardData(res.data);
        }
      } catch (err) {
        toast.error('Failed to load leaderboard');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchLeaderboard();
    return () => { isMounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <div className="w-12 h-12 border-4 border-dark-600 border-t-gold-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Customer Leaderboard Data
  const customerList = leaderboardData?.customers || leaderboardData?.leaderboard || [];
  const currentUserRank = leaderboardData?.currentUserRank;
  const userRankNum = currentUserRank?.rank || 'N/A';

  // Artisan Leaderboard Data
  const artisanList = leaderboardData?.artisans || [];
  const currentArtisanRank = leaderboardData?.currentArtisanRank;
  const artisanRankNum = currentArtisanRank?.rank || 'N/A';

  // Active list based on selected tab
  const isArtisanTab = activeTab === 'artisans';
  const currentList = isArtisanTab ? artisanList : customerList;

  const filteredList = currentList.filter(item => {
    const q = searchFilter.toLowerCase();
    if (isArtisanTab) {
      return (
        (item.storeName || item.name || '').toLowerCase().includes(q) ||
        (item.specialization || item.artisanType || '').toLowerCase().includes(q) ||
        (item.location || '').toLowerCase().includes(q)
      );
    }
    return (item.name || '').toLowerCase().includes(q);
  });

  const top3 = currentList.slice(0, 3);

  return (
    <div className="min-h-screen bg-dark-900 text-white pb-24">
      {/* ── Background Glow ── */}
      <div className="relative pt-10 pb-12 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-gold-500/10 via-amber-500/5 to-transparent blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">

          {/* Top Bar Navigation */}
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-dark-700 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Link
                to={user?.role === 'artisan' ? '/artisan/profile' : '/profile'}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-400 hover:text-white hover:bg-dark-800 transition-colors flex items-center gap-2"
              >
                <HiUser className="w-4 h-4" /> {user?.role === 'artisan' ? 'Artisan Profile' : 'My Profile'}
              </Link>
              <div className="px-4 py-2 rounded-xl text-sm font-bold bg-gold-500/20 text-gold-300 border border-gold-500/40 shadow-gold flex items-center gap-2">
                <FaTrophy className="w-4 h-4 text-gold-400" /> Leaderboard
              </div>
            </div>

            {user && (
              <Link
                to={user?.role === 'artisan' ? '/artisan/dashboard' : '/profile'}
                className="text-xs text-gold-400 hover:text-gold-300 flex items-center gap-1 font-semibold"
              >
                {user?.role === 'artisan' ? 'Go to Artisan Studio' : 'Back to My Profile'} &rarr;
              </Link>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB SWITCHER: CUSTOMERS VS ARTISANS                            */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div className="flex justify-center mb-10">
            <div className="bg-dark-800/90 p-1.5 rounded-2xl border border-dark-600 inline-flex shadow-xl">
              <button
                type="button"
                onClick={() => handleTabChange('customers')}
                className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  !isArtisanTab
                    ? 'bg-gradient-to-r from-gold-500 to-amber-500 text-dark-950 shadow-gold scale-102'
                    : 'text-gray-400 hover:text-white hover:bg-dark-700/50'
                }`}
              >
                <HiShoppingBag className="w-4 h-4" />
                <span>👑 Top Buyers Leaderboard</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${!isArtisanTab ? 'bg-dark-950/20 text-dark-950' : 'bg-dark-700 text-gray-400'}`}>
                  {customerList.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleTabChange('artisans')}
                className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  isArtisanTab
                    ? 'bg-gradient-to-r from-gold-500 to-amber-500 text-dark-950 shadow-gold scale-102'
                    : 'text-gray-400 hover:text-white hover:bg-dark-700/50'
                }`}
              >
                <HiColorSwatch className="w-4 h-4" />
                <span>🎨 Master Artisans Leaderboard</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${isArtisanTab ? 'bg-dark-950/20 text-dark-950' : 'bg-dark-700 text-gray-400'}`}>
                  {artisanList.length}
                </span>
              </button>
            </div>
          </div>

          {/* ── Section Title & Explanations ── */}
          <div className="text-center max-w-3xl mx-auto mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/20 mb-3">
              <FaTrophy className="w-4 h-4 text-gold-400" />
              <span className="text-gold-400 text-xs font-bold uppercase tracking-widest">
                {isArtisanTab ? 'Creator Sales Rankings' : 'Patron Purchase Rankings'}
              </span>
            </div>
            <h2 className="text-3xl md:text-5xl font-serif font-bold text-white mb-3">
              {isArtisanTab ? (
                <>Master Artisans <span className="gold-text">Sales Leaderboard</span></>
              ) : (
                <>KalaStyle AI <span className="gold-text">Buyers Leaderboard</span></>
              )}
            </h2>
            <p className="text-gray-400 text-sm md:text-base">
              {isArtisanTab
                ? 'Ranked live by verified craft sales and fulfilled orders. The artisan with the most sales claims #1 rank on the platform!'
                : 'Ranked live by authentic collection purchases. The more you purchase, the higher your rank climbs to #1!'}
            </p>
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PERSONAL STANDING BANNER                                       */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <AnimatePresence mode="wait">
            {/* If on Artisan Tab and user is an artisan */}
            {isArtisanTab && currentArtisanRank && (
              <motion.div
                key="artisan-standing"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-gold-500/20 via-amber-600/10 to-dark-800 border border-gold-500/40 p-6 mb-12 shadow-xl"
              >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
                  <div className="flex items-center gap-4 text-center sm:text-left">
                    <div className="w-14 h-14 rounded-2xl bg-gold-500/20 border border-gold-500/40 flex items-center justify-center text-3xl shadow-gold shrink-0">
                      {artisanRankNum === 1 ? '👑' : artisanRankNum === 2 ? '🥈' : artisanRankNum === 3 ? '🥉' : '🎨'}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center justify-center sm:justify-start gap-2">
                        Your Workshop Standing: <span className="gold-text">Rank #{artisanRankNum}</span>
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-gold-500/20 text-gold-400 border border-gold-500/30 font-semibold">
                          {currentArtisanRank.storeName}
                        </span>
                      </h3>
                      <p className="text-sm text-gray-300">
                        {artisanRankNum === 1 ? (
                          <span className="text-gold-300 font-medium flex items-center gap-1">
                            <HiSparkles className="w-4 h-4 text-gold-400" /> Outstanding! You are the #1 Top Selling Artisan on KalaStyle!
                          </span>
                        ) : currentArtisanRank?.nextRankSalesNeeded > 0 ? (
                          <span>
                            Make <strong className="text-gold-400">₹{currentArtisanRank.nextRankSalesNeeded.toLocaleString()}</strong> more in sales to overtake Rank #{artisanRankNum - 1}!
                          </span>
                        ) : (
                          <span>Keep crafting and fulfilling orders to climb the Artisan Leaderboard!</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <Link
                    to="/artisan/products"
                    className="btn-primary px-6 py-2.5 text-sm font-semibold flex items-center gap-2 shadow-gold shrink-0"
                  >
                    Manage Products <HiChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </motion.div>
            )}

            {/* If on Buyers Tab and user is logged in */}
            {!isArtisanTab && user && (
              <motion.div
                key="customer-standing"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-gold-500/20 via-amber-600/10 to-dark-800 border border-gold-500/40 p-6 mb-12 shadow-xl"
              >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
                  <div className="flex items-center gap-4 text-center sm:text-left">
                    <div className="w-14 h-14 rounded-2xl bg-gold-500/20 border border-gold-500/40 flex items-center justify-center text-3xl shadow-gold shrink-0">
                      {userRankNum === 1 ? '👑' : userRankNum === 2 ? '🥈' : userRankNum === 3 ? '🥉' : '🏆'}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center justify-center sm:justify-start gap-2">
                        Your Leaderboard Standing: <span className="gold-text">Rank #{userRankNum}</span>
                      </h3>
                      <p className="text-sm text-gray-300">
                        {userRankNum === 1 ? (
                          <span className="text-gold-300 font-medium flex items-center gap-1">
                            <HiSparkles className="w-4 h-4 text-gold-400" /> You are #1 Top Buyer on KalaStyle AI! Keep shining!
                          </span>
                        ) : currentUserRank?.nextRankAmountNeeded > 0 ? (
                          <span>
                            Spend <strong className="text-gold-400">₹{currentUserRank.nextRankAmountNeeded.toLocaleString()}</strong> more to overtake Rank #{userRankNum - 1}!
                          </span>
                        ) : (
                          <span>Shop authentic handicrafts to climb up the leaderboard ranks!</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <Link
                    to="/products"
                    className="btn-primary px-6 py-2.5 text-sm font-semibold flex items-center gap-2 shadow-gold shrink-0"
                  >
                    Shop Now to Rank Up <HiChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PODIUM (TOP 3)                                                 */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {top3.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 items-end max-w-5xl mx-auto">
              {/* 2nd Place */}
              {top3[1] ? (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="card p-6 text-center relative overflow-hidden bg-dark-800/90 border border-slate-400/40 rounded-2xl md:order-1 order-2"
                >
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-slate-400 to-gray-500" />
                  <div className="w-8 h-8 rounded-full bg-slate-400/20 border border-slate-400/40 text-slate-300 font-bold text-sm mx-auto mb-3 flex items-center justify-center">
                    #2
                  </div>
                  {isArtisanTab && top3[1].profileImage ? (
                    <img 
                      src={top3[1].profileImage} 
                      alt={top3[1].storeName} 
                      className="w-18 h-18 rounded-full object-cover border-2 border-slate-400/50 mx-auto mb-3 shadow-lg" 
                    />
                  ) : (
                    <UserAvatar name={top3[1].storeName || top3[1].name} size={72} ring className="mx-auto mb-3" />
                  )}
                  <h3 className="text-lg font-bold text-white truncate">{top3[1].storeName || top3[1].name}</h3>
                  <p className="text-xs text-gray-400 mb-2 truncate">{isArtisanTab ? (top3[1].specialization || top3[1].artisanType) : top3[1].email || 'Verified Buyer'}</p>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-500/20 text-slate-300 font-semibold border border-slate-400/30 inline-block mb-3">
                    🥈 {isArtisanTab ? top3[1].masteryLevel : top3[1].membershipLevel}
                  </span>
                  <div className="pt-3 border-t border-dark-600">
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest">{isArtisanTab ? 'Total Sales Revenue' : 'Total Purchased'}</p>
                    <p className="text-xl font-bold text-slate-300">₹{(isArtisanTab ? top3[1].totalSales : top3[1].totalSpent)?.toLocaleString()}</p>
                  </div>
                </motion.div>
              ) : <div className="hidden md:block md:order-1" />}

              {/* 1st Place (Center / Champion) */}
              {top3[0] && (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="card p-8 text-center relative overflow-hidden bg-gradient-to-b from-amber-500/15 via-dark-800 to-dark-800 border-2 border-gold-500/60 rounded-2xl shadow-gold scale-105 z-10 md:order-2 order-1"
                >
                  <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600" />
                  <div className="w-10 h-10 rounded-full bg-gold-500 text-dark-900 font-bold text-base mx-auto mb-3 flex items-center justify-center shadow-lg">
                    👑 #1
                  </div>
                  <div className="relative inline-block mb-3">
                    {isArtisanTab && top3[0].profileImage ? (
                      <img 
                        src={top3[0].profileImage} 
                        alt={top3[0].storeName} 
                        className="w-22 h-22 rounded-full object-cover border-2 border-gold-400 mx-auto shadow-2xl" 
                      />
                    ) : (
                      <UserAvatar name={top3[0].storeName || top3[0].name} size={84} ring className="mx-auto shadow-2xl" />
                    )}
                    <span className="absolute -bottom-1 -right-1 text-2xl">🏆</span>
                  </div>
                  <h3 className="text-xl font-bold text-white truncate">{top3[0].storeName || top3[0].name}</h3>
                  <p className="text-xs text-gold-300/80 mb-2 truncate">{isArtisanTab ? (top3[0].specialization || top3[0].artisanType) : 'Champion Patron'}</p>
                  <span className="text-xs px-3 py-1 rounded-full bg-gold-500/20 text-gold-400 font-bold border border-gold-500/40 inline-block mb-4">
                    🥇 {isArtisanTab ? top3[0].masteryLevel : `${top3[0].membershipLevel} VIP`}
                  </span>
                  <div className="pt-4 border-t border-gold-500/30">
                    <p className="text-[11px] text-gold-400 uppercase font-semibold tracking-widest">{isArtisanTab ? 'Top Selling Artisan' : 'Top Buyer'}</p>
                    <p className="text-2xl font-bold gold-text">₹{(isArtisanTab ? top3[0].totalSales : top3[0].totalSpent)?.toLocaleString()}</p>
                  </div>
                </motion.div>
              )}

              {/* 3rd Place */}
              {top3[2] ? (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="card p-6 text-center relative overflow-hidden bg-dark-800/90 border border-orange-500/40 rounded-2xl md:order-3 order-3"
                >
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-600 to-amber-700" />
                  <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-400 font-bold text-sm mx-auto mb-3 flex items-center justify-center">
                    #3
                  </div>
                  {isArtisanTab && top3[2].profileImage ? (
                    <img 
                      src={top3[2].profileImage} 
                      alt={top3[2].storeName} 
                      className="w-18 h-18 rounded-full object-cover border-2 border-orange-400/50 mx-auto mb-3 shadow-lg" 
                    />
                  ) : (
                    <UserAvatar name={top3[2].storeName || top3[2].name} size={72} ring className="mx-auto mb-3" />
                  )}
                  <h3 className="text-lg font-bold text-white truncate">{top3[2].storeName || top3[2].name}</h3>
                  <p className="text-xs text-gray-400 mb-2 truncate">{isArtisanTab ? (top3[2].specialization || top3[2].artisanType) : top3[2].email || 'Verified Buyer'}</p>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-semibold border border-orange-500/30 inline-block mb-3">
                    🥉 {isArtisanTab ? top3[2].masteryLevel : top3[2].membershipLevel}
                  </span>
                  <div className="pt-3 border-t border-dark-600">
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest">{isArtisanTab ? 'Total Sales Revenue' : 'Total Purchased'}</p>
                    <p className="text-xl font-bold text-orange-400">₹{(isArtisanTab ? top3[2].totalSales : top3[2].totalSpent)?.toLocaleString()}</p>
                  </div>
                </motion.div>
              ) : <div className="hidden md:block md:order-3" />}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* LEADERBOARD TABLE SECTION                                      */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div className="card bg-dark-800/80 backdrop-blur-md border border-dark-600 rounded-2xl p-4 sm:p-6 overflow-hidden">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  {isArtisanTab ? 'Master Artisans Guild Rankings' : 'All Spenders Leaderboard'}
                  <span className="text-xs font-normal text-gray-400">
                    ({currentList.length} {isArtisanTab ? 'Artisans' : 'Users'})
                  </span>
                </h3>
                <p className="text-xs text-gray-400">
                  {isArtisanTab ? 'Ranked by total verified craft sales revenue' : 'Ranked by overall dress purchases'}
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <HiSearch className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={isArtisanTab ? 'Search workshop or craft...' : 'Search buyer name...'}
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="input-field pl-9 py-2 text-xs w-full bg-dark-900 border-dark-600 focus:border-gold-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-dark-600 text-xs text-gray-400 uppercase tracking-wider bg-dark-900/50">
                    <th className="py-3 px-4 rounded-l-xl">Rank</th>
                    <th className="py-3 px-4">{isArtisanTab ? 'Artisan Workshop' : 'Buyer'}</th>
                    <th className="py-3 px-4">{isArtisanTab ? 'Craft / Specialization' : 'Tier'}</th>
                    <th className="py-3 px-4">{isArtisanTab ? 'Orders Fulfilled' : 'Orders'}</th>
                    <th className="py-3 px-4 text-right rounded-r-xl">
                      {isArtisanTab ? 'Total Sales Revenue' : 'Total Amount Spent'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600/50">
                  {filteredList.map((item) => {
                    const isSelf = isArtisanTab ? item.isCurrentArtisan : item.isCurrentUser;
                    const tierCfg = isArtisanTab ? getMasteryCfg(item.masteryLevel) : getLevelCfg(item.membershipLevel);

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          isSelf
                            ? 'bg-gold-500/10 hover:bg-gold-500/15 border-l-4 border-l-gold-500'
                            : 'hover:bg-dark-750'
                        }`}
                      >
                        <td className="py-4 px-4 font-bold text-gray-300">
                          <div className="flex items-center gap-2">
                            {item.rank === 1 ? (
                              <span className="w-7 h-7 rounded-full bg-gold-500/20 text-gold-400 border border-gold-500/40 flex items-center justify-center text-xs">
                                👑 1
                              </span>
                            ) : item.rank === 2 ? (
                              <span className="w-7 h-7 rounded-full bg-slate-400/20 text-slate-300 border border-slate-400/40 flex items-center justify-center text-xs">
                                🥈 2
                              </span>
                            ) : item.rank === 3 ? (
                              <span className="w-7 h-7 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/40 flex items-center justify-center text-xs">
                                🥉 3
                              </span>
                            ) : (
                              <span className="w-7 h-7 rounded-full bg-dark-900 text-gray-400 border border-dark-600 flex items-center justify-center text-xs font-mono">
                                #{item.rank}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            {isArtisanTab && item.profileImage ? (
                              <img
                                src={item.profileImage}
                                alt={item.storeName}
                                className="w-9 h-9 rounded-full object-cover border border-gold-500/40 shrink-0"
                              />
                            ) : (
                              <UserAvatar name={item.storeName || item.name} size={36} ring={isSelf} />
                            )}
                            <div>
                              <p className="font-semibold text-white flex items-center gap-2">
                                {item.storeName || item.name}
                                {isSelf && (
                                  <span className="bg-gold-500 text-dark-900 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    {isArtisanTab ? 'YOUR WORKSHOP' : 'YOU'}
                                  </span>
                                )}
                              </p>
                              {isArtisanTab && item.location && (
                                <p className="text-[11px] text-gray-400">📍 {item.location}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          {isArtisanTab ? (
                            <div className="space-y-1">
                              <span className="text-xs text-gray-300 block font-medium">
                                {item.specialization || item.artisanType || 'Heritage Craft'}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tierCfg.bg} ${tierCfg.text} border ${tierCfg.border} inline-flex items-center gap-1`}>
                                {tierCfg.emoji} {item.masteryLevel}
                              </span>
                            </div>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${tierCfg.bg} ${tierCfg.text} border ${tierCfg.border} inline-flex items-center gap-1`}>
                              {tierCfg.emoji} {item.membershipLevel}
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-4 text-gray-300 font-mono">
                          {item.totalOrders || 0}
                        </td>

                        <td className="py-4 px-4 text-right font-bold font-mono text-base">
                          <span className={isSelf ? 'gold-text font-extrabold' : 'text-gray-200'}>
                            ₹{(isArtisanTab ? item.totalSales : item.totalSpent)?.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-400">
                        No {isArtisanTab ? 'artisans' : 'users'} found matching "{searchFilter}"
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
