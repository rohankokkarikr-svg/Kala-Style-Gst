import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { productAPI, reviewAPI, artisanAPI } from '../services/api';
import ReviewModal from '../components/ReviewModal';
import ProductCard from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/Skeleton';
import toast from 'react-hot-toast';
import { useLanguage } from '../context/LanguageContext';
import LanguageSelector from '../components/LanguageSelector';
import {
  HiShoppingCart,
  HiStar,
  HiTruck,
  HiShieldCheck,
  HiHeart,
  HiChevronRight,
  HiCheckCircle,
  HiBadgeCheck,
  HiPencilAlt,
  HiSparkles,
  HiChatAlt2
} from 'react-icons/hi';
import SendMessageModal from '../components/SendMessageModal';

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { isAuthenticated, isAdmin } = useAuth();
  const { settings } = useSettings();
  const timeline = settings?.shipping_estimated_days || '3 - 5 Business Days';

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState('description');
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [productReviews, setProductReviews] = useState([]);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loadingRelated, setLoadingRelated] = useState(true);

  // AI Language Translation Integration
  const { currentLang, setLanguage, translateProductDetails, currentLangMeta } = useLanguage();
  const [translatedData, setTranslatedData] = useState(null);

  useEffect(() => {
    let isMounted = true;
    if (!product || currentLang === 'en') {
      setTranslatedData(null);
      return;
    }

    translateProductDetails(product, currentLang).then((res) => {
      if (isMounted && res) {
        setTranslatedData(res);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [product, currentLang, translateProductDetails]);

  const fetchProduct = async () => {
    setLoading(true);
    try {
      let found = null;
      // 1. Fetch from Backend API for live DB product and artisan data
      try {
        const { data } = await productAPI.getById(id);
        if (data && (data.id || data.name)) {
          found = data;
        }
      } catch (apiErr) {
        console.warn('Backend product API notice:', apiErr.message);
      }

      if (found) {
        // If product has artisan_id or user_id and artisan_profiles is not attached, try fetching it
        if (!found.artisan_profiles && (found.artisan_id || found.user_id)) {
          try {
            const { data: artData } = await artisanAPI.getById(found.artisan_id || found.user_id);
            if (artData) {
              found.artisan_profiles = artData.profile || artData;
            }
          } catch (e) {
            // Ignore if artisan endpoint unavailable
          }
        }

        setProduct(found);
        const firstImg =
          (found.images && found.images[0]) || found.image_url || found.image || '';
        setSelectedImage(firstImg);
      } else {
        throw new Error('Product not found');
      }
    } catch (err) {
      console.warn('Product load error:', err.message);
      toast.error('Product not found');
      navigate('/products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProduct();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [id, navigate]);

  // Real-time listener: refresh product & artisan details whenever an artisan updates their profile or product
  useEffect(() => {
    const handleArtisanSync = async () => {
      try {
        const { data } = await productAPI.getById(id);
        if (data && (data.id || data.name)) {
          setProduct((prev) => ({
            ...prev,
            ...data,
            artisan_profiles: data.artisan_profiles || prev?.artisan_profiles,
          }));
        }
      } catch (err) {
        // If offline or local product, silently ignore
      }
    };

    window.addEventListener('kala:sync:artisans_updated', handleArtisanSync);
    window.addEventListener('kala:sync:products_updated', handleArtisanSync);

    return () => {
      window.removeEventListener('kala:sync:artisans_updated', handleArtisanSync);
      window.removeEventListener('kala:sync:products_updated', handleArtisanSync);
    };
  }, [id]);

  // Related Products Fetching
  useEffect(() => {
    if (!product) return;

    const fetchRelated = async () => {
      setLoadingRelated(true);
      try {
        const { data } = await productAPI.getAll({ category: product.category });
        if (Array.isArray(data)) {
          setRelatedProducts(data.filter((p) => p.id !== product.id).slice(0, 4));
        } else {
          setRelatedProducts([]);
        }
      } catch (err) {
        setRelatedProducts([]);
      } finally {
        setLoadingRelated(false);
      }
    };

    fetchRelated();

    // Fetch Real Reviews for this specific product
    if (product?.name) {
      reviewAPI
        .getApproved({ product_name: product.name })
        .then((res) => {
          setProductReviews(res.data || []);
        })
        .catch((err) => {
          console.error('Failed to fetch reviews for product:', err);
        });
    }
  }, [product]);

  const totalReviewsCount = productReviews.length;
  const avgRating = totalReviewsCount > 0
    ? (productReviews.reduce((sum, r) => sum + Number(r.rating || 5), 0) / totalReviewsCount).toFixed(1)
    : (product?.rating ? Number(product.rating).toFixed(1) : '5.0');

  const ratingCounts = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    productReviews.forEach(r => {
      const star = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 5)));
      counts[star] = (counts[star] || 0) + 1;
    });
    return counts;
  }, [productReviews]);

  const ratingBars = [5, 4, 3, 2, 1].map(stars => {
    const count = ratingCounts[stars] || 0;
    const pct = totalReviewsCount > 0 ? Math.round((count / totalReviewsCount) * 100) : (stars === 5 ? 100 : 0);
    return { stars, pct, count };
  });

  const handleReviewSubmitted = (newReview) => {
    if (!newReview) return;
    setProductReviews(prev => [newReview, ...prev.filter(r => r.id !== newReview.id)]);
    setActiveTab('reviews');
    setTimeout(() => {
      document.getElementById('product-information-tabs')?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  if (loading || !product) {
    return (
      <div className="min-h-screen bg-dark-900 py-16 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-gold-500/20 border-t-gold-500 rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-sm">Loading handcrafted product details...</p>
        </div>
      </div>
    );
  }

  const discount =
    product.discount_percentage ||
    (product.original_price && product.original_price > product.price
      ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
      : null);

  const imagesList =
    product.images && product.images.length > 0
      ? product.images
      : [product.image_url || product.image].filter(Boolean);

  const isFavorited = isInWishlist(product.id);

  const artisanProfile = product?.artisan_profiles || {};
  const rawArtisanBio = artisanProfile.bio || product?.artisan_bio || '';
  const cleanArtisanBio =
    (rawArtisanBio.split('__UPI_META__:')[0] || '').trim() ||
    'Carrying forward ancestral Indian craft traditions with unwavering dedication to perfection and authentic handmade heritage.';
  const artisanName = artisanProfile.store_name || product?.artisan_name || 'Independent Artisan';
  const artisanAvatar =
    artisanProfile.profile_image ||
    product?.artisan_avatar ||
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop';
  const artisanLocation = artisanProfile.location || product?.artisan_location || 'Varanasi';
  const artisanHeritage = artisanProfile.years_of_experience || product?.years_of_experience || 20;

  // Multilingual Display Overrides (powered by Gemini AI)
  const displayedTitle = translatedData?.name || product.name;
  const displayedDescription = translatedData?.description || product.description || product.short_description || '';
  const displayedShortDescription = translatedData?.short_description || product.short_description || product.description || '';
  const displayedMaterial = translatedData?.material || product.material || 'Authentic Handcrafted';
  const displayedCraftTechnique = translatedData?.craft_technique || product.craft_technique || 'Traditional Indian Handicrafts';
  const displayedArtisanBio = translatedData?.artisan_bio || cleanArtisanBio;
  const displayedCareInstructions = translatedData?.care_instructions || product.care_instructions || 'Store in dry place. Wipe gently with dry cloth. Avoid exposure to harsh chemicals.';
  const displayedStateOfOrigin = translatedData?.state_of_origin || product.state_of_origin || 'India';

  const handleAddToCart = () => {
    if (!isAuthenticated) {
      toast.error('Please log in to add items to your cart');
      navigate('/login');
      return;
    }
    const defaultSize = product.sizes?.[0] || 'Standard';
    addToCart(product, defaultSize, quantity);
  };

  const tabs = [
    { id: 'description', label: 'Description' },
    { id: 'reviews', label: `Customer Reviews (${totalReviewsCount})` },
    { id: 'craftsmanship', label: 'Craftsmanship & Process' },
    { id: 'artisan', label: 'About the Artisan' },
    { id: 'dimensions', label: 'Dimensions & Specs' },
    { id: 'care', label: 'Care Instructions' },
    { id: 'shipping', label: 'Shipping & Returns' },
  ];

  return (
    <div className="min-h-screen bg-dark-900 pb-20">
      {/* Breadcrumb Header */}
      <div className="bg-dark-950/60 border-b border-dark-700/60 py-3.5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex items-center gap-2 text-xs text-gray-400">
            <Link to="/" className="hover:text-gold-400 transition-colors">Home</Link>
            <HiChevronRight className="w-3.5 h-3.5 text-gray-600" />
            <Link to="/products" className="hover:text-gold-400 transition-colors">Handicrafts</Link>
            <HiChevronRight className="w-3.5 h-3.5 text-gray-600" />
            <Link
              to={`/products?category=${encodeURIComponent(product.category || 'all')}`}
              className="hover:text-gold-400 transition-colors"
            >
              {product.category}
            </Link>
            <HiChevronRight className="w-3.5 h-3.5 text-gray-600" />
            <span className="text-gray-200 truncate max-w-[200px]">{displayedTitle}</span>
          </nav>
        </div>
      </div>

      {/* Admin Floating / Prominent Action Bar */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-gold-500/25 via-dark-800 to-dark-900 border-b border-gold-500/40 py-3.5 px-4 sm:px-6 shadow-xl sticky top-16 z-30 backdrop-blur-md">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="px-2 py-0.5 rounded bg-gold-500 text-dark-950 font-black text-[11px] tracking-wider uppercase">👑 ADMIN MODE</span>
              <p className="text-xs text-white font-medium">
                You have administrative access to edit this product's price, stock, imagery, or description.
              </p>
            </div>
            <Link
              to={`/admin/products?edit=${product.id}`}
              className="btn-primary text-xs py-1.5 px-4 font-bold flex items-center gap-2 shadow-lg shadow-gold-500/20 shrink-0"
            >
              <HiPencilAlt className="w-4 h-4" /> Edit Product in Admin Panel
            </Link>
          </div>
        </div>
      )}

      {/* Main Product Showcase Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Left: Gallery (5 cols) */}
          <div className="lg:col-span-6 space-y-4">
            {/* Big Main Image Container */}
            <div className="relative aspect-square rounded-3xl overflow-hidden bg-dark-800 border border-dark-700 shadow-2xl group">
              <img
                src={selectedImage || imagesList[0]}
                alt={product.name}
                className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                onError={(e) => {
                  e.target.src = 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048652/kalastyle-artisan-marketplace/wesedw9fpem0032yfsmk.jpg';
                }}
              />

              {/* Floating Badges */}
              <div className="absolute top-4 left-4 flex flex-col gap-2 z-10 pointer-events-none">
                {discount && (
                  <span className="bg-red-600 text-white font-bold text-xs uppercase px-3 py-1 rounded-full shadow-lg">
                    🔥 {discount}% OFF
                  </span>
                )}
                <span className="bg-dark-900/90 backdrop-blur-md text-gold-400 border border-gold-500/40 text-[11px] font-semibold uppercase px-3 py-1 rounded-full shadow-lg flex items-center gap-1.5">
                  <span>🇮🇳</span>
                  <span>Handmade in India</span>
                </span>
              </div>

              {/* Wishlist Button in Image */}
              <button
                onClick={() => toggleWishlist(product)}
                className={`absolute top-4 right-4 p-3 rounded-full backdrop-blur-md shadow-xl transition-all z-10 ${
                  isFavorited
                    ? 'bg-red-500 text-white'
                    : 'bg-dark-900/80 text-gray-300 hover:text-red-400 hover:bg-dark-900'
                }`}
                aria-label="Wishlist"
              >
                <HiHeart className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
              </button>
            </div>

            {/* Thumbnails Row */}
            {imagesList.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {imagesList.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImage(img)}
                    className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 flex-shrink-0 transition-all ${
                      selectedImage === img
                        ? 'border-gold-500 ring-2 ring-gold-500/40 scale-95'
                        : 'border-dark-700 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt={`Angle ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Authenticity Guarantee Icons */}
            <div className="grid grid-cols-3 gap-3 pt-4 text-center">
              <div className="p-3.5 rounded-2xl bg-dark-800/80 border border-dark-700">
                <span className="text-2xl block mb-1">✋</span>
                <span className="text-xs font-semibold text-white block">100% Handmade</span>
                <span className="text-[10px] text-gray-400">Pure Artisan Craft</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-dark-800/80 border border-dark-700">
                <span className="text-2xl block mb-1">🌿</span>
                <span className="text-xs font-semibold text-white block">Eco-Friendly</span>
                <span className="text-[10px] text-gray-400">Natural Materials</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-dark-800/80 border border-dark-700">
                <span className="text-2xl block mb-1">🏆</span>
                <span className="text-xs font-semibold text-white block">Heritage GI Tag</span>
                <span className="text-[10px] text-gray-400">Direct From Origins</span>
              </div>
            </div>
          </div>

          {/* Right: Info & Purchase (7 cols) */}
          <div className="lg:col-span-6 space-y-6">
            {/* AI Regional Language Translator */}
            <LanguageSelector variant="banner" />

            {translatedData && (
              <div className="flex items-center justify-between gap-2 p-3 px-4 rounded-2xl bg-gradient-to-r from-gold-500/15 via-gold-500/10 to-transparent border border-gold-500/40 text-xs text-gold-400 shadow-lg">
                <div className="flex items-center gap-2 font-medium">
                  <HiSparkles className="w-4 h-4 text-gold-400 shrink-0 animate-spin" />
                  <span>
                    Product details translated to <strong className="text-white font-bold">{currentLangMeta.native}</strong> via Gemini AI
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className="px-2.5 py-1 rounded-lg bg-dark-900/80 hover:bg-dark-700 text-[11px] font-bold text-gray-200 hover:text-white border border-dark-600 transition-colors cursor-pointer"
                >
                  Show Original (English)
                </button>
              </div>
            )}

            <div>
              {/* Category & State */}
              <div className="flex items-center justify-between text-xs font-semibold text-gold-400 uppercase tracking-wider mb-2">
                <Link
                  to={`/products?category=${encodeURIComponent(product.category)}`}
                  className="hover:underline"
                >
                  {product.category} {product.subcategory && `• ${product.subcategory}`}
                </Link>
                {displayedStateOfOrigin && (
                  <span className="text-gray-400 text-xs font-normal">
                    📍 {displayedStateOfOrigin}, India
                  </span>
                )}
              </div>

              {/* Title & Admin Edit Action */}
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-white leading-tight">
                  {displayedTitle}
                </h1>
                {isAdmin && (
                  <Link
                    to={`/admin/products?edit=${product.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-500/15 hover:bg-gold-500/25 border border-gold-500/40 text-gold-400 hover:text-gold-300 text-xs font-bold shrink-0 shadow-sm transition-all"
                    title="Edit in Admin Panel"
                  >
                    <HiPencilAlt className="w-3.5 h-3.5" /> Edit
                  </Link>
                )}
              </div>

              {/* Rating & Reviews Summary */}
              <div className="flex items-center gap-3 mt-3">
                <div className="flex items-center text-gold-400 gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <HiStar
                      key={i}
                      className={`w-4 h-4 ${
                        i < Math.floor(Number(avgRating)) ? 'text-gold-400' : 'text-gray-600'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm font-bold text-white">
                  {avgRating}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('reviews');
                    document.getElementById('product-information-tabs')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="text-xs text-gold-400 hover:text-gold-300 underline cursor-pointer"
                >
                  ({totalReviewsCount} Customer Review{totalReviewsCount === 1 ? '' : 's'})
                </button>
                <span className="text-gray-600">•</span>
                <span className="text-xs text-emerald-400 font-medium">100% Authentic Handcraft</span>
              </div>

              {/* Price Box */}
              <div className="mt-6 p-4 rounded-2xl bg-dark-800/90 border border-dark-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider block mb-1">
                    Direct Artisan Price
                  </span>
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl sm:text-4xl font-bold gold-text">
                      ₹{Number(product.price).toLocaleString('en-IN')}
                    </span>
                    {product.original_price && product.original_price > product.price && (
                      <span className="text-lg text-gray-500 line-through">
                        ₹{Number(product.original_price).toLocaleString('en-IN')}
                      </span>
                    )}
                    {discount && (
                      <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 rounded">
                        Save ₹{(product.original_price - product.price).toLocaleString('en-IN')} ({discount}%)
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    Inclusive of all taxes • <span className="text-emerald-400 font-medium">✓ Free Express Delivery (₹0)</span>
                  </span>
                </div>

                {/* Stock Status Badge */}
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-semibold text-emerald-400">
                    {product.is_in_stock !== false ? 'In Stock (Ready to Dispatch)' : 'Sold Out'}
                  </span>
                </div>
              </div>

              {/* Short Summary Description */}
              <p className="text-gray-300 text-sm leading-relaxed mt-4">
                {displayedShortDescription}
              </p>

              {/* Specifications Snapshot */}
              <div className="grid grid-cols-2 gap-3 mt-6 p-4 rounded-2xl bg-dark-800/50 border border-dark-700/80 text-xs">
                {displayedMaterial && (
                  <div>
                    <span className="text-gray-400 block mb-0.5">Material</span>
                    <span className="font-semibold text-white">{displayedMaterial}</span>
                  </div>
                )}
                {displayedCraftTechnique && (
                  <div>
                    <span className="text-gray-400 block mb-0.5">Craft Technique</span>
                    <span className="font-semibold text-white">{displayedCraftTechnique}</span>
                  </div>
                )}
                {product.dimensions && (
                  <div>
                    <span className="text-gray-400 block mb-0.5">Dimensions</span>
                    <span className="font-semibold text-white">{product.dimensions}</span>
                  </div>
                )}
                {product.weight && (
                  <div>
                    <span className="text-gray-400 block mb-0.5">Item Weight</span>
                    <span className="font-semibold text-white">{product.weight}</span>
                  </div>
                )}
              </div>

              {/* Purchase Actions */}
              <div className="space-y-4 pt-6">
                <div className="flex items-center gap-4">
                  {/* Quantity */}
                  <div className="flex items-center border border-dark-600 rounded-2xl bg-dark-800 overflow-hidden shadow-inner">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="px-4 py-3 text-gray-400 hover:text-white hover:bg-dark-700 transition-colors font-bold text-base"
                    >
                      -
                    </button>
                    <span className="px-5 py-3 text-base font-bold text-white min-w-[3rem] text-center">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      className="px-4 py-3 text-gray-400 hover:text-white hover:bg-dark-700 transition-colors font-bold text-base"
                    >
                      +
                    </button>
                  </div>

                  {/* Add to Cart */}
                  <button
                    onClick={handleAddToCart}
                    disabled={product.is_in_stock === false}
                    className="btn-gold flex-1 py-3.5 rounded-2xl flex items-center justify-center gap-2.5 text-base font-bold shadow-gold hover:shadow-gold/40"
                  >
                    <HiShoppingCart className="w-5 h-5" />
                    <span>Add to Cart • ₹{(product.price * quantity).toLocaleString('en-IN')}</span>
                  </button>
                </div>

                {/* Shipping info small bar */}
                <div className="flex flex-wrap items-center justify-between text-xs text-gray-400 px-2 gap-2">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                    <HiTruck className="text-emerald-400 w-4 h-4" /> 
                    Free Express Delivery (₹0) • {timeline}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <HiShieldCheck className="text-gold-400 w-4 h-4" /> 7 Days Return Policy
                  </span>
                </div>
              </div>

              {/* Meet the Artisan Card */}
              {(artisanName || cleanArtisanBio || product.artisan_profiles) && (
                <div className="mt-8 p-5 rounded-2xl bg-gradient-to-br from-dark-800 to-dark-850 border border-gold-500/30 relative overflow-hidden shadow-xl">
                  <div className="flex items-start gap-4">
                    <img
                      src={artisanAvatar}
                      alt={artisanName}
                      className="w-16 h-16 rounded-full object-cover ring-2 ring-gold-500/60 flex-shrink-0"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-gold-400 uppercase tracking-wider">
                          👨‍🎨 Meet the Artisan
                        </span>
                        <HiBadgeCheck className="text-gold-400 w-4 h-4" />
                      </div>
                      <h3 className="text-lg font-serif font-bold text-white mt-0.5">
                        {artisanName}
                      </h3>
                      <div className="flex flex-wrap gap-y-1 gap-x-3 text-xs text-gray-400 mt-1">
                        <span>
                          📍 Based in {artisanLocation}
                          {displayedStateOfOrigin && displayedStateOfOrigin !== artisanLocation
                            ? `, ${displayedStateOfOrigin}`
                            : ''}
                        </span>
                        {artisanHeritage && (
                          <span>• 🛠️ {artisanHeritage}+ Years Experience</span>
                        )}
                      </div>
                      <p className="text-gray-300 text-xs mt-2.5 italic leading-relaxed">
                        "{displayedArtisanBio}"
                      </p>
                      <button
                        type="button"
                        onClick={() => setMessageModalOpen(true)}
                        className="mt-3.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gold-500/15 hover:bg-gold-500/25 border border-gold-500/40 text-gold-400 hover:text-gold-300 font-bold text-xs shadow-gold shadow-gold/5 transition-all cursor-pointer"
                      >
                        <HiChatAlt2 className="w-4 h-4" />
                        <span>Message Artisan Directly</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Product Information Tabs */}
        <div id="product-information-tabs" className="mt-16 bg-dark-800 rounded-3xl border border-dark-700 overflow-hidden shadow-xl scroll-mt-24">
          {/* Tab Headers */}
          <div className="flex overflow-x-auto border-b border-dark-700 bg-dark-850/70 p-2 gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 rounded-2xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-gold-500 text-dark-900 shadow-md font-bold'
                    : 'text-gray-400 hover:text-white hover:bg-dark-700/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6 sm:p-8 text-sm text-gray-300 leading-relaxed">
            {activeTab === 'description' && (
              <div className="space-y-4">
                <h3 className="text-xl font-serif font-bold text-white">Product Overview</h3>
                <p>{displayedDescription}</p>
                <div className="pt-4 border-t border-dark-700/80 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700">
                    <h4 className="font-semibold text-gold-400 mb-2">✨ Authentic Heritage</h4>
                    <p className="text-xs text-gray-400">
                      Every piece is handmade by generational Indian artisans, meaning slight variations in weave, shade, and carving are natural signatures of true craftsmanship.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700">
                    <h4 className="font-semibold text-gold-400 mb-2">🌿 Direct Fair-Trade</h4>
                    <p className="text-xs text-gray-400">
                      Your purchase directly supports rural Indian artisan families and ensures fair, transparent compensation without middleman markups.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'reviews' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-dark-700">
                  <div>
                    <h3 className="text-xl font-serif font-bold text-white">Customer Reviews & Ratings</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Genuine ratings & verified feedback for {displayedTitle}
                    </p>
                  </div>
                  <button
                    onClick={() => setReviewModalOpen(true)}
                    className="btn-primary text-xs py-2 px-4 self-start sm:self-auto flex items-center gap-1.5"
                  >
                    <span>✍️</span>
                    <span>Write a Review</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  {/* Rating Breakdown */}
                  <div className="md:col-span-4 p-5 rounded-2xl bg-dark-900/60 border border-dark-700 text-center flex flex-col justify-center">
                    <div className="text-4xl font-bold text-white mb-1">{avgRating}</div>
                    <div className="flex items-center justify-center text-gold-400 gap-1 mb-1">
                      {[...Array(5)].map((_, i) => (
                        <HiStar
                          key={i}
                          className={`w-4 h-4 ${i < Math.floor(Number(avgRating)) ? 'text-gold-400' : 'text-gray-600'}`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-gray-400">
                      Based on {totalReviewsCount} verified review{totalReviewsCount === 1 ? '' : 's'}
                    </p>
                  </div>

                  {/* Reviews List */}
                  <div className="md:col-span-8 space-y-3">
                    {productReviews.length > 0 ? (
                      productReviews.map((rev, idx) => (
                        <div key={rev.id || idx} className="p-4 rounded-xl bg-dark-900/60 border border-dark-700 space-y-2 hover:border-gold-500/30 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gold-500/20 text-gold-400 font-bold text-xs flex items-center justify-center border border-gold-500/30 uppercase">
                                {(rev.customer_name || 'C')[0]}
                              </div>
                              <div>
                                <h4 className="font-semibold text-white text-xs">{rev.customer_name || 'Verified Customer'}</h4>
                                <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                                  <HiCheckCircle className="w-3 h-3" /> Verified Buyer
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5 text-gold-400">
                              {[...Array(Math.min(5, Math.max(1, Number(rev.rating) || 5)))].map((_, i) => (
                                <HiStar key={i} className="w-3.5 h-3.5 text-gold-400" />
                              ))}
                            </div>
                          </div>
                          <p className="text-xs text-gray-200 leading-relaxed">{rev.review_text}</p>
                          <span className="text-[10px] text-gray-500 block">
                            {rev.created_at ? new Date(rev.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Verified Review'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-6 rounded-xl bg-dark-900/40 border border-dashed border-dark-700 text-center space-y-2">
                        <p className="text-sm font-semibold text-white">No reviews yet for this product</p>
                        <p className="text-xs text-gray-400">Be the first to share your experience!</p>
                        <button
                          onClick={() => setReviewModalOpen(true)}
                          className="btn-primary text-xs py-1.5 px-3 mt-2"
                        >
                          ✍️ Write the First Review
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'craftsmanship' && (
              <div className="space-y-4">
                <h3 className="text-xl font-serif font-bold text-white">Craftsmanship & Process</h3>
                <p>
                  This {displayedTitle} is handcrafted using traditional <span className="text-gold-400 font-semibold">{displayedCraftTechnique}</span> techniques practiced in {displayedStateOfOrigin}.
                </p>
                <ul className="space-y-2 list-disc pl-5 text-gray-300 text-xs sm:text-sm">
                  <li>Hand-processed raw materials sourced ethically and sustainably.</li>
                  <li>Intricate manual detailing taking multiple days of skilled artisan labor.</li>
                  <li>Free from harmful synthetic toxic dyes and industrial mass-manufacturing shortcuts.</li>
                </ul>
              </div>
            )}

            {activeTab === 'artisan' && (
              <div className="space-y-4">
                <h3 className="text-xl font-serif font-bold text-white">About the Artisan</h3>
                <div className="flex flex-col sm:flex-row items-start gap-6">
                  <img
                    src={artisanAvatar}
                    alt={artisanName}
                    className="w-24 h-24 rounded-2xl object-cover ring-2 ring-gold-500/50 shadow-lg"
                  />
                  <div className="space-y-2">
                    <h4 className="text-lg font-bold text-white">{artisanName}</h4>
                    <p className="text-xs text-gold-400 font-medium">
                      Based in {artisanLocation}{displayedStateOfOrigin && displayedStateOfOrigin !== artisanLocation ? `, ${displayedStateOfOrigin}` : ''} • {artisanHeritage}+ Years of Heritage
                    </p>
                    <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
                      {displayedArtisanBio}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'dimensions' && (
              <div className="space-y-4">
                <h3 className="text-xl font-serif font-bold text-white">Dimensions & Materials</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
                  <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700">
                    <span className="text-gray-500 block">Material</span>
                    <span className="font-semibold text-white">{displayedMaterial}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700">
                    <span className="text-gray-500 block">Dimensions</span>
                    <span className="font-semibold text-white">{product.dimensions || 'Standard Handicraft Dimensions'}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700">
                    <span className="text-gray-500 block">Weight</span>
                    <span className="font-semibold text-white">{product.weight || '500 grams'}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700">
                    <span className="text-gray-500 block">Origin State</span>
                    <span className="font-semibold text-white">{displayedStateOfOrigin}</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'care' && (
              <div className="space-y-4">
                <h3 className="text-xl font-serif font-bold text-white">Care & Maintenance</h3>
                <p>{displayedCareInstructions}</p>
                <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700 text-xs text-gray-400">
                  💡 <span className="font-semibold text-gray-200">Artisan Tip:</span> Handcrafted items gain deeper natural character over time when stored with love and care.
                </div>
              </div>
            )}

            {activeTab === 'shipping' && (
              <div className="space-y-4">
                <h3 className="text-xl font-serif font-bold text-white">Shipping & Returns</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700 space-y-1.5">
                    <h4 className="font-semibold text-gold-400 mb-1 flex items-center gap-1.5">
                      <HiTruck className="w-4 h-4" /> Shipping Information
                    </h4>
                    <p className="text-xs text-gray-300">
                      Standard Delivery: <strong className="text-emerald-400">FREE (₹0)</strong> across India ({timeline}).
                    </p>
                    <p className="text-xs text-emerald-400 font-semibold">
                      ✓ 100% Free Express Delivery on all orders!
                    </p>
                    {product.shipping_info && (
                      <p className="text-[11px] text-gray-400 pt-1">{product.shipping_info}</p>
                    )}
                  </div>
                  <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700">
                    <h4 className="font-semibold text-gold-400 mb-1">🔄 Return Policy</h4>
                    <p className="text-xs text-gray-300">{product.return_policy || '7 days hassle-free returns and exchanges.'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Customer Reviews & Rating Breakdown */}
        <div id="customer-reviews-section" className="mt-16 bg-dark-800 rounded-3xl border border-dark-700 p-6 sm:p-10 shadow-xl scroll-mt-24">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-8 border-b border-dark-700">
            <div>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white">Customer Reviews & Ratings</h2>
              <p className="text-gray-400 text-xs sm:text-sm mt-1">
                Real feedback from verified buyers celebrating Indian artisanal handicrafts
              </p>
            </div>
            <button
              onClick={() => setReviewModalOpen(true)}
              className="btn-outline px-6 py-2.5 text-xs font-semibold self-start md:self-auto hover:bg-gold-500/10 hover:text-gold-400 hover:border-gold-500/50 flex items-center gap-1.5"
            >
              <span>✍️</span>
              <span>Write a Review</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mt-8">
            {/* Rating Breakdown Bars (4 cols) */}
            <div className="md:col-span-4 p-6 rounded-2xl bg-dark-900/60 border border-dark-700 text-center md:text-left flex flex-col justify-center">
              <div className="text-4xl sm:text-5xl font-bold text-white mb-2">
                {avgRating}
              </div>
              <div className="flex items-center justify-center md:justify-start text-gold-400 gap-1 mb-1">
                {[...Array(5)].map((_, i) => (
                  <HiStar
                    key={i}
                    className={`w-5 h-5 ${i < Math.floor(Number(avgRating)) ? 'text-gold-400' : 'text-gray-600'}`}
                  />
                ))}
              </div>
              <p className="text-xs text-gray-400 mb-6">
                Based on {totalReviewsCount} verified customer rating{totalReviewsCount === 1 ? '' : 's'}
              </p>

              {/* Bar Distributions */}
              <div className="space-y-2 text-xs">
                {ratingBars.map((b) => (
                  <div key={b.stars} className="flex items-center gap-3">
                    <span className="w-12 text-gray-400 flex items-center gap-0.5">
                      {b.stars} <HiStar className="text-gold-400 w-3 h-3" />
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-dark-700 overflow-hidden">
                      <div
                        className="h-full bg-gold-500 rounded-full transition-all duration-500"
                        style={{ width: `${b.pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-gray-400">{b.pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Real Reviews List (8 cols) */}
            <div className="md:col-span-8 space-y-4">
              {productReviews.length > 0 ? (
                productReviews.map((rev, idx) => (
                  <div key={rev.id || idx} className="p-5 rounded-2xl bg-dark-900/50 border border-dark-700 space-y-2 hover:border-gold-500/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gold-500/20 text-gold-400 font-bold text-xs flex items-center justify-center border border-gold-500/30 uppercase">
                          {(rev.customer_name || 'C')[0]}
                        </div>
                        <div>
                          <h4 className="font-semibold text-white text-xs sm:text-sm">{rev.customer_name || 'Verified Customer'}</h4>
                          <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                            <HiCheckCircle className="w-3 h-3" /> Verified Buyer
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 text-gold-400">
                        {[...Array(Math.min(5, Math.max(1, Number(rev.rating) || 5)))].map((_, i) => (
                          <HiStar key={i} className="w-3.5 h-3.5 text-gold-400" />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-200 leading-relaxed pt-1">{rev.review_text}</p>
                    <span className="text-[10px] text-gray-500 block pt-1">
                      {rev.created_at ? new Date(rev.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Verified Review'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-8 rounded-2xl bg-dark-900/40 border border-dashed border-dark-700 text-center flex flex-col items-center justify-center space-y-3 py-10">
                  <div className="text-4xl">🌟</div>
                  <h4 className="text-sm font-semibold text-white">No reviews yet for this masterpiece</h4>
                  <p className="text-xs text-gray-400 max-w-md">
                    Be the first buyer to review this authentic handicraft and support the artisan!
                  </p>
                  <button
                    onClick={() => setReviewModalOpen(true)}
                    className="btn-primary text-xs py-2 px-4 mt-2"
                  >
                    ✍️ Write the First Review
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* You May Also Like / Related Products */}
        {relatedProducts.length > 0 && (
          <div className="mt-20">
            <div className="flex items-end justify-between mb-8">
              <div>
                <span className="text-xs font-semibold text-gold-400 uppercase tracking-widest block mb-1">
                  Handcrafted Recommendations
                </span>
                <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white">
                  You May Also Like
                </h2>
              </div>
              <Link
                to={`/products?category=${encodeURIComponent(product.category)}`}
                className="text-xs font-semibold text-gold-400 hover:text-gold-300 flex items-center gap-1"
              >
                <span>View More in {product.category}</span>
                <HiChevronRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {loadingRelated
                ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
                : relatedProducts.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        )}
      </div>

      {/* Write a Review Modal */}
      <ReviewModal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        product={product}
        productName={product.name}
        onReviewSubmitted={handleReviewSubmitted}
      />

      {/* Message Artisan Modal */}
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
