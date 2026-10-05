import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  HiSparkles, HiChevronRight, HiUser, HiShoppingBag,
  HiHeart, HiStar, HiChartBar, HiLogout, HiOutlineClipboardCopy,
  HiCheckCircle, HiTag, HiUsers, HiCurrencyRupee
} from 'react-icons/hi';
import { FaTrophy } from 'react-icons/fa';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import UserAvatar from '../components/UserAvatar';
import toast from 'react-hot-toast';

const LEVEL_COLORS = {
  Elite:   { badge: 'bg-gradient-to-r from-purple-600 to-indigo-600', text: 'text-purple-400', border: 'border-purple-500/40', bg: 'bg-purple-500/10', emoji: '👑' },
  Diamond: { badge: 'bg-gradient-to-r from-cyan-500 to-blue-600',    text: 'text-cyan-300',   border: 'border-cyan-400/40',   bg: 'bg-cyan-500/10',   emoji: '💎' },
  Gold:    { badge: 'bg-gradient-to-r from-yellow-500 to-amber-600', text: 'text-amber-400',  border: 'border-yellow-500/40', bg: 'bg-yellow-500/10', emoji: '🥇' },
  Silver:  { badge: 'bg-gradient-to-r from-slate-400 to-gray-500',   text: 'text-slate-300',  border: 'border-slate-400/40',  bg: 'bg-slate-400/10',  emoji: '🥈' },
  Bronze:  { badge: 'bg-gradient-to-r from-orange-600 to-amber-700', text: 'text-orange-400', border: 'border-orange-500/40', bg: 'bg-orange-500/10', emoji: '🥉' },
};

const getLevelCfg = (name) => LEVEL_COLORS[name] || LEVEL_COLORS.Bronze;

export default function Profile() {
  const { user, isAdmin, isArtisan, logout } = useAuth();
  const [rewardsData, setRewardsData] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedCoupon, setCopiedCoupon] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [rewardsRes, leaderboardRes] = await Promise.all([
          authAPI.getRewards().catch(() => ({ data: null })),
          authAPI.getLeaderboard().catch(() => ({ data: null }))
        ]);
        
        if (isMounted) {
          if (rewardsRes?.data) setRewardsData(rewardsRes.data);
          if (leaderboardRes?.data) setLeaderboardData(leaderboardRes.data);
        }
      } catch (err) {
        toast.error('Failed to load profile data');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, []);

  const handleCopyCoupon = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCoupon(true);
    toast.success('Reward coupon copied to clipboard!');
    setTimeout(() => setCopiedCoupon(false), 2500);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <div className="w-12 h-12 border-4 border-dark-600 border-t-gold-500 rounded-full animate-spin" />
      </div>
    );
  }

  const currentUserRank = leaderboardData?.currentUserRank;
  const userRankNum = currentUserRank?.rank || 'N/A';
  const levelName = rewardsData?.membershipLevel || 'Bronze';
  const levelCfg = getLevelCfg(levelName);
  const totalSpent = rewardsData?.totalSpent || currentUserRank?.totalSpent || 0;
  const totalOrders = rewardsData?.history?.length || 0;

  return (
    <div className="min-h-screen bg-dark-900 text-white pb-24">
      {/* ── Background Ambient Glow ── */}
      <div className="relative pt-8 pb-12 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-gold-500/10 via-amber-500/5 to-transparent blur-3xl pointer-events-none" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10">

          {/* ── Top Navigation Tabs (Separate Profile & Leaderboard) ── */}
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-dark-700 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gold-500/20 text-gold-300 border border-gold-500/40 shadow-gold flex items-center gap-2">
                <HiUser className="w-4 h-4 text-gold-400" /> My Profile
              </div>
              <Link
                to="/leaderboard"
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-400 hover:text-white hover:bg-dark-800 transition-colors flex items-center gap-2 border border-transparent hover:border-dark-600"
              >
                <FaTrophy className="w-4 h-4 text-gold-400" /> View Leaderboard
              </Link>
            </div>

            <button
              onClick={logout}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 transition-all flex items-center gap-1.5"
            >
              <HiLogout className="w-4 h-4" /> Sign Out
            </button>
          </div>

          {/* ── User Profile Header Card ── */}
          {user && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl bg-dark-800/90 border border-dark-600 p-6 sm:p-8 mb-8 shadow-2xl backdrop-blur-md relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-80 h-80 bg-gold-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
                  <UserAvatar name={user.name} size={80} ring />
                  <div>
                    <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
                      <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{user.name}</h1>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        isAdmin
                          ? 'bg-gold-500/20 text-gold-300 border border-gold-500/50 shadow-gold'
                          : isArtisan
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                          : 'bg-dark-700 text-gray-300 border border-dark-600'
                      }`}>
                        {isAdmin ? '👑 Administrator' : isArtisan ? '🎨 Master Artisan' : 'Member'}
                      </span>
                    </div>
                    <div className="text-xs sm:text-sm text-gray-400 mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1">
                      {user.phone && <span>📞 {user.phone}</span>}
                      {user.email && user.email !== user.phone && <span>✉️ {user.email}</span>}
                      <span className="text-gray-500 font-mono">ID: #{user.id?.slice(0, 8)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Link
                    to="/orders"
                    className="px-4 py-2.5 rounded-xl bg-dark-700 hover:bg-dark-650 border border-dark-600 text-xs font-semibold text-gray-200 hover:text-white transition-all flex items-center gap-2"
                  >
                    <HiShoppingBag className="w-4 h-4 text-gold-400" /> My Orders
                  </Link>
                  <Link
                    to="/wishlist"
                    className="px-4 py-2.5 rounded-xl bg-dark-700 hover:bg-dark-650 border border-dark-600 text-xs font-semibold text-gray-200 hover:text-white transition-all flex items-center gap-2"
                  >
                    <HiHeart className="w-4 h-4 text-red-400" /> Wishlist
                  </Link>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Key Statistics / Tier Grid ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Membership Tier */}
            <div className="card p-5 bg-dark-800/80 border border-dark-600 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Membership Tier</span>
                <span className="text-xl">{levelCfg.emoji}</span>
              </div>
              <p className={`text-xl font-bold ${levelCfg.text}`}>{levelName} Member</p>
              <p className="text-[11px] text-gray-400 mt-1">Tier benefits unlocked</p>
            </div>

            {/* Total Spent */}
            <div className="card p-5 bg-dark-800/80 border border-dark-600 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Purchases</span>
                <HiCurrencyRupee className="w-5 h-5 text-gold-400" />
              </div>
              <p className="text-xl font-bold text-white">₹{totalSpent.toLocaleString()}</p>
              <p className="text-[11px] text-gray-400 mt-1">Cumulative verified spend</p>
            </div>

            {/* Orders Delivered */}
            <div className="card p-5 bg-dark-800/80 border border-dark-600 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Completed Orders</span>
                <HiShoppingBag className="w-5 h-5 text-amber-400" />
              </div>
              <p className="text-xl font-bold text-white">{totalOrders} Orders</p>
              <p className="text-[11px] text-gray-400 mt-1">Delivered to your address</p>
            </div>

            {/* Leaderboard Standing */}
            <div className="card p-5 bg-dark-800/80 border border-gold-500/30 rounded-2xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gold-400 uppercase tracking-wider">Leaderboard Rank</span>
                <FaTrophy className="w-4 h-4 text-gold-400" />
              </div>
              <p className="text-xl font-bold gold-text">Rank #{userRankNum}</p>
              <Link
                to="/leaderboard"
                className="text-[11px] text-gold-400 hover:text-gold-300 font-semibold mt-1 inline-flex items-center gap-1"
              >
                View Full Rankings &rarr;
              </Link>
            </div>
          </div>

          {/* ── Rewards Milestone Card ── */}
          {rewardsData && (
            <div className="card bg-dark-800/70 border border-dark-600 rounded-2xl p-6 mb-8">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <HiStar className="w-5 h-5 text-gold-400" /> Free Milestone Reward Progress
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Order {rewardsData.rewardThreshold || 10} items to earn a 100% Free Exclusive KalaStyle AI Handmade Craft Gift coupon!
                  </p>
                </div>
                <span className="text-xs font-bold px-3 py-1 bg-gold-500/15 border border-gold-500/40 text-gold-300 rounded-full">
                  {rewardsData.progress || 0} / {rewardsData.rewardThreshold || 10} Items
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-3 bg-dark-950 rounded-full overflow-hidden border border-dark-700 mb-3">
                <div
                  className="h-full bg-gradient-to-r from-gold-500 to-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, ((rewardsData.progress || 0) / (rewardsData.rewardThreshold || 10)) * 100)}%` }}
                />
              </div>

              {rewardsData.rewardCode ? (
                <div className="mt-4 p-4 rounded-xl bg-gold-500/10 border border-gold-500/40 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <span className="text-xs text-gold-400 uppercase font-bold tracking-wider">🎉 Milestone Unlocked: Free T-Shirt Coupon</span>
                    <p className="font-mono text-lg font-extrabold text-white mt-0.5">{rewardsData.rewardCode}</p>
                  </div>
                  <button
                    onClick={() => handleCopyCoupon(rewardsData.rewardCode)}
                    className="px-4 py-2 rounded-xl bg-gold-500 text-dark-950 font-bold text-xs hover:bg-gold-400 transition-colors flex items-center gap-1.5 shrink-0 shadow-gold"
                  >
                    {copiedCoupon ? <HiCheckCircle className="w-4 h-4" /> : <HiOutlineClipboardCopy className="w-4 h-4" />}
                    {copiedCoupon ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  Order <strong className="text-gold-400">{rewardsData.needed || 10}</strong> more items to unlock your free reward code.
                </p>
              )}
            </div>
          )}

          {/* ── Quick Services & Navigation ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            <Link
              to="/orders"
              className="p-5 rounded-2xl bg-dark-800/60 border border-dark-600 hover:border-gold-500/50 hover:bg-dark-800 transition-all group"
            >
              <HiShoppingBag className="w-6 h-6 text-gold-400 mb-2 group-hover:scale-110 transition-transform" />
              <h4 className="text-sm font-bold text-white">Order History</h4>
              <p className="text-xs text-gray-400 mt-1">Track shipments and view past receipts</p>
            </Link>

            <Link
              to="/rewards"
              className="p-5 rounded-2xl bg-dark-800/60 border border-dark-600 hover:border-gold-500/50 hover:bg-dark-800 transition-all group"
            >
              <HiStar className="w-6 h-6 text-gold-400 mb-2 group-hover:scale-110 transition-transform" />
              <h4 className="text-sm font-bold text-white">Rewards Hub</h4>
              <p className="text-xs text-gray-400 mt-1">Spin the prize wheel and unlock perks</p>
            </Link>

            <Link
              to="/leaderboard"
              className="p-5 rounded-2xl bg-dark-800/60 border border-dark-600 hover:border-gold-500/50 hover:bg-dark-800 transition-all group"
            >
              <FaTrophy className="w-6 h-6 text-gold-400 mb-2 group-hover:scale-110 transition-transform" />
              <h4 className="text-sm font-bold text-white">Leaderboard Rankings</h4>
              <p className="text-xs text-gray-400 mt-1">See top buyers across all dress collections</p>
            </Link>
          </div>

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* ── PROFILE DOWN SIDE: ADMIN PANEL SECTION (If Admin) ─────── */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {isAdmin && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl bg-gradient-to-br from-dark-800 via-dark-850 to-dark-900 border-2 border-gold-500/50 p-6 sm:p-8 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-gold-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-gold-500/20 relative z-10">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gold-500 to-amber-600 text-dark-950 flex items-center justify-center text-2xl shadow-gold shrink-0">
                    👑
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-2xl font-bold text-white">Administrator Control Panel</h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-gold-500 text-dark-950">
                        ADMIN ACCESS
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-300 mt-1 max-w-2xl">
                      Complete administrative management suite. Add and edit products, manage customer orders, track inventory stock, inspect activity logs, and view sales revenue.
                    </p>
                  </div>
                </div>

                {/* Main Admin Launch Button */}
                <Link
                  to="/admin"
                  className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-gold-500 via-amber-500 to-yellow-500 hover:from-gold-400 hover:to-amber-400 text-dark-950 font-extrabold text-sm shadow-gold transition-all flex items-center gap-2.5 shrink-0 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <HiChartBar className="w-5 h-5 text-dark-950" />
                  <span>Open Admin Control Center</span>
                  <HiChevronRight className="w-4 h-4 text-dark-950" />
                </Link>
              </div>

              {/* Direct Quick Shortcuts inside Admin Panel Section */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 relative z-10">
                <Link
                  to="/admin/products"
                  className="p-3.5 rounded-xl bg-dark-900/80 hover:bg-gold-500/10 border border-dark-600 hover:border-gold-500/40 text-center transition-all group"
                >
                  <HiShoppingBag className="w-5 h-5 text-gold-400 mx-auto mb-1.5 group-hover:scale-110 transition-transform" />
                  <span className="block text-xs font-bold text-gray-200 group-hover:text-gold-300">Edit Products</span>
                  <span className="block text-[10px] text-gray-400 mt-0.5">Manage catalog</span>
                </Link>

                <Link
                  to="/admin/orders"
                  className="p-3.5 rounded-xl bg-dark-900/80 hover:bg-gold-500/10 border border-dark-600 hover:border-gold-500/40 text-center transition-all group"
                >
                  <HiTag className="w-5 h-5 text-gold-400 mx-auto mb-1.5 group-hover:scale-110 transition-transform" />
                  <span className="block text-xs font-bold text-gray-200 group-hover:text-gold-300">All Orders</span>
                  <span className="block text-[10px] text-gray-400 mt-0.5">Status & delivery</span>
                </Link>

                <Link
                  to="/admin/customers"
                  className="p-3.5 rounded-xl bg-dark-900/80 hover:bg-gold-500/10 border border-dark-600 hover:border-gold-500/40 text-center transition-all group"
                >
                  <HiUsers className="w-5 h-5 text-gold-400 mx-auto mb-1.5 group-hover:scale-110 transition-transform" />
                  <span className="block text-xs font-bold text-gray-200 group-hover:text-gold-300">Customers</span>
                  <span className="block text-[10px] text-gray-400 mt-0.5">View user accounts</span>
                </Link>

                <Link
                  to="/admin/analytics"
                  className="p-3.5 rounded-xl bg-dark-900/80 hover:bg-gold-500/10 border border-dark-600 hover:border-gold-500/40 text-center transition-all group"
                >
                  <HiChartBar className="w-5 h-5 text-gold-400 mx-auto mb-1.5 group-hover:scale-110 transition-transform" />
                  <span className="block text-xs font-bold text-gray-200 group-hover:text-gold-300">Analytics</span>
                  <span className="block text-[10px] text-gray-400 mt-0.5">Revenue & sales</span>
                </Link>

                <Link
                  to="/admin/categories"
                  className="p-3.5 rounded-xl bg-dark-900/80 hover:bg-gold-500/10 border border-dark-600 hover:border-gold-500/40 text-center transition-all group col-span-2 sm:col-span-1"
                >
                  <HiSparkles className="w-5 h-5 text-gold-400 mx-auto mb-1.5 group-hover:scale-110 transition-transform" />
                  <span className="block text-xs font-bold text-gray-200 group-hover:text-gold-300">Categories</span>
                  <span className="block text-[10px] text-gray-400 mt-0.5">Collections setup</span>
                </Link>
              </div>
            </motion.div>
          )}

          {/* Master Artisan Studio (If Artisan) */}
          {isArtisan && (
            <div className="mt-8 rounded-2xl bg-purple-900/20 border border-purple-500/40 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🎨</span>
                <div>
                  <h3 className="text-base font-bold text-white">Master Artisan Studio</h3>
                  <p className="text-xs text-gray-300 mt-0.5">Digitize handloom collections, smart catalog generation, and audio pricing.</p>
                </div>
              </div>
              <Link
                to="/artisan"
                className="btn-primary px-5 py-2.5 text-xs font-bold shadow-gold flex items-center gap-2 shrink-0"
              >
                Open Artisan Studio &rarr;
              </Link>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
