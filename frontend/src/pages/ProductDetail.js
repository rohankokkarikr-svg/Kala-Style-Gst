import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useRecommendations } from '../context/RecommendationContext';
import { productAPI, reviewAPI, artisanAPI } from '../services/api';
import ReviewModal from '../components/ReviewModal';
import ProductCard from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/Skeleton';
import toast from 'react-hot-toast';
import { useLanguage } from '../context/LanguageContext';
import LanguageSelector from '../components/LanguageSelector';
import {
  HiShoppingCart, HiStar, HiTruck, HiShieldCheck, HiHeart,
  HiChevronRight, HiCheckCircle, HiBadgeCheck, HiPencilAlt,
  HiSparkles, HiChatAlt2, HiChevronDown, HiChevronUp,
  HiLocationMarker, HiClock, HiRefresh, HiLockClosed, HiArrowRight,
} from 'react-icons/hi';
import SendMessageModal from '../components/SendMessageModal';

/* ─── Accordion ─── */
function AccordionItem({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-dark-700/60 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-4 px-1 text-left group"
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold text-white group-hover:text-gold-400 transition-colors">
          {icon && <span className="text-gold-400">{icon}</span>}
          {title}
        </span>
        {open
          ? <HiChevronUp className="w-4 h-4 text-gold-400 shrink-0" />
          : <HiChevronDown className="w-4 h-4 text-gray-500 group-hover:text-gold-400 shrink-0 transition-colors" />}
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${open ? 'max-h-[800px] opacity-100 pb-5' : 'max-h-0 opacity-0'}`}>
        <div className="text-sm text-gray-300 leading-relaxed px-1">{children}</div>
      </div>
    </div>
  );
}

/* ─── Star Row ─── */
function StarRow({ rating, size = 'w-4 h-4' }) {
  const full = Math.floor(Number(rating) || 0);
  return (
    <span className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <HiStar key={i} className={`${size} ${i <= full ? 'text-gold-400' : 'text-dark-600'}`} />
      ))}
    </span>
  );
}

/* ─── Product Images Extraction Helper ─── */
function extractProductImages(prod) {
  if (!prod) return [];
  let list = [];
  if (Array.isArray(prod.images) && prod.images.length > 0) {
    list = prod.images.filter(Boolean);
  } else if (typeof prod.images === 'string') {
    try {
      const parsed = JSON.parse(prod.images);
      if (Array.isArray(parsed)) list = parsed.filter(Boolean);
    } catch (e) {}
  }

  // Check tags for __IMAGES__: fallback
  if (list.length === 0 && Array.isArray(prod.tags)) {
    const imgTag = prod.tags.find(t => typeof t === 'string' && t.startsWith('__IMAGES__:'));
    if (imgTag) {
      try {
        const parsed = JSON.parse(imgTag.replace('__IMAGES__:', ''));
        if (Array.isArray(parsed)) list = parsed.filter(Boolean);
      } catch (e) {}
    }
  }

  if (list.length === 0) {
    const fallback = prod.image_url || prod.image;
    if (fallback) list = [fallback];
  }

  return [...new Set(list.filter(Boolean))];
}

/* ══════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════ */
export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { isAuthenticated, isAdmin } = useAuth();
  const { settings } = useSettings();
  const { trackProductView, fetchRecommendations, dismissProduct } = useRecommendations();
  const timeline = settings?.shipping_estimated_days || '3 - 5 Business Days';

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState('');
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [productReviews, setProductReviews] = useState([]);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const reviewsRef = useRef(null);

  const { currentLang, setLanguage, translateProductDetails, currentLangMeta } = useLanguage();
  const [translatedData, setTranslatedData] = useState(null);

  useEffect(() => {
    let isMounted = true;
    if (!product || currentLang === 'en') { setTranslatedData(null); return; }
    translateProductDetails(product, currentLang).then(res => {
      if (isMounted && res) setTranslatedData(res);
    });
    return () => { isMounted = false; };
  }, [product, currentLang, translateProductDetails]);

  const fetchProduct = async () => {
    setLoading(true);
    try {
      let found = null;
      try {
        const { data } = await productAPI.getById(id);
        if (data && (data.id || data.name)) found = data;
      } catch (apiErr) { console.warn('Backend product API notice:', apiErr.message); }

      if (found) {
        if (!found.artisan_profiles && (found.artisan_id || found.user_id)) {
          try {
            const { data: artData } = await artisanAPI.getById(found.artisan_id || found.user_id);
            if (artData) found.artisan_profiles = artData.profile || artData;
          } catch (e) {}
        }
        setProduct(found);
        const imgs = extractProductImages(found);
        setSelectedImage(imgs[0] || '');
        setSelectedImageIdx(0);
      } else {
        throw new Error('Product not found');
      }
    } catch (err) {
      console.warn('Product load error:', err.message);
      toast.error('Product not found');
      navigate('/products');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchProduct();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [id, navigate]);

  useEffect(() => {
    const handleSync = async () => {
      try {
        const { data } = await productAPI.getById(id);
        if (data && (data.id || data.name))
          setProduct(prev => ({ ...prev, ...data, artisan_profiles: data.artisan_profiles || prev?.artisan_profiles }));
      } catch (err) {}
    };
    window.addEventListener('kala:sync:artisans_updated', handleSync);
    window.addEventListener('kala:sync:products_updated', handleSync);
    return () => {
      window.removeEventListener('kala:sync:artisans_updated', handleSync);
      window.removeEventListener('kala:sync:products_updated', handleSync);
    };
  }, [id]);

  useEffect(() => {
    if (product?.id) {
      trackProductView(product);
    }
  }, [product, trackProductView]);

  useEffect(() => {
    if (!product) return;
    const fetchRelated = async () => {
      setLoadingRelated(true);
      try {
        const res = await fetchRecommendations({
          limit: 4,
          targetCategory: product.category,
          excludeIds: [product.id],
        });
        if (res?.recommendations && res.recommendations.length > 0) {
          setRelatedProducts(res.recommendations);
        } else {
          const { data } = await productAPI.getAll({ category: product.category });
          setRelatedProducts(Array.isArray(data) ? data.filter(p => p.id !== product.id).slice(0, 4) : []);
        }
      } catch {
        try {
          const { data } = await productAPI.getAll({ category: product.category });
          setRelatedProducts(Array.isArray(data) ? data.filter(p => p.id !== product.id).slice(0, 4) : []);
        } catch { setRelatedProducts([]); }
      } finally { setLoadingRelated(false); }
    };
    fetchRelated();
    if (product?.name) {
      reviewAPI.getApproved({ product_name: product.name })
        .then(res => setProductReviews(res.data || []))
        .catch(() => {});
    }
  }, [product, fetchRecommendations]);

  const totalReviewsCount = productReviews.length;
  const avgRating = totalReviewsCount > 0
    ? (productReviews.reduce((s, r) => s + Number(r.rating || 5), 0) / totalReviewsCount).toFixed(1)
    : (product?.rating && Number(product?.reviews_count) > 0 ? Number(product.rating).toFixed(1) : null);

  const ratingCounts = useMemo(() => {
    const c = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    productReviews.forEach(r => { const s = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 5))); c[s]++; });
    return c;
  }, [productReviews]);

  const ratingBars = [5,4,3,2,1].map(stars => {
    const count = ratingCounts[stars] || 0;
    const pct = totalReviewsCount > 0 ? Math.round((count / totalReviewsCount) * 100) : 0;
    return { stars, pct, count };
  });

  const handleReviewSubmitted = newReview => {
    if (!newReview) return;
    setProductReviews(prev => [newReview, ...prev.filter(r => r.id !== newReview.id)]);
    setTimeout(() => reviewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  };

  if (loading || !product) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 border-4 border-gold-500/20 border-t-gold-500 rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-sm font-medium tracking-wide">Loading handcrafted product details...</p>
        </div>
      </div>
    );
  }

  const discount =
    product.discount_percentage ||
    (product.original_price && product.original_price > product.price
      ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
      : null);

  const imagesList = extractProductImages(product);

  const isFavorited = isInWishlist(product.id);
  const artisanProfile = product?.artisan_profiles || {};
  const isOutOfStock = product.is_in_stock === false || (product.stock_quantity != null && Number(product.stock_quantity) <= 0);
  const rawArtisanBio = artisanProfile.bio || product?.artisan_bio || '';
  const cleanArtisanBio = (rawArtisanBio.split('__UPI_META__:')[0] || '').trim() ||
    'Carrying forward ancestral Indian craft traditions with unwavering dedication to perfection and authentic handmade heritage.';
  const artisanName = artisanProfile.store_name || product?.artisan_name || 'Independent Artisan';
  const artisanAvatar = artisanProfile.profile_image || product?.artisan_avatar ||
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop';
  const artisanLocation = artisanProfile.location || product?.artisan_location || 'Varanasi';
  const artisanHeritage = artisanProfile.years_of_experience || product?.years_of_experience || 20;

  const displayedTitle = translatedData?.name || product.name;
  const displayedDescription = translatedData?.description || product.description || product.short_description || '';
  const displayedShortDescription = translatedData?.short_description || product.short_description || product.description || '';
  const displayedMaterial = translatedData?.material || product.material || 'Authentic Handcrafted';
  const displayedCraftTechnique = translatedData?.craft_technique || product.craft_technique || 'Traditional Indian Handicrafts';
  const displayedArtisanBio = translatedData?.artisan_bio || cleanArtisanBio;
  const displayedCareInstructions = translatedData?.care_instructions || product.care_instructions || 'Store in dry place. Wipe gently with dry cloth. Avoid exposure to harsh chemicals.';
  const displayedStateOfOrigin = translatedData?.state_of_origin || product.state_of_origin || 'India';

  const handleAddToCart = () => {
    if (isOutOfStock) {
      toast.error('This product is currently out of stock');
      return;
    }
    if (!isAuthenticated) { toast.error('Please log in to add items to your cart'); navigate('/login'); return; }
    addToCart(product, product.sizes?.[0] || 'Standard', quantity);
  };

  const handleImageSelect = (img, idx) => { setSelectedImage(img); setSelectedImageIdx(idx); };

  return (
    <div className="min-h-screen bg-dark-900">

      {/* Breadcrumb */}
      <div className="bg-dark-950/70 border-b border-dark-700/50 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex items-center gap-1.5 text-xs text-gray-500 flex-wrap">
            <Link to="/" className="hover:text-gold-400 transition-colors">Home</Link>
            <HiChevronRight className="w-3 h-3 text-dark-600" />
            <Link to="/products" className="hover:text-gold-400 transition-colors">Handicrafts</Link>
            <HiChevronRight className="w-3 h-3 text-dark-600" />
            <Link to={`/products?category=${encodeURIComponent(product.category || 'all')}`} className="hover:text-gold-400 transition-colors">
              {product.category}
            </Link>
            <HiChevronRight className="w-3 h-3 text-dark-600" />
            <span className="text-gray-300 truncate max-w-[220px]">{displayedTitle}</span>
          </nav>
        </div>
      </div>

      {/* Admin Bar */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-gold-500/20 via-dark-800 to-dark-900 border-b border-gold-500/30 py-3 px-4 sm:px-6 sticky top-16 z-30 backdrop-blur-md">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="px-2 py-0.5 rounded bg-gold-500 text-dark-950 font-black text-[11px] tracking-wider uppercase">ADMIN MODE</span>
              <p className="text-xs text-white font-medium">You have administrative access to edit this product.</p>
            </div>
            <Link
              to={`/admin/products?edit=${product.id}`}
              className="btn-primary text-xs py-1.5 px-4 font-bold flex items-center gap-2 shadow-gold shrink-0"
            >
              <HiPencilAlt className="w-4 h-4" /> Edit Product in Admin Panel
            </Link>
          </div>
        </div>
      )}

      {/* ═══ HERO: Gallery + Purchase Panel ═══ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12 items-start">

          {/* Gallery */}
          <div className="lg:col-span-6 xl:col-span-7">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Vertical thumbnails - desktop */}
              {imagesList.length > 1 && (
                <div className="hidden sm:flex flex-col gap-3 w-20 flex-shrink-0">
                  {imagesList.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleImageSelect(img, idx)}
                      className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 transition-all duration-200 flex-shrink-0 ${
                        selectedImageIdx === idx
                          ? 'border-gold-500 ring-2 ring-gold-500/30 scale-[0.97]'
                          : 'border-dark-700 opacity-55 hover:opacity-90 hover:border-dark-500'
                      }`}
                    >
                      <img
                        src={img}
                        alt={`View ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={e => {
                          e.target.src = 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048652/kalastyle-artisan-marketplace/wesedw9fpem0032yfsmk.jpg';
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Main image */}
              <div className="flex-1">
                <div className="relative aspect-square rounded-2xl overflow-hidden bg-dark-800 border border-dark-700/80 shadow-2xl group">
                  <img
                    src={selectedImage || imagesList[0]}
                    alt={product.name}
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                    onError={e => {
                      e.target.src = 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048652/kalastyle-artisan-marketplace/wesedw9fpem0032yfsmk.jpg';
                    }}
                  />
                  {/* Badges */}
                  <div className="absolute top-3.5 left-3.5 flex flex-col gap-2 z-10 pointer-events-none">
                    {discount && (
                      <span className="bg-red-600 text-white font-bold text-[11px] uppercase px-2.5 py-1 rounded-full shadow-lg">
                        🔥 {discount}% OFF
                      </span>
                    )}
                    <span className="bg-dark-900/90 backdrop-blur-md text-gold-400 border border-gold-500/30 text-[10px] font-semibold uppercase px-2.5 py-1 rounded-full flex items-center gap-1.5">
                      <span>🇮🇳</span><span>Handmade in India</span>
                    </span>
                  </div>
                  {/* Wishlist */}
                  <button
                    onClick={() => toggleWishlist(product)}
                    className={`absolute top-3.5 right-3.5 p-2.5 rounded-full backdrop-blur-md shadow-xl transition-all z-10 ${
                      isFavorited ? 'bg-red-500 text-white' : 'bg-dark-900/80 text-gray-400 hover:text-red-400 hover:bg-dark-900'
                    }`}
                    aria-label="Toggle Wishlist"
                  >
                    <HiHeart className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
                  </button>
                  {/* Counter pill */}
                  {imagesList.length > 1 && (
                    <div className="absolute bottom-3.5 right-3.5 bg-dark-900/80 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-full border border-dark-600/60">
                      {selectedImageIdx + 1}/{imagesList.length}
                    </div>
                  )}
                </div>

                {/* Mobile thumbnail strip */}
                {imagesList.length > 1 && (
                  <div className="flex sm:hidden gap-2.5 mt-3 overflow-x-auto pb-1">
                    {imagesList.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleImageSelect(img, idx)}
                        className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 flex-shrink-0 transition-all ${
                          selectedImageIdx === idx ? 'border-gold-500 ring-1 ring-gold-500/30' : 'border-dark-700 opacity-55 hover:opacity-90'
                        }`}
                      >
                        <img
                          src={img}
                          alt={`View ${idx + 1}`}
                          className="w-full h-full object-cover"
                          onError={e => {
                            e.target.src = 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048652/kalastyle-artisan-marketplace/wesedw9fpem0032yfsmk.jpg';
                          }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Trust strip */}
            <div className="grid grid-cols-3 gap-3 mt-5">
              {[
                { emoji: '✋', title: '100% Handmade', sub: 'Pure Artisan Craft' },
                { emoji: '🌿', title: 'Eco-Friendly', sub: 'Natural Materials' },
                { emoji: '🏆', title: 'GI Heritage', sub: 'Direct From Origin' },
              ].map(t => (
                <div key={t.title} className="p-3.5 rounded-2xl bg-dark-800/70 border border-dark-700/80 text-center hover:border-gold-500/20 transition-colors">
                  <span className="text-xl block mb-1">{t.emoji}</span>
                  <span className="text-[11px] font-bold text-white block">{t.title}</span>
                  <span className="text-[10px] text-gray-500">{t.sub}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Purchase Panel */}
          <div className="lg:col-span-6 xl:col-span-5 space-y-5">
            <LanguageSelector variant="banner" />

            {translatedData && (
              <div className="flex items-center justify-between gap-2 p-3 px-4 rounded-xl bg-gradient-to-r from-gold-500/15 via-gold-500/5 to-transparent border border-gold-500/30 text-xs text-gold-400">
                <div className="flex items-center gap-2 font-medium">
                  <HiSparkles className="w-3.5 h-3.5 text-gold-400 shrink-0 animate-spin" />
                  <span>Translated to <strong className="text-white">{currentLangMeta.native}</strong> via Gemini AI</span>
                </div>
                <button type="button" onClick={() => setLanguage('en')}
                  className="px-2.5 py-1 rounded-lg bg-dark-900/80 hover:bg-dark-700 text-[10px] font-bold text-gray-300 hover:text-white border border-dark-600 transition-colors cursor-pointer">
                  Show Original
                </button>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider">
              <Link to={`/products?category=${encodeURIComponent(product.category)}`} className="text-gold-500 hover:text-gold-400 transition-colors">
                {product.category}{product.subcategory && ` · ${product.subcategory}`}
              </Link>
              {displayedStateOfOrigin && (
                <span className="text-gray-500 flex items-center gap-1 font-normal normal-case tracking-normal">
                  <HiLocationMarker className="w-3.5 h-3.5 text-gold-500/70" />
                  {displayedStateOfOrigin}, India
                </span>
              )}
            </div>

            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-white leading-tight">
                {displayedTitle}
              </h1>
              {isAdmin && (
                <Link to={`/admin/products?edit=${product.id}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gold-500/10 hover:bg-gold-500/20 border border-gold-500/30 text-gold-400 hover:text-gold-300 text-[11px] font-bold shrink-0 transition-all"
                  title="Edit in Admin Panel">
                  <HiPencilAlt className="w-3 h-3" /> Edit
                </Link>
              )}
            </div>

            {/* Rating row */}
            <div className="flex items-center gap-3 flex-wrap">
              {avgRating ? (
                <>
                  <StarRow rating={avgRating} />
                  <span className="text-sm font-bold text-white">{avgRating}</span>
                  <button type="button"
                    onClick={() => reviewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="text-xs text-gold-400 hover:text-gold-300 underline cursor-pointer">
                    ({totalReviewsCount || product.reviews_count || 0} review{(totalReviewsCount || product.reviews_count) !== 1 ? 's' : ''})
                  </button>
                </>
              ) : (
                <button type="button"
                  onClick={() => setReviewModalOpen(true)}
                  className="text-xs text-gold-400 hover:text-gold-300 underline cursor-pointer">
                  No reviews yet · Be the first to review
                </button>
              )}
              <span className="text-dark-600">·</span>
              <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                <HiCheckCircle className="w-3.5 h-3.5" /> 100% Authentic Handcraft
              </span>
            </div>

            {/* Price card */}
            <div className="rounded-2xl bg-dark-800/90 border border-dark-700 p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div>
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">Direct Artisan Price</span>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-3xl sm:text-4xl font-bold gold-text">
                      ₹{Number(product.price).toLocaleString('en-IN')}
                    </span>
                    {product.original_price && product.original_price > product.price && (
                      <span className="text-lg text-gray-600 line-through">₹{Number(product.original_price).toLocaleString('en-IN')}</span>
                    )}
                    {discount && (
                      <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                        Save ₹{(product.original_price - product.price).toLocaleString('en-IN')} ({discount}% OFF)
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-500 mt-1 block">
                    Inclusive of all taxes · <span className="text-emerald-400 font-medium">✓ Free Delivery Across India</span>
                  </span>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border shrink-0 ${
                  !isOutOfStock
                    ? 'bg-emerald-950/60 border-emerald-500/20 text-emerald-400'
                    : 'bg-red-950/60 border-red-500/20 text-red-400'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${!isOutOfStock ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                  {!isOutOfStock ? `In Stock (${product.stock_quantity ?? 10} units) · Ready to Dispatch` : 'Currently Out of Stock'}
                </div>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed border-t border-dark-700/60 pt-3">{displayedShortDescription}</p>
            </div>

            {/* Qty + CTA */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-dark-600 rounded-xl bg-dark-800 overflow-hidden">
                  <button type="button" onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="px-4 py-3 text-gray-400 hover:text-white hover:bg-dark-700 transition-colors font-bold text-base">−</button>
                  <span className="px-5 py-3 text-sm font-bold text-white min-w-[3rem] text-center">{quantity}</span>
                  <button type="button" onClick={() => setQuantity(q => q + 1)}
                    className="px-4 py-3 text-gray-400 hover:text-white hover:bg-dark-700 transition-colors font-bold text-base">+</button>
                </div>
                <button onClick={handleAddToCart} disabled={isOutOfStock}
                  className="btn-primary flex-1 py-3.5 rounded-xl flex items-center justify-center gap-2.5 text-sm font-bold shadow-gold hover:shadow-gold/40 disabled:opacity-50 disabled:cursor-not-allowed">
                  <HiShoppingCart className="w-5 h-5" />
                  Add to Cart · ₹{(product.price * quantity).toLocaleString('en-IN')}
                </button>
                <button onClick={() => toggleWishlist(product)}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isFavorited ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-dark-800 border-dark-600 text-gray-400 hover:border-red-500/30 hover:text-red-400'
                  }`}
                  aria-label="Toggle Wishlist">
                  <HiHeart className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-gray-400 px-1">
                <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <HiTruck className="w-4 h-4" /> Free Express Delivery · {timeline}
                </span>
                <span className="flex items-center gap-1.5"><HiShieldCheck className="w-4 h-4 text-gold-400" /> 7-Day Easy Returns</span>
                <span className="flex items-center gap-1.5"><HiLockClosed className="w-4 h-4 text-gold-400" /> Secure Checkout</span>
              </div>
            </div>

            {/* Quick specs */}
            {(displayedMaterial || displayedCraftTechnique || product.dimensions || product.weight) && (
              <div className="grid grid-cols-2 gap-2.5 p-4 rounded-2xl bg-dark-800/40 border border-dark-700/70">
                {[
                  { label: 'Material', value: displayedMaterial },
                  { label: 'Craft Technique', value: displayedCraftTechnique },
                  { label: 'Dimensions', value: product.dimensions },
                  { label: 'Weight', value: product.weight },
                ].filter(s => s.value).map(spec => (
                  <div key={spec.label}>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-0.5">{spec.label}</span>
                    <span className="text-xs font-semibold text-white">{spec.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Artisan mini-card */}
            {(artisanName || cleanArtisanBio || product.artisan_profiles) && (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-dark-800 via-dark-800 to-dark-850 border border-gold-500/20 relative overflow-hidden">
                <div className="absolute -right-8 -top-8 w-32 h-32 bg-gold-500/5 rounded-full pointer-events-none" />
                <div className="flex items-center gap-4 relative">
                  <img src={artisanAvatar} alt={artisanName}
                    className="w-14 h-14 rounded-full object-cover ring-2 ring-gold-500/50 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-semibold text-gold-400 uppercase tracking-widest">Meet the Artisan</span>
                      <HiBadgeCheck className="text-gold-400 w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-base font-serif font-bold text-white truncate">{artisanName}</h3>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <HiLocationMarker className="w-3 h-3" />
                        {artisanLocation}{displayedStateOfOrigin && displayedStateOfOrigin !== artisanLocation ? `, ${displayedStateOfOrigin}` : ''}
                      </span>
                      {artisanHeritage && (
                        <span className="flex items-center gap-1"><HiClock className="w-3 h-3" />{artisanHeritage}+ yrs experience</span>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-3 italic leading-relaxed line-clamp-2">"{displayedArtisanBio}"</p>
                <button type="button" onClick={() => setMessageModalOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gold-500/10 hover:bg-gold-500/20 border border-gold-500/30 text-gold-400 hover:text-gold-300 font-bold text-xs transition-all cursor-pointer">
                  <HiChatAlt2 className="w-3.5 h-3.5" />
                  Message Artisan Directly
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ ACCORDION INFO ═══ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-dark-800/60 border border-dark-700/70 rounded-2xl divide-y divide-dark-700/50 overflow-hidden p-2">
            <AccordionItem title="Product Description" icon="📜" defaultOpen>
              <div className="space-y-4">
                <p className="text-gray-300 leading-relaxed">{displayedDescription}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3.5 rounded-xl bg-dark-900/50 border border-dark-700">
                    <h4 className="font-semibold text-gold-400 mb-1.5 text-xs uppercase tracking-wide">✨ Authentic Heritage</h4>
                    <p className="text-xs text-gray-400 leading-relaxed">Every piece is handmade by generational Indian artisans. Slight variations in weave, shade, and carving are natural signatures of true craftsmanship.</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-dark-900/50 border border-dark-700">
                    <h4 className="font-semibold text-gold-400 mb-1.5 text-xs uppercase tracking-wide">🌿 Direct Fair-Trade</h4>
                    <p className="text-xs text-gray-400 leading-relaxed">Your purchase directly supports rural Indian artisan families, ensuring fair compensation without middleman markups.</p>
                  </div>
                </div>
              </div>
            </AccordionItem>
            <AccordionItem title="Craftsmanship & Process" icon="🛠️">
              <div className="space-y-3">
                <p>This {displayedTitle} is handcrafted using traditional <span className="text-gold-400 font-semibold">{displayedCraftTechnique}</span> techniques practiced in {displayedStateOfOrigin}.</p>
                <ul className="space-y-2 text-xs text-gray-400">
                  {['Hand-processed raw materials sourced ethically and sustainably.',
                    'Intricate manual detailing taking multiple days of skilled artisan labor.',
                    'Free from harmful synthetic dyes and industrial mass-manufacturing shortcuts.',
                    `Primary material: ${displayedMaterial}`
                  ].map(item => (
                    <li key={item} className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">▸</span>{item}</li>
                  ))}
                </ul>
              </div>
            </AccordionItem>
            <AccordionItem title="Care & Maintenance" icon="🌸">
              <div className="space-y-3">
                <p>{displayedCareInstructions}</p>
                <div className="p-3.5 rounded-xl bg-dark-900/50 border border-dark-700 text-xs text-gray-400">
                  💡 <span className="font-semibold text-gray-200">Artisan Tip:</span> Handcrafted items gain deeper natural character over time when stored with love and care.
                </div>
              </div>
            </AccordionItem>
          </div>

          <div className="bg-dark-800/60 border border-dark-700/70 rounded-2xl divide-y divide-dark-700/50 overflow-hidden p-2">
            <AccordionItem title="Dimensions & Specifications" icon="📐" defaultOpen>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Material', value: displayedMaterial },
                  { label: 'Craft Technique', value: displayedCraftTechnique },
                  { label: 'Dimensions', value: product.dimensions || 'Standard Handicraft' },
                  { label: 'Weight', value: product.weight || '500 grams (approx.)' },
                  { label: 'State of Origin', value: displayedStateOfOrigin },
                  { label: 'SKU', value: product.sku || (product.id?.toString().slice(0, 8).toUpperCase()) || '—' },
                ].map(spec => (
                  <div key={spec.label} className="p-3 rounded-xl bg-dark-900/50 border border-dark-700">
                    <span className="text-[10px] text-gray-500 block mb-0.5 uppercase tracking-wide">{spec.label}</span>
                    <span className="text-xs font-semibold text-white">{spec.value}</span>
                  </div>
                ))}
              </div>
            </AccordionItem>
            <AccordionItem title="Shipping & Delivery" icon="🚚">
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/15">
                  <HiTruck className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-white mb-0.5">Free Express Delivery (₹0)</p>
                    <p className="text-xs text-gray-400">Estimated {timeline} across all of India.</p>
                    {product.shipping_info && <p className="text-[11px] text-gray-500 mt-1">{product.shipping_info}</p>}
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-dark-900/50 border border-dark-700">
                  <HiRefresh className="w-5 h-5 text-gold-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-white mb-0.5">7-Day Return Policy</p>
                    <p className="text-xs text-gray-400">{product.return_policy || '7 days hassle-free returns and exchanges.'}</p>
                  </div>
                </div>
              </div>
            </AccordionItem>
            <AccordionItem title="About the Artisan" icon="👨‍🎨">
              <div className="space-y-4">
                <div className="flex gap-4 items-start">
                  <img src={artisanAvatar} alt={artisanName} className="w-16 h-16 rounded-xl object-cover ring-2 ring-gold-500/40 flex-shrink-0" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-white">{artisanName}</h4>
                      <HiBadgeCheck className="text-gold-400 w-4 h-4" />
                    </div>
                    <p className="text-xs text-gold-400 font-medium mt-0.5">
                      {artisanLocation}{displayedStateOfOrigin && displayedStateOfOrigin !== artisanLocation ? `, ${displayedStateOfOrigin}` : ''} · {artisanHeritage}+ Years Heritage
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">{displayedArtisanBio}</p>
                <button type="button" onClick={() => setMessageModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gold-500/10 hover:bg-gold-500/20 border border-gold-500/30 text-gold-400 hover:text-gold-300 font-bold text-xs transition-all cursor-pointer">
                  <HiChatAlt2 className="w-4 h-4" /> Message Artisan Directly
                </button>
              </div>
            </AccordionItem>
          </div>
        </div>
      </div>

      {/* ═══ REVIEWS ═══ */}
      <div ref={reviewsRef} className="max-w-7xl mx-auto px-4 sm:px-6 mt-12 scroll-mt-24">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <span className="text-[10px] font-bold text-gold-500 uppercase tracking-widest block mb-1">Verified Buyers</span>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white">Customer Reviews & Ratings</h2>
            <p className="text-gray-500 text-xs mt-1">Real feedback celebrating Indian artisanal craftsmanship</p>
          </div>
          <button onClick={() => setReviewModalOpen(true)}
            className="btn-outline px-5 py-2.5 text-xs font-semibold self-start sm:self-auto flex items-center gap-1.5 shrink-0">
            <HiPencilAlt className="w-4 h-4" /> Write a Review
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Rating sidebar */}
          <div className="md:col-span-4">
            <div className="p-6 rounded-2xl bg-dark-800/70 border border-dark-700 sticky top-24">
              <div className="text-center mb-5">
                <div className="text-4xl font-bold text-white">{avgRating || '—'}</div>
                {avgRating ? (
                  <div className="flex items-center justify-center mt-2 mb-1">
                    <StarRow rating={avgRating} size="w-5 h-5" />
                  </div>
                ) : (
                  <p className="text-xs text-gold-400 mt-2">No reviews yet</p>
                )}
                <p className="text-xs text-gray-500 mt-1">Based on {totalReviewsCount} customer review{totalReviewsCount !== 1 ? 's' : ''}</p>
              </div>
              <div className="space-y-2">
                {ratingBars.map(b => (
                  <div key={b.stars} className="flex items-center gap-3">
                    <span className="text-[11px] text-gray-400 flex items-center gap-0.5 w-8 shrink-0">
                      {b.stars}<HiStar className="text-gold-400 w-3 h-3" />
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-dark-700 overflow-hidden">
                      <div className="h-full bg-gradient-luxury rounded-full transition-all duration-700" style={{ width: `${b.pct}%` }} />
                    </div>
                    <span className="w-8 text-right text-[11px] text-gray-500">{b.pct}%</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setReviewModalOpen(true)}
                className="w-full mt-5 py-2.5 rounded-xl bg-gold-500/10 hover:bg-gold-500/20 border border-gold-500/30 text-gold-400 hover:text-gold-300 font-semibold text-xs transition-all flex items-center justify-center gap-1.5">
                <HiPencilAlt className="w-3.5 h-3.5" /> Share Your Experience
              </button>
            </div>
          </div>

          {/* Reviews list */}
          <div className="md:col-span-8 space-y-4">
            {productReviews.length > 0 ? (
              productReviews.map((rev, idx) => (
                <div key={rev.id || idx} className="p-5 rounded-2xl bg-dark-800/60 border border-dark-700/80 space-y-3 hover:border-gold-500/20 transition-all">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-luxury flex items-center justify-center text-dark-950 font-black text-sm uppercase flex-shrink-0">
                        {(rev.customer_name || 'C')[0]}
                      </div>
                      <div>
                        <h4 className="font-semibold text-white text-sm">{rev.customer_name || 'Customer'}</h4>
                        {rev.is_verified_buyer ? (
                          <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                            <HiBadgeCheck className="w-3 h-3" /> Verified Buyer
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400 flex items-center gap-1 font-medium">
                            Community Reviewer
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StarRow rating={Math.min(5, Math.max(1, Number(rev.rating) || 5))} size="w-4 h-4" />
                      <span className="text-[10px] text-gray-500">
                        {rev.created_at ? new Date(rev.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-200 leading-relaxed">{rev.review_text}</p>
                </div>
              ))
            ) : (
              <div className="p-10 rounded-2xl bg-dark-800/40 border border-dashed border-dark-700 text-center flex flex-col items-center space-y-3">
                <div className="text-4xl">🌟</div>
                <h4 className="text-sm font-semibold text-white">No reviews yet for this masterpiece</h4>
                <p className="text-xs text-gray-500 max-w-sm">Be the first buyer to review this authentic handicraft and support the artisan!</p>
                <button onClick={() => setReviewModalOpen(true)} className="btn-primary text-xs py-2 px-5 mt-1">
                  ✍️ Write the First Review
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ RELATED PRODUCTS ═══ */}
      {(loadingRelated || relatedProducts.length > 0) && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-16 pb-20">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-px flex-1 bg-dark-700/60" />
            <div className="text-center">
              <span className="text-[10px] font-bold text-gold-500 uppercase tracking-widest block mb-1">More from this Collection</span>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white">You May Also Like</h2>
            </div>
            <div className="h-px flex-1 bg-dark-700/60" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {loadingRelated
              ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
              : relatedProducts.map(p => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    onDismiss={(pid) => {
                      dismissProduct(pid);
                      setRelatedProducts(prev => prev.filter(item => item.id !== pid));
                    }}
                  />
                ))}
          </div>
          {!loadingRelated && relatedProducts.length > 0 && (
            <div className="text-center mt-8">
              <Link to={`/products?category=${encodeURIComponent(product.category)}`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl btn-outline text-sm font-semibold hover:bg-gold-500/10">
                Explore All {product.category} <HiArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      )}

      <ReviewModal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        product={product}
        productName={product.name}
        onReviewSubmitted={handleReviewSubmitted}
      />
      <SendMessageModal
        isOpen={messageModalOpen}
        onClose={() => setMessageModalOpen(false)}
        initialRecipientId={product?.artisan_id || product?.artisan_profiles?.user_id || product?.artisan_profiles?.id}
        initialRecipientName={artisanName}
        initialRecipientRole="artisan"
        productContext={product}
      />
    </div>
  );
}
