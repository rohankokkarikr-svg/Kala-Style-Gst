import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import LanguageSelector from '../components/LanguageSelector';
import { useLanguage } from '../context/LanguageContext';
import { useSettings } from '../context/SettingsContext';
import { ProductCardSkeleton } from '../components/Skeleton';
import { productAPI, categoryAPI } from '../services/api';
import { useRecommendations } from '../context/RecommendationContext';
import PersonalizedRecommendations from '../components/PersonalizedRecommendations';
import { HANDICRAFT_CATEGORIES } from '../constants/handicraftsData';
import {
  HiFilter,
  HiX,
  HiSparkles,
  HiRefresh,
  HiChevronRight,
  HiChevronDown,
  HiShieldCheck,
  HiVolumeUp,
  HiVolumeOff,
  HiArrowRight
} from 'react-icons/hi';

export default function ProductList() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(HANDICRAFT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoFailed, setVideoFailed] = useState(false);
  const { currentLang, currentLangMeta } = useLanguage();
  const { settings } = useSettings();

  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);

  // Fetch dynamic categories from Admin updates
  useEffect(() => {
    categoryAPI.getAll().then(({ data }) => {
      if (data && data.length > 0) {
        const formatted = data.map((c, i) => ({
          id: c.id || String(i + 1),
          name: c.name,
          slug: c.slug || c.name.toLowerCase().replace(/\s+/g, '-'),
          description: c.description,
          image: c.image_url || c.image,
          bannerImage: c.banner_image || c.bannerImage || c.image_url || c.image,
          videoUrl: c.video_url || c.videoUrl || '',
          subcategories: c.subcategories || [],
          productCount: c.productCount || ''
        }));
        setCategories(formatted);
      }
    }).catch(() => {});
  }, []);

  const activeCategory = searchParams.get('category') || 'all';
  const activeSubcategory = searchParams.get('subcategory') || 'all';
  const searchQuery = searchParams.get('search') || '';

  // Local Filter States
  const [sort, setSort] = useState('popular');
  const [selectedPriceRange, setSelectedPriceRange] = useState('all');
  const [selectedRating, setSelectedRating] = useState(0);
  const [selectedMaterial, setSelectedMaterial] = useState('all');
  const [selectedAvailability, setSelectedAvailability] = useState('all');
  const [selectedDiscount, setSelectedDiscount] = useState(0);
  const [internalSearch, setInternalSearch] = useState(searchQuery);
  const { trackSearch } = useRecommendations();

  // Sync internal search when URL changes
  useEffect(() => {
    setInternalSearch(searchQuery);
    if (searchQuery && searchQuery.trim().length >= 2) {
      trackSearch(searchQuery.trim());
    }
  }, [searchQuery, trackSearch]);

  // Fetch from API with reliable fallback to full authentic handicrafts data
  const fetchProducts = React.useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const params = {};
      if (activeCategory && activeCategory !== 'all') params.category = activeCategory;
      if (activeSubcategory && activeSubcategory !== 'all') params.subcategory = activeSubcategory;
      if (searchQuery) params.search = searchQuery;

      const res = await productAPI.getAll(params);
      const rawData = res?.data !== undefined ? res.data : res;
      if (Array.isArray(rawData)) {
        setProducts(rawData);
      } else {
        setProducts([]);
      }
    } catch (err) {
      console.warn('Backend products fetch notice:', err.message);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, activeSubcategory, searchQuery]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Real-time listener: auto-update when Admin changes products or categories
  useEffect(() => {
    const handleSync = () => {
      fetchProducts(true);
    };
    window.addEventListener('kala:sync:products_updated', handleSync);
    window.addEventListener('kala:sync:categories_updated', handleSync);
    return () => {
      window.removeEventListener('kala:sync:products_updated', handleSync);
      window.removeEventListener('kala:sync:categories_updated', handleSync);
    };
  }, [fetchProducts]);

  // Find active category details for Banner
  const currentCategoryInfo = useMemo(() => {
    return (
      categories.find(
        (c) =>
          c.slug?.toLowerCase() === activeCategory.toLowerCase() ||
          c.name?.toLowerCase() === activeCategory.toLowerCase()
      ) || null
    );
  }, [activeCategory, categories]);

  // Resolution for category-specific or "All Categories" video and poster
  const categoryBannerSettings = useMemo(() => {
    if (!currentCategoryInfo) {
      return settings?.categoryBanners?.all || null;
    }
    const slug = currentCategoryInfo.slug || currentCategoryInfo.name?.toLowerCase()?.replace(/\s+/g, '-');
    return settings?.categoryBanners?.[slug] || settings?.categoryBanners?.[currentCategoryInfo.name?.toLowerCase()] || null;
  }, [currentCategoryInfo, settings]);

  const activeVideoUrl = useMemo(() => {
    if (currentCategoryInfo) {
      return currentCategoryInfo.videoUrl || categoryBannerSettings?.videoUrl || '';
    }
    return settings?.categoryBanners?.all?.videoUrl || 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-an-artisan-weaving-colorful-threads-42859-large.mp4';
  }, [currentCategoryInfo, categoryBannerSettings, settings]);

  const activePosterImage = useMemo(() => {
    if (currentCategoryInfo) {
      return currentCategoryInfo.bannerImage || categoryBannerSettings?.imageUrl || currentCategoryInfo.image || '/images/explore_handicrafts_banner.jpg';
    }
    return settings?.categoryBanners?.all?.imageUrl || '/images/explore_handicrafts_banner.jpg';
  }, [currentCategoryInfo, categoryBannerSettings, settings]);

  // Comprehensive Filtering & Sorting Logic
  const filteredAndSortedProducts = useMemo(() => {
    let list = [...products];

    // 1. Category Filter
    if (activeCategory && activeCategory !== 'all') {
      const catLower = activeCategory.toLowerCase();
      const catObj = categories.find(
        (c) =>
          (c.name || '').toLowerCase() === catLower ||
          (c.slug || '').toLowerCase() === catLower
      );
      const targetName = catObj ? catObj.name.toLowerCase() : catLower;

      list = list.filter((p) => {
        const pCat = (p.category || '').toLowerCase();
        const pSub = (p.subcategory || '').toLowerCase();
        return (
          pCat === targetName ||
          pCat.includes(catLower) ||
          pSub === catLower ||
          pSub.includes(catLower)
        );
      });
    }

    // 1b. Subcategory Filter
    if (activeSubcategory && activeSubcategory !== 'all') {
      const subLower = activeSubcategory.toLowerCase();
      list = list.filter((p) => {
        const pSub = (p.subcategory || '').toLowerCase();
        const pName = (p.name || '').toLowerCase();
        return (
          pSub.includes(subLower) ||
          subLower.includes(pSub) ||
          pName.includes(subLower)
        );
      });
    }

    // 2. Search Query (Name, Category, Material, Craft technique, Artisan name, State of Origin)
    const term = (searchQuery || internalSearch || '').trim().toLowerCase();
    if (term) {
      list = list.filter((p) => {
        const name = (p.name || '').toLowerCase();
        const cat = (p.category || '').toLowerCase();
        const sub = (p.subcategory || '').toLowerCase();
        const mat = (p.material || '').toLowerCase();
        const craft = (p.craft_technique || '').toLowerCase();
        const art = (p.artisan_name || p.artisan_profiles?.store_name || '').toLowerCase();
        const state = (p.state_of_origin || p.artisan_location || '').toLowerCase();
        const tags = Array.isArray(p.tags) ? p.tags.join(' ').toLowerCase() : '';

        return (
          name.includes(term) ||
          cat.includes(term) ||
          sub.includes(term) ||
          mat.includes(term) ||
          craft.includes(term) ||
          art.includes(term) ||
          state.includes(term) ||
          tags.includes(term)
        );
      });
    }

    // 3. Price Range Filter
    if (selectedPriceRange !== 'all') {
      if (selectedPriceRange === '0-500') list = list.filter((p) => p.price <= 500);
      else if (selectedPriceRange === '500-1000') list = list.filter((p) => p.price > 500 && p.price <= 1000);
      else if (selectedPriceRange === '1000-5000') list = list.filter((p) => p.price > 1000 && p.price <= 5000);
      else if (selectedPriceRange === '5000-10000') list = list.filter((p) => p.price > 5000 && p.price <= 10000);
      else if (selectedPriceRange === '10000+') list = list.filter((p) => p.price > 10000);
    }

    // 4. Rating Filter
    if (selectedRating > 0) {
      list = list.filter((p) => (p.rating || 4.8) >= selectedRating);
    }

    // 5. Material Filter
    if (selectedMaterial !== 'all') {
      list = list.filter((p) =>
        (p.material || '').toLowerCase().includes(selectedMaterial.toLowerCase())
      );
    }

    // 6. Availability Filter
    if (selectedAvailability === 'in_stock') {
      list = list.filter((p) => p.is_in_stock !== false && (p.stock_quantity === undefined || p.stock_quantity > 0));
    } else if (selectedAvailability === 'out_of_stock') {
      list = list.filter((p) => p.is_in_stock === false || p.stock_quantity <= 0);
    }

    // 7. Discount Filter
    if (selectedDiscount > 0) {
      list = list.filter((p) => {
        const disc =
          p.discount_percentage ||
          (p.original_price ? Math.round(((p.original_price - p.price) / p.original_price) * 100) : 0);
        return disc >= selectedDiscount;
      });
    }

    // 8. Sorting
    if (sort === 'price-asc') {
      list.sort((a, b) => a.price - b.price);
    } else if (sort === 'price-desc') {
      list.sort((a, b) => b.price - a.price);
    } else if (sort === 'rating') {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sort === 'discount') {
      list.sort((a, b) => (b.discount_percentage || 0) - (a.discount_percentage || 0));
    } else if (sort === 'popular') {
      list.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
    } else {
      // newest
      list.sort((a, b) => (b.id > a.id ? 1 : -1));
    }

    return list;
  }, [
    products,
    activeCategory,
    activeSubcategory,
    categories,
    searchQuery,
    internalSearch,
    selectedPriceRange,
    selectedRating,
    selectedMaterial,
    selectedAvailability,
    selectedDiscount,
    sort
  ]);

  const handleCategorySelect = (categoryName) => {
    if (categoryName === 'all') {
      navigate('/products');
    } else {
      navigate(`/products?category=${encodeURIComponent(categoryName)}`);
    }
  };

  const handleSubcategorySelect = (subName, categoryName) => {
    const params = new URLSearchParams(location.search);
    if (categoryName) {
      params.set('category', categoryName);
    }
    if (!subName || subName === 'all') {
      params.delete('subcategory');
    } else {
      params.set('subcategory', subName);
    }
    navigate(`/products?${params.toString()}`);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (internalSearch.trim()) {
      navigate(`/products?search=${encodeURIComponent(internalSearch.trim())}`);
    } else {
      navigate('/products');
    }
  };

  const clearAllFilters = () => {
    setSelectedPriceRange('all');
    setSelectedRating(0);
    setSelectedMaterial('all');
    setSelectedAvailability('all');
    setSelectedDiscount(0);
    setInternalSearch('');
    navigate('/products');
  };

  const materialsList = ['Cotton', 'Silk', 'Wood', 'Clay', 'Bamboo', 'Jute', 'Brass', 'Silver', 'Wool', 'Ceramic'];

  return (
    <div className="min-h-screen bg-dark-900 pb-20">
      {/* Breadcrumb Navigation */}
      <div className="bg-dark-950/60 border-b border-dark-700/60 py-3.5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex items-center gap-2 text-xs text-gray-400">
            <Link to="/" className="hover:text-gold-400 transition-colors">Home</Link>
            <HiChevronRight className="w-3.5 h-3.5 text-gray-600" />
            <Link to="/products" className="hover:text-gold-400 transition-colors">Categories</Link>
            {activeCategory && activeCategory !== 'all' && (
              <>
                <HiChevronRight className="w-3.5 h-3.5 text-gray-600" />
                <button
                  onClick={() => handleSubcategorySelect('all', currentCategoryInfo ? currentCategoryInfo.name : activeCategory)}
                  className={`transition-colors ${activeSubcategory && activeSubcategory !== 'all' ? 'hover:text-gold-400' : 'text-gold-400 font-medium'}`}
                >
                  {currentCategoryInfo ? currentCategoryInfo.name : activeCategory}
                </button>
              </>
            )}
            {activeSubcategory && activeSubcategory !== 'all' && (
              <>
                <HiChevronRight className="w-3.5 h-3.5 text-gray-600" />
                <span className="text-gold-400 font-semibold">{activeSubcategory}</span>
              </>
            )}
            {searchQuery && (
              <>
                <HiChevronRight className="w-3.5 h-3.5 text-gray-600" />
                <span className="text-gray-200">Search: "{searchQuery}"</span>
              </>
            )}
          </nav>
        </div>
      </div>

      {/* Official Hero Section Video Ad Banner */}
      <div className="relative w-full overflow-hidden bg-black select-none border-b border-dark-700 min-h-[420px] sm:min-h-[460px] md:min-h-[500px] flex items-center">
        {/* Background Video / Media Canvas */}
        <div className="absolute inset-0 w-full h-full overflow-hidden">
          {activeVideoUrl && !videoFailed ? (
            <video
              key={`banner-ad-video-${activeVideoUrl}`}
              src={activeVideoUrl}
              poster={activePosterImage}
              autoPlay
              loop
              muted={isMuted}
              playsInline
              className="w-full h-full object-cover object-center"
              onError={() => setVideoFailed(true)}
            />
          ) : (
            <img
              src={activePosterImage}
              alt={currentCategoryInfo ? currentCategoryInfo.name : "Indian Handicrafts"}
              className="w-full h-full object-cover object-center"
              onError={(e) => {
                if (!e.target.dataset.fallbackApplied) {
                  e.target.dataset.fallbackApplied = 'true';
                  e.target.src = '/images/explore_handicrafts_banner.jpg';
                }
              }}
            />
          )}

          {/* Cinematic Commercial Gradient Overlays (Never blocks the video on the right, keeps typography 100% crisp on the left) */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/70 sm:via-black/55 to-black/20 md:to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-transparent to-black/50 pointer-events-none" />

          {/* Luxury gold shimmer highlight lines */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gold-400 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-500/30 to-transparent pointer-events-none" />
        </div>

        {/* Top-Right Sponsored/Ad Tag Pill */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white/80 text-[10px] sm:text-xs font-semibold tracking-widest uppercase shadow-lg">
            <span>FEATURED CAMPAIGN</span>
            <span className="w-1.5 h-1.5 rounded-full bg-gold-400" />
          </span>
        </div>

        {/* Bottom-Right Audio Control Pill */}
        {activeVideoUrl && (
          <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-20">
            <button
              type="button"
              onClick={() => setIsMuted(prev => !prev)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 hover:border-gold-400 text-white text-xs font-medium backdrop-blur-md transition-all shadow-xl group cursor-pointer"
              title={isMuted ? "Unmute Audio" : "Mute Audio"}
            >
              {isMuted ? (
                <>
                  <HiVolumeOff className="w-4 h-4 text-gold-400 group-hover:scale-110 transition-transform" />
                  <span className="hidden sm:inline">Unmute Audio</span>
                </>
              ) : (
                <>
                  <HiVolumeUp className="w-4 h-4 text-gold-400 animate-pulse group-hover:scale-110 transition-transform" />
                  <span className="text-gold-300 font-semibold">Sound On</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Banner Content Container (Clean, Elegant Editorial Ad Typography floating over the cinema gradient) */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-10 sm:py-14 md:py-16">
          <div className="max-w-2xl text-left">
            
            {/* Ad Campaign Header Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-gold-500/20 border border-gold-400/60 text-gold-300 text-xs font-bold uppercase tracking-[0.2em] backdrop-blur-md shadow-lg shadow-gold-500/10 mb-4 sm:mb-5">
              <span>🇮🇳</span>
              <span>Master Artisans & Heritage</span>
              <HiSparkles className="w-3.5 h-3.5 text-gold-400 ml-0.5" />
            </div>

            {/* Campaign Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-serif font-bold text-white tracking-tight leading-[1.12] drop-shadow-2xl">
              {currentCategoryInfo ? (
                <>
                  {currentCategoryInfo.name}
                  {activeSubcategory && activeSubcategory !== 'all' ? (
                    <span className="block text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-gold-400 to-amber-200 text-2xl sm:text-4xl lg:text-5xl font-light mt-1.5 drop-shadow">
                      / {activeSubcategory}
                    </span>
                  ) : (
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-gold-400 to-amber-200 ml-2">
                      Collection
                    </span>
                  )}
                </>
              ) : (
                <>
                  Explore <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-gold-400 to-amber-200">Indian Handicrafts</span>
                </>
              )}
            </h1>

            {/* Compelling Ad Tagline */}
            <p className="text-gray-200 text-sm sm:text-base md:text-lg mt-4 leading-relaxed max-w-xl font-light drop-shadow-lg">
              {currentCategoryInfo
                ? (currentCategoryInfo.shortDesc || currentCategoryInfo.description || categoryBannerSettings?.subtitle)
                : (settings?.categoryBanners?.all?.subtitle || 'Generations of master heritage hand-woven and crafted into timeless luxury. 100% certified authentic directly from artisan clusters.')
              }
            </p>

            {/* Ad Feature Trust Pills */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 mt-6 text-xs sm:text-sm font-medium">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-gold-500/40 text-gold-300 shadow-md">
                <HiShieldCheck className="w-4 h-4 text-green-400" /> 100% Certified Authentic
              </span>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-gray-200 shadow-md">
                🏷️ Direct Artisan Pricing
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-gray-200 shadow-md">
                🚚 Free Express Shipping
              </span>
            </div>

            {/* Ad Action Row (CTA Button) */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-5 mt-7 sm:mt-8">
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('products-catalog-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2.5 px-7 py-3 rounded-full bg-gradient-to-r from-gold-500 via-gold-400 to-gold-600 hover:from-gold-400 hover:to-gold-300 text-dark-950 font-bold text-sm tracking-wide shadow-xl shadow-gold-500/25 hover:shadow-gold-500/40 hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <span>Shop Collection</span>
                <HiArrowRight className="w-4 h-4 text-dark-950" />
              </button>
              
              <span className="text-gray-300 text-xs sm:text-sm font-medium">
                <strong className="text-gold-400 font-semibold">{filteredAndSortedProducts.length}</strong> items curated
              </span>
            </div>

          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div id="products-catalog-section" className="max-w-7xl mx-auto px-4 sm:px-6 mt-8">
        {/* Results count & Sort Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-dark-800 p-4 rounded-2xl border border-dark-700 mb-6">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-white">
              Showing <span className="text-gold-400">{filteredAndSortedProducts.length}</span> Products
            </span>
            {(activeCategory !== 'all' || activeSubcategory !== 'all' || searchQuery || selectedPriceRange !== 'all' || selectedMaterial !== 'all') && (
              <button
                onClick={clearAllFilters}
                className="text-xs text-gold-400 hover:text-gold-300 flex items-center gap-1 font-medium underline"
              >
                <HiRefresh className="w-3.5 h-3.5" />
                Reset Filters
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
            {/* Multilingual Regional Language Selector */}
            <LanguageSelector variant="compact" />

            {/* Mobile Filter Toggle */}
            <button
              onClick={() => setFilterOpen(true)}
              className="lg:hidden btn-outline flex-1 sm:flex-none flex items-center justify-center gap-2 py-2 text-xs"
            >
              <HiFilter className="w-4 h-4" />
              <span>Filters & Sort</span>
            </button>

            {/* Sorting */}
            <div className="flex items-center gap-2 flex-1 sm:flex-none">
              <span className="text-xs text-gray-400 hidden sm:inline whitespace-nowrap">Sort by:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="bg-dark-900 border border-dark-600 focus:border-gold-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none w-full sm:w-48"
              >
                <option value="popular">Most Popular</option>
                <option value="newest">Newest Arrivals</option>
                <option value="rating">Best Rated</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="discount">Highest Discount</option>
              </select>
            </div>
          </div>
        </div>

        {/* Quick Subcategory Pills / Filter Chips */}
        {currentCategoryInfo && Array.isArray(currentCategoryInfo.subcategories) && currentCategoryInfo.subcategories.length > 0 && (
          <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-dark-700">
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1.5">
              <span>Subcategories:</span>
            </span>
            <button
              onClick={() => handleSubcategorySelect('all', currentCategoryInfo.name)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                activeSubcategory === 'all'
                  ? 'bg-gold-500 text-dark-950 shadow-gold font-bold'
                  : 'bg-dark-800 text-gray-300 hover:text-white hover:bg-dark-700 border border-dark-700'
              }`}
            >
              All {currentCategoryInfo.name.split('&')[0].trim()}
            </button>
            {currentCategoryInfo.subcategories.map((sub) => {
              const isSubActive = activeSubcategory.toLowerCase() === sub.toLowerCase();
              return (
                <button
                  key={sub}
                  onClick={() => handleSubcategorySelect(sub, currentCategoryInfo.name)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                    isSubActive
                      ? 'bg-gold-500 text-dark-950 shadow-gold font-bold'
                      : 'bg-dark-800 text-gray-300 hover:text-white hover:bg-dark-700 border border-dark-700'
                  }`}
                >
                  {sub}
                </button>
              );
            })}
          </div>
        )}

        {/* Layout: Sidebar Filter + Responsive Product Grid */}
        <div className="flex gap-8 items-start">
          {/* Filter Sidebar (Desktop Sticky + Mobile Drawer) */}
          <aside
            className={`
              fixed inset-0 z-50 bg-dark-950/95 backdrop-blur-md p-6 overflow-y-auto transform transition-transform duration-300
              lg:sticky lg:top-24 lg:z-10 lg:translate-x-0 lg:bg-dark-800 lg:p-6 lg:rounded-2xl lg:border lg:border-dark-700 lg:w-72 lg:block
              ${filterOpen ? 'translate-x-0' : '-translate-x-full'}
            `}
          >
            {/* Mobile Header */}
            <div className="flex justify-between items-center lg:hidden pb-4 mb-6 border-b border-dark-700">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <HiFilter className="text-gold-400" /> Filter & Refine
              </h2>
              <button
                onClick={() => setFilterOpen(false)}
                className="p-2 text-gray-400 hover:text-white"
              >
                <HiX className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6 text-sm">
              {/* 1. Category Filter */}
              <div>
                <h3 className="font-serif font-bold text-white uppercase text-xs tracking-wider mb-3 text-gold-400">
                  Categories
                </h3>
                <ul className="space-y-1.5">
                  <li>
                    <button
                      onClick={() => handleCategorySelect('all')}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        activeCategory === 'all'
                          ? 'bg-gold-500/20 text-gold-400 border border-gold-500/40 font-semibold'
                          : 'text-gray-300 hover:bg-dark-700/60'
                      }`}
                    >
                      All Categories
                    </button>
                  </li>
                  {categories.map((cat) => {
                    const isCatActive =
                      activeCategory.toLowerCase() === (cat.name || '').toLowerCase() ||
                      activeCategory.toLowerCase() === (cat.slug || '').toLowerCase();

                    return (
                      <li key={cat.id || cat.slug || cat.name} className="space-y-1">
                        <button
                          onClick={() => handleCategorySelect(cat.name)}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-all ${
                            isCatActive
                              ? 'bg-gold-500/20 text-gold-400 border border-gold-500/40 font-semibold'
                              : 'text-gray-300 hover:bg-dark-700/60'
                          }`}
                        >
                          <span className="truncate">{cat.name}</span>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            {cat.productCount ? <span className="text-[10px] text-gray-500">({cat.productCount})</span> : null}
                            {Array.isArray(cat.subcategories) && cat.subcategories.length > 0 && (
                              <HiChevronDown className={`w-3 h-3 transition-transform ${isCatActive ? 'rotate-180 text-gold-400' : 'text-gray-500'}`} />
                            )}
                          </div>
                        </button>

                        {/* Subcategories Accordion under Active Category */}
                        {isCatActive && Array.isArray(cat.subcategories) && cat.subcategories.length > 0 && (
                          <div className="pl-3 pr-1 py-1 space-y-1 border-l-2 border-gold-500/40 ml-3">
                            <button
                              onClick={() => handleSubcategorySelect('all', cat.name)}
                              className={`w-full text-left px-2.5 py-1 rounded-lg text-[11px] transition-colors flex items-center gap-2 ${
                                activeSubcategory === 'all'
                                  ? 'text-gold-400 font-bold bg-gold-500/10'
                                  : 'text-gray-400 hover:text-gray-200 hover:bg-dark-700/40'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${activeSubcategory === 'all' ? 'bg-gold-400' : 'bg-gray-600'}`} />
                              <span>All {cat.name.split('&')[0].trim()}</span>
                            </button>
                            {cat.subcategories.map((sub) => {
                              const isSubActive = activeSubcategory.toLowerCase() === sub.toLowerCase();
                              return (
                                <button
                                  key={sub}
                                  onClick={() => handleSubcategorySelect(sub, cat.name)}
                                  className={`w-full text-left px-2.5 py-1 rounded-lg text-[11px] transition-colors flex items-center gap-2 ${
                                    isSubActive
                                      ? 'text-gold-400 font-bold bg-gold-500/15'
                                      : 'text-gray-400 hover:text-gray-200 hover:bg-dark-700/40'
                                  }`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${isSubActive ? 'bg-gold-400 ring-2 ring-gold-400/30' : 'bg-gray-600'}`} />
                                  <span className="truncate">{sub}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* 2. Price Range */}
              <div className="pt-4 border-t border-dark-700/80">
                <h3 className="font-serif font-bold text-white uppercase text-xs tracking-wider mb-3 text-gold-400">
                  Price Range
                </h3>
                <div className="space-y-2">
                  {[
                    { id: 'all', label: 'All Prices' },
                    { id: '0-500', label: 'Under ₹500' },
                    { id: '500-1000', label: '₹500 – ₹1,000' },
                    { id: '1000-5000', label: '₹1,000 – ₹5,000' },
                    { id: '5000-10000', label: '₹5,000 – ₹10,000' },
                    { id: '10000+', label: '₹10,000+' }
                  ].map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2.5 text-xs text-gray-300 hover:text-white cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="price_range"
                        checked={selectedPriceRange === p.id}
                        onChange={() => setSelectedPriceRange(p.id)}
                        className="accent-gold-500"
                      />
                      <span>{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 3. Rating */}
              <div className="pt-4 border-t border-dark-700/80">
                <h3 className="font-serif font-bold text-white uppercase text-xs tracking-wider mb-3 text-gold-400">
                  Customer Rating
                </h3>
                <div className="space-y-2">
                  {[
                    { val: 0, label: 'All Ratings' },
                    { val: 4, label: '⭐ 4.0 & above' },
                    { val: 3, label: '⭐ 3.0 & above' },
                    { val: 2, label: '⭐ 2.0 & above' }
                  ].map((r) => (
                    <label
                      key={r.val}
                      className="flex items-center gap-2.5 text-xs text-gray-300 hover:text-white cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="rating"
                        checked={selectedRating === r.val}
                        onChange={() => setSelectedRating(r.val)}
                        className="accent-gold-500"
                      />
                      <span>{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 4. Material */}
              <div className="pt-4 border-t border-dark-700/80">
                <h3 className="font-serif font-bold text-white uppercase text-xs tracking-wider mb-3 text-gold-400">
                  Craft Material
                </h3>
                <select
                  value={selectedMaterial}
                  onChange={(e) => setSelectedMaterial(e.target.value)}
                  className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-gold-500"
                >
                  <option value="all">All Materials</option>
                  {materialsList.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Discount Filter */}
              <div className="pt-4 border-t border-dark-700/80">
                <h3 className="font-serif font-bold text-white uppercase text-xs tracking-wider mb-3 text-gold-400">
                  Discount
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: 0, label: 'Any' },
                    { val: 10, label: '10%+ Off' },
                    { val: 20, label: '20%+ Off' },
                    { val: 30, label: '30%+ Off' },
                    { val: 50, label: '50%+ Off' }
                  ].map((d) => (
                    <button
                      key={d.val}
                      type="button"
                      onClick={() => setSelectedDiscount(d.val)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        selectedDiscount === d.val
                          ? 'bg-red-600 text-white border-red-500 shadow-sm'
                          : 'bg-dark-900 border-dark-600 text-gray-400 hover:text-white'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. Availability */}
              <div className="pt-4 border-t border-dark-700/80">
                <h3 className="font-serif font-bold text-white uppercase text-xs tracking-wider mb-3 text-gold-400">
                  Availability
                </h3>
                <div className="space-y-2">
                  {[
                    { id: 'all', label: 'All Items' },
                    { id: 'in_stock', label: 'In Stock Only' },
                    { id: 'out_of_stock', label: 'Out of Stock' }
                  ].map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center gap-2.5 text-xs text-gray-300 hover:text-white cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="availability"
                        checked={selectedAvailability === a.id}
                        onChange={() => setSelectedAvailability(a.id)}
                        className="accent-gold-500"
                      />
                      <span>{a.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Clear Filters Button */}
              <button
                onClick={clearAllFilters}
                className="w-full btn-outline py-2 text-xs font-semibold mt-4"
              >
                Reset All Filters
              </button>
            </div>
          </aside>

          {/* Product Grid Area (4 cols desktop, 2-3 cols tablet, 2 cols mobile) */}
          <main className="flex-1">
            {currentLang !== 'en' && (
              <div className="mb-4 flex items-center justify-between gap-2 p-3 px-4 rounded-xl bg-gold-500/10 border border-gold-500/30 text-xs text-gold-400 backdrop-blur-sm shadow-sm">
                <span className="flex items-center gap-2">
                  <HiSparkles className="w-4 h-4 text-gold-400 shrink-0" />
                  <span>
                    Viewing handcrafted products in <strong className="text-white font-bold">{currentLangMeta?.native || 'Regional Language'}</strong> via Gemini AI
                  </span>
                </span>
                <span className="text-[10px] text-gray-400 hidden sm:inline">Authentic Cultural Translation</span>
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredAndSortedProducts.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {filteredAndSortedProducts.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            ) : (
              /* No Products Found Empty State */
              <div className="text-center py-20 bg-dark-800 rounded-3xl border border-dark-700 p-8 max-w-xl mx-auto">
                <div className="w-16 h-16 rounded-full bg-gold-500/10 border border-gold-500/30 flex items-center justify-center mx-auto mb-4 text-3xl text-gold-400">
                  🔍
                </div>
                <h3 className="text-xl font-serif font-bold text-white mb-2">
                  No products found
                </h3>
                <p className="text-gray-400 text-sm mb-6">
                  No products found. Try searching for another handicraft, adjusting your filters, or browsing our full collection.
                </p>
                <button onClick={clearAllFilters} className="btn-gold px-6 py-2.5 text-xs font-semibold">
                  View All Handicrafts
                </button>
              </div>
            )}

            {/* Fallback recommendations when search yields few or 0 products */}
            {!loading && filteredAndSortedProducts.length === 0 && (
              <div className="mt-12 text-left w-full border-t border-dark-700/80 pt-8">
                <PersonalizedRecommendations
                  title="Curated Recommendations For You"
                  subtitle="While you refine your search, discover these authentic Indian handicrafts"
                  limit={4}
                  showControls={false}
                  className="py-2"
                />
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
