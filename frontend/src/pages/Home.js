import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HiTruck, HiShieldCheck, HiRefresh, HiArrowRight, HiTag } from 'react-icons/hi';
import ProductCard from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/Skeleton';
import HeroSlider from '../components/HeroSlider';
import IndianHandicraftsSection from '../components/IndianHandicraftsSection';
import Testimonials from '../components/Testimonials';
import Footer from '../components/Footer';
import { productAPI, artisanAPI } from '../services/api';
import { useSettings, DEFAULT_DISCOUNT_BANNER } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { apiCache } from '../utils/apiCache';
import toast from 'react-hot-toast';

export default function Home() {
  const { settings } = useSettings();
  const { user } = useAuth();
  const cachedFeatured = apiCache.getSync('/products/featured?{}');
  const cachedArtisans = apiCache.getSync('/artisans?{}');

  const initialFeatured = Array.isArray(cachedFeatured?.data) ? cachedFeatured.data : (Array.isArray(cachedFeatured) ? cachedFeatured : []);
  const initialArtisans = Array.isArray(cachedArtisans?.data) ? cachedArtisans.data : (Array.isArray(cachedArtisans) ? cachedArtisans : []);

  const [featured, setFeatured] = useState(() => initialFeatured);
  const [artisans, setArtisans] = useState(() => initialArtisans.slice(0, 4));
  const [loading, setLoading] = useState(() => initialFeatured.length === 0);

  const discountBanner = settings?.discountBanner || DEFAULT_DISCOUNT_BANNER;

  const shouldShowBanner = React.useMemo(() => {
    const isAct = discountBanner.isActive !== undefined 
      ? Boolean(discountBanner.isActive) 
      : (discountBanner.is_active !== undefined ? Boolean(discountBanner.is_active) : true);

    if (!isAct) return false;

    const audience = discountBanner.targetAudience || discountBanner.target_audience || 'all';

    if (audience === 'all') return true;

    if (audience === 'logged_in') return Boolean(user);

    if (audience === 'new_users') {
      return !user || (user.orderCount === 0 || user.orders_count === 0);
    }

    if (audience === 'specific') {
      if (!user?.email) return false;
      const rawEmails = discountBanner.selectedUserEmails || discountBanner.selected_user_emails || [];
      const emailList = (Array.isArray(rawEmails) ? rawEmails : String(rawEmails).split(',')).map(e => e.trim().toLowerCase());
      return emailList.includes(user.email.toLowerCase());
    }

    return true;
  }, [discountBanner, user]);

  const fetchData = React.useCallback(async (isBackground = false) => {
    if (!isBackground && initialFeatured.length === 0) setLoading(true);
    try {
      const res = await productAPI.getFeatured();
      const items = res?.data || res;
      if (Array.isArray(items) && items.length > 0) {
        setFeatured(items);
      }
    } catch {
      // keep existing items
    }
    try {
      const res = await artisanAPI.getAll();
      const items = res?.data || res;
      if (Array.isArray(items) && items.length > 0) {
        setArtisans(items.slice(0, 4));
      }
    } catch {}
    setLoading(false);
  }, [initialFeatured.length]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Real-time listener: auto-update when Admin changes products or artisans
  useEffect(() => {
    const handleSync = () => {
      fetchData(true);
    };
    window.addEventListener('kala:sync:products_updated', handleSync);
    window.addEventListener('kala:sync:artisans_updated', handleSync);
    return () => {
      window.removeEventListener('kala:sync:products_updated', handleSync);
      window.removeEventListener('kala:sync:artisans_updated', handleSync);
    };
  }, [fetchData]);

  const features = [
    { icon: HiTruck, title: '100% Free Shipping', desc: 'Zero delivery charge on all products' },
    { icon: HiShieldCheck, title: 'Authentic Handmade', desc: '100% artisan-crafted products' },
    { icon: HiRefresh, title: 'Easy Returns', desc: '7 days return policy' },
  ];

  const whyFeatures = [
    { emoji: '🎨', title: 'Support Indian Artisans', desc: 'Every purchase directly empowers generational handicraft artisans across India.' },
    { emoji: '🤖', title: 'AI-Assisted Catalog', desc: 'Artisans use our AI to catalog traditional crafts in seconds with GI authentication.' },
    { emoji: '🧵', title: 'Certified Craftsmanship', desc: 'Genuine Handloom, GI-tagged crafts, and 100% natural handmade products.' },
    { emoji: '🇮🇳', title: 'Made in India', desc: "Celebrating India's 5000-year textile, pottery, metalwork, and folk art heritage." },
  ];

  return (
    <div className="min-h-screen">
      <HeroSlider />
      <section className="bg-dark-800 border-y border-dark-600 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((f, i) => (
              <div key={i} className="flex items-center justify-center gap-4 text-center md:text-left">
                <f.icon className="w-10 h-10 text-gold-500" />
                <div><h3 className="font-semibold text-white text-lg">{f.title}</h3><p className="text-gray-400 text-sm">{f.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 🇮🇳 Explore Indian Handicrafts - 7 Main Categories */}
      <IndianHandicraftsSection />


      <section className="py-20 bg-dark-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-end mb-12">
            <div>
              <span className="text-xs font-semibold text-gold-400 uppercase tracking-widest block mb-1">
                Handcrafted Masterpieces
              </span>
              <h2 className="section-title mb-4">Featured Indian Handicrafts</h2>
              <div className="h-1 w-20 bg-gold-500 rounded-full" />
            </div>
            <Link to="/products" className="text-gold-400 hover:text-gold-300 font-medium hidden md:block">
              View All Handicrafts →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
            ) : featured.length > 0 ? (
              featured.map((p) => <ProductCard key={p.id} product={p} />)
            ) : (
              <div className="col-span-full text-center py-12 px-4 bg-dark-800/40 rounded-2xl border border-dark-700/60">
                <p className="text-gray-400 font-serif text-base sm:text-lg">No featured handicrafts listed yet.</p>
                <p className="text-gray-500 text-xs sm:text-sm mt-1">Check back soon for authentic artisan arrivals!</p>
              </div>
            )}
          </div>
          <div className="mt-8 text-center md:hidden">
            <Link to="/products" className="btn-outline inline-block">View All Handicrafts</Link>
          </div>
        </div>
      </section>
      {artisans.length > 0 && (
        <section className="py-20 bg-dark-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
              <h2 className="section-title mb-4">Meet the Artisans</h2>
              <div className="h-1 w-20 bg-gold-500 mx-auto rounded-full" />
              <p className="text-gray-400 mt-4 text-sm">The people behind every beautiful handcrafted product</p>
            </motion.div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {artisans.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                  <Link to={'/artisans/' + a.id} className="card p-6 text-center hover:border-gold-500/50 block group transition-all duration-300 shadow-card hover:shadow-gold">
                    <div className="relative w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden ring-3 ring-gold-500/50 group-hover:ring-gold-400 group-hover:scale-105 transition-all duration-300 shadow-md bg-dark-800 flex items-center justify-center">
                      {a.profile_image ? (
                        <img
                          src={a.profile_image}
                          alt={a.store_name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            if (e.currentTarget.nextSibling) {
                              e.currentTarget.nextSibling.style.display = 'flex';
                            }
                          }}
                        />
                      ) : null}
                      <div
                        className={`w-full h-full bg-gradient-luxury items-center justify-center text-dark-900 font-bold text-3xl ${
                          a.profile_image ? 'hidden' : 'flex'
                        }`}
                      >
                        {(a.store_name || 'A')[0].toUpperCase()}
                      </div>
                    </div>
                    <h3 className="font-semibold text-white text-base group-hover:text-gold-400 transition-colors">{a.store_name}</h3>
                    <p className="text-gold-500 text-xs mt-1 font-medium">{a.specialization || a.artisan_type || 'Master Craftsman'}</p>
                    <p className="text-gray-400 text-xs mt-1">📍 {a.location || 'India'}</p>
                    <span className="mt-3 inline-block text-xs text-gold-400 font-semibold group-hover:underline">View Store →</span>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}
      <Testimonials />
      <section className="py-20 bg-dark-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className="section-title mb-4">Why KalaStyle AI?</h2>
            <div className="h-1 w-20 bg-gold-500 mx-auto rounded-full" />
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {whyFeatures.map((f, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="card p-6 text-center hover:border-gold-500/30">
                <div className="text-5xl mb-4">{f.emoji}</div>
                <h3 className="font-semibold text-white text-lg mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link to="/signup" className="btn-primary inline-flex items-center gap-2 text-lg px-8 py-4">🎨 Join as an Artisan <HiArrowRight className="w-5 h-5" /></Link>
          </div>
        </div>
      </section>
      {shouldShowBanner && (
        <section className="bg-gradient-to-r from-dark-800 via-dark-700 to-dark-800 border-y border-dark-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8">
            <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-gold-500/10 p-2.5 rounded-lg"><HiTag className="w-6 h-6 text-gold-500" /></div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-gold-400 font-semibold text-sm md:text-base uppercase tracking-wide">{discountBanner.title}</p>
                  {discountBanner.code && (
                    <div className="flex items-center gap-2 bg-gold-500/20 border border-gold-500/30 px-3 py-1 rounded-full">
                      <span className="text-gold-400 text-xs font-bold uppercase tracking-widest">CODE: {discountBanner.code}</span>
                      <button onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(discountBanner.code); toast.success('Code copied!'); }} className="text-gold-500 hover:text-gold-400 transition-colors" title="Copy Code">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-white text-lg md:text-2xl font-serif font-bold">{discountBanner.description}</p>
              </div>
              <Link to={discountBanner.buttonLink} className="shrink-0 btn-primary inline-flex items-center gap-2 text-sm md:text-base px-5 md:px-7 py-2.5 md:py-3">{discountBanner.buttonText} <HiArrowRight className="w-4 h-4" /></Link>
            </motion.div>
          </div>
        </section>
      )}
      <Footer />
    </div>
  );
}
