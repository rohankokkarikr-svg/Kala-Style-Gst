import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HiX, HiStar, HiShoppingCart, HiHeart, HiCheck, HiShieldCheck, HiArrowRight } from 'react-icons/hi';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import LanguageSelector from './LanguageSelector';
import toast from 'react-hot-toast';

export default function QuickViewModal({ product, isOpen, onClose }) {
  const [selectedImage, setSelectedImage] = useState('');
  const [quantity, setQuantity] = useState(1);
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // AI Language Translation Integration
  const { currentLang, translateProductDetails, currentLangMeta } = useLanguage();
  const [translatedData, setTranslatedData] = useState(null);

  useEffect(() => {
    let isMounted = true;
    if (!product || currentLang === 'en' || !isOpen) {
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
  }, [product, currentLang, isOpen, translateProductDetails]);

  useEffect(() => {
    if (product) {
      setSelectedImage(product.image_url || product.image || (product.images && product.images[0]) || '');
      setQuantity(1);
    }
  }, [product]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !product) return null;

  const discount = product.discount_percentage || (product.original_price
    ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
    : null);

  const imagesList = product.images && product.images.length > 0
    ? product.images
    : [product.image_url || product.image].filter(Boolean);

  const isFavorited = isInWishlist(product.id);

  // Multilingual Display Overrides (powered by Gemini AI)
  const displayedTitle = translatedData?.name || product.name;
  const displayedShortDesc = translatedData?.short_description || product.short_description || product.description;
  const displayedMaterial = translatedData?.material || product.material;
  const displayedCraft = translatedData?.craft_technique || product.craft_technique;
  const displayedOrigin = translatedData?.state_of_origin || product.state_of_origin;

  const handleAddToCart = () => {
    if (!isAuthenticated) {
      toast.error('Please log in to add items to your cart');
      navigate('/login');
      return;
    }
    addToCart(product, 'Standard', quantity);
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-dark-950/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.25 }}
          className="relative bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl z-10 text-white"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-dark-700/80 hover:bg-dark-600 text-gray-300 hover:text-white transition-all z-20"
            aria-label="Close"
          >
            <HiX className="w-5 h-5" />
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 sm:p-8">
            {/* Gallery Section */}
            <div className="space-y-4">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-dark-900 border border-dark-700">
                <img
                  src={selectedImage || 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048652/kalastyle-artisan-marketplace/wesedw9fpem0032yfsmk.jpg'}
                  alt={displayedTitle}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.src = 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048652/kalastyle-artisan-marketplace/wesedw9fpem0032yfsmk.jpg';
                  }}
                />
                {discount && (
                  <span className="absolute top-3 left-3 bg-red-600 text-white font-bold text-xs uppercase px-2.5 py-1 rounded-full shadow-lg">
                    🔥 {discount}% OFF
                  </span>
                )}
                <span className="absolute top-3 right-3 bg-dark-900/90 backdrop-blur-sm text-gold-400 border border-gold-500/40 text-[10px] font-semibold uppercase px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1">
                  🇮🇳 Handmade in India
                </span>
              </div>

              {/* Thumbnails */}
              {imagesList.length > 1 && (
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {imagesList.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImage(img)}
                      className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all ${
                        selectedImage === img ? 'border-gold-500 ring-2 ring-gold-500/30' : 'border-dark-600 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Details Section */}
            <div className="flex flex-col justify-between space-y-4">
              <div>
                {/* Category & Language Switcher */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-gold-400 uppercase tracking-wider">
                    <span>{product.category || 'Handicrafts'}</span>
                    {product.subcategory && (
                      <>
                        <span>•</span>
                        <span className="text-gray-400">{product.subcategory}</span>
                      </>
                    )}
                  </div>
                  <LanguageSelector variant="compact" />
                </div>

                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white leading-snug">
                  {displayedTitle}
                </h2>

                {/* Rating & Reviews */}
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center text-gold-400">
                    {[...Array(5)].map((_, i) => (
                      <HiStar
                        key={i}
                        className={`w-4 h-4 ${
                          i < Math.floor(product.rating || 4.8) ? 'text-gold-400' : 'text-gray-600'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-semibold text-gray-200">
                    {product.rating ? Number(product.rating).toFixed(1) : '4.8'}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({product.review_count || 45} reviews)
                  </span>
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-3 mt-4">
                  <span className="text-2xl sm:text-3xl font-bold gold-text">
                    ₹{Number(product.price).toLocaleString('en-IN')}
                  </span>
                  {product.original_price && product.original_price > product.price && (
                    <span className="text-base sm:text-lg text-gray-500 line-through">
                      ₹{Number(product.original_price).toLocaleString('en-IN')}
                    </span>
                  )}
                  {discount && (
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
                      Save ₹{(product.original_price - product.price).toLocaleString('en-IN')}
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="text-gray-300 text-sm mt-3 leading-relaxed line-clamp-3">
                  {displayedShortDesc}
                </p>

                {/* Key Attributes Specs */}
                <div className="grid grid-cols-2 gap-2 mt-4 text-xs bg-dark-900/60 p-3 rounded-xl border border-dark-700">
                  {displayedMaterial && (
                    <div>
                      <span className="text-gray-500">Material:</span>{' '}
                      <span className="text-gray-200 font-medium">{displayedMaterial}</span>
                    </div>
                  )}
                  {displayedCraft && (
                    <div>
                      <span className="text-gray-500">Craft:</span>{' '}
                      <span className="text-gray-200 font-medium">{displayedCraft}</span>
                    </div>
                  )}
                  {displayedOrigin && (
                    <div>
                      <span className="text-gray-500">Origin:</span>{' '}
                      <span className="text-gray-200 font-medium">{displayedOrigin}</span>
                    </div>
                  )}
                  {(product.artisan_name || product.artisan_profiles?.store_name) && (
                    <div>
                      <span className="text-gray-500">Artisan:</span>{' '}
                      <span className="text-gold-400 font-medium">
                        {product.artisan_name || product.artisan_profiles?.store_name}
                      </span>
                    </div>
                  )}
                </div>

                {/* Stock indicator */}
                <div className="flex items-center gap-2 mt-3 text-xs">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-emerald-400 font-medium">
                    {product.is_in_stock !== false ? 'In Stock — Ready to dispatch' : 'Out of Stock'}
                  </span>
                  {product.stock_quantity && (
                    <span className="text-gray-500">({product.stock_quantity} available)</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3">
                  {/* Quantity selector */}
                  <div className="flex items-center border border-dark-600 rounded-xl bg-dark-900 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="px-3 py-2 text-gray-400 hover:text-white hover:bg-dark-700 transition-colors"
                    >
                      -
                    </button>
                    <span className="px-4 py-2 text-sm font-bold text-white min-w-[2.5rem] text-center">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      className="px-3 py-2 text-gray-400 hover:text-white hover:bg-dark-700 transition-colors"
                    >
                      +
                    </button>
                  </div>

                  {/* Add to Cart */}
                  <button
                    onClick={handleAddToCart}
                    disabled={product.is_in_stock === false}
                    className="btn-gold flex-1 flex items-center justify-center gap-2 py-3 shadow-gold"
                  >
                    <HiShoppingCart className="w-5 h-5" />
                    <span>Add to Cart</span>
                  </button>

                  {/* Wishlist Button */}
                  <button
                    onClick={() => toggleWishlist(product)}
                    className={`p-3 rounded-xl border transition-all ${
                      isFavorited
                        ? 'bg-red-500/20 border-red-500 text-red-400'
                        : 'border-dark-600 bg-dark-900 text-gray-400 hover:text-red-400 hover:border-red-500/50'
                    }`}
                    aria-label="Wishlist"
                  >
                    <HiHeart className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
                  </button>
                </div>

                {/* View Full Product Details Link */}
                <Link
                  to={`/products/${product.id}`}
                  onClick={onClose}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-gold-400 hover:text-gold-300 font-semibold uppercase tracking-wider hover:underline transition-all"
                >
                  <span>View Full Product Details & Artisan Story</span>
                  <HiArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
