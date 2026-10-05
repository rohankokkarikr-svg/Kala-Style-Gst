import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { HiAdjustments, HiSparkles } from 'react-icons/hi';
import ProductCard from './ProductCard';
import { ProductCardSkeleton } from './Skeleton';
import PersonalizationModal from './PersonalizationModal';
import { useRecommendations } from '../context/RecommendationContext';

export default function PersonalizedRecommendations({
  title = 'Recommended for You',
  subtitle = 'Curated handcrafted pieces tailored to your browsing and taste',
  limit = 8,
  targetCategory = null,
  excludeIds = [],
  showControls = true,
  className = '',
  maxColumns = 4,
}) {
  const { fetchRecommendations, dismissProduct, isPaused } = useRecommendations();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [isColdStart, setIsColdStart] = useState(false);

  // JSON stringify excludeIds for stable dependency check
  const excludeKey = JSON.stringify(excludeIds || []);

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    try {
      const parsedExcludes = JSON.parse(excludeKey);
      const res = await fetchRecommendations({
        limit,
        targetCategory,
        excludeIds: parsedExcludes,
      });

      if (res && Array.isArray(res.recommendations)) {
        setProducts(res.recommendations);
        setIsColdStart(Boolean(res.coldStart));
      } else {
        setProducts([]);
      }
    } catch (err) {
      console.warn('Failed to load personalized recommendations:', err.message);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [fetchRecommendations, limit, targetCategory, excludeKey]);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  const handleDismiss = (productId) => {
    dismissProduct(productId);
    // Optimistically remove from state immediately
    setProducts(prev => prev.filter(p => p.id !== productId));
  };

  // If not loading and no products found, don't show an empty awkward section
  if (!loading && products.length === 0) {
    return null;
  }

  const gridColsClass = maxColumns === 3
    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
    : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';

  return (
    <section className={`py-12 ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-gold-400 uppercase tracking-widest flex items-center gap-1.5">
                <HiSparkles className="w-4 h-4 text-gold-500 animate-pulse" />
                {isPaused ? 'Handcrafted Highlights' : (isColdStart ? 'Trending Handicrafts' : 'Personalized for You')}
              </span>
            </div>
            <h2 className="section-title text-2xl sm:text-3xl font-serif font-bold text-white">
              {title}
            </h2>
            <div className="h-1 w-20 bg-gold-500 rounded-full mt-3 mb-2" />
            {subtitle && (
              <p className="text-gray-400 text-xs sm:text-sm mt-1 max-w-2xl">
                {subtitle}
              </p>
            )}
          </div>

          {showControls && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="self-start sm:self-end btn-outline text-xs py-2 px-3.5 flex items-center gap-2 border-dark-600 hover:border-gold-500/40 text-gray-300 hover:text-gold-400 transition-all rounded-xl shadow-sm"
              title="Manage recommendation privacy, preferences, and activity"
            >
              <HiAdjustments className="w-4 h-4 text-gold-400" />
              <span>Personalization Settings</span>
            </button>
          )}
        </div>

        {/* Product Grid */}
        <div className={`grid ${gridColsClass} gap-6`}>
          {loading ? (
            Array.from({ length: Math.min(limit, 4) }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))
          ) : (
            products.map((prod, idx) => (
              <motion.div
                key={prod.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
              >
                <ProductCard
                  product={prod}
                  onDismiss={handleDismiss}
                />
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Preferences & Privacy Modal */}
      <PersonalizationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </section>
  );
}
