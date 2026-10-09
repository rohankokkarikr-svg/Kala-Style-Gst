import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { HiShoppingCart, HiStar, HiHeart, HiEye, HiX, HiSparkles } from 'react-icons/hi';
import QuickViewModal from './QuickViewModal';
import { useLanguage } from '../context/LanguageContext';
import toast from 'react-hot-toast';

export default function ProductCard({ product, onDismiss }) {
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { isAuthenticated } = useAuth();
  const { currentLang, getCachedTranslation } = useLanguage();
  const navigate = useNavigate();
  const [quickViewOpen, setQuickViewOpen] = useState(false);

  if (!product) return null;

  const {
    id,
    name,
    price,
    original_price,
    rating,
    review_count,
    category,
    image_url,
    image,
    short_description,
    description,
    is_in_stock,
    stock_quantity,
    discount_percentage,
    state_of_origin,
    recommendationReason,
  } = product;

  const mainImage = image_url || image || (product.images && product.images[0]) || '';

  const discount = discount_percentage || (original_price && original_price > price
    ? Math.round(((original_price - price) / original_price) * 100)
    : null);

  const isFavorited = isInWishlist(id);
  const isOutOfStock = is_in_stock === false || (stock_quantity != null && Number(stock_quantity) <= 0);

  // Regional Translation Support
  const cachedTranslation = getCachedTranslation ? getCachedTranslation(id, currentLang) : null;
  const displayName = cachedTranslation?.name || name;
  const displayDesc = cachedTranslation?.short_description || cachedTranslation?.description || short_description || description || 'Authentic handcrafted product made by Indian artisans.';
  const displayOrigin = cachedTranslation?.state_of_origin || state_of_origin;

  const handleQuickAdd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.error('Please log in to add items to your cart');
      navigate('/login');
      return;
    }
    const defaultSize = product.sizes?.[0] || 'Standard';
    addToCart(product, defaultSize, 1);
  };

  const handleWishlistToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist(product);
  };

  const handleOpenQuickView = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setQuickViewOpen(true);
  };

  return (
    <>
      <div className="group bg-dark-800 rounded-2xl overflow-hidden border border-dark-600 hover:border-gold-500/50 transition-all duration-300 hover:shadow-gold hover:shadow-gold/15 flex flex-col justify-between relative">
        {/* Media Container with Separated, Accessible Controls */}
        <div className="relative aspect-[4/5] overflow-hidden bg-dark-700">
          <Link to={`/products/${id}`} className="block w-full h-full" aria-label={`View details for ${displayName}`}>
            <img
              src={mainImage || 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048652/kalastyle-artisan-marketplace/wesedw9fpem0032yfsmk.jpg'}
              alt={displayName}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              onError={(e) => {
                e.target.src = 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048652/kalastyle-artisan-marketplace/wesedw9fpem0032yfsmk.jpg';
              }}
            />
            {/* Gradient Overlay on Hover */}
            <div className="absolute inset-0 bg-gradient-to-t from-dark-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          </Link>

          {/* Top Badges (Left) */}
          <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
            {discount ? (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-red-600 text-white rounded-md shadow-md">
                🔥 {discount}% OFF
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-dark-900/90 backdrop-blur-sm text-gold-400 border border-gold-500/30 rounded-md">
                🇮🇳 Handmade
              </span>
            )}
          </div>

          {/* Top Right Actions: Dismiss (if personalized) & Wishlist */}
          <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
            {onDismiss && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDismiss(id);
                }}
                className="p-1.5 rounded-full backdrop-blur-md bg-dark-900/80 text-gray-400 hover:text-red-400 hover:bg-dark-900 transition-all shadow-md cursor-pointer focus:outline-none focus:ring-1 focus:ring-red-400"
                title="Not interested (hide from recommendations)"
                aria-label="Dismiss recommendation"
              >
                <HiX className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={handleWishlistToggle}
              className={`p-2 rounded-full backdrop-blur-md transition-all shadow-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-gold-400 ${
                isFavorited
                  ? 'bg-red-500 text-white'
                  : 'bg-dark-900/80 text-gray-300 hover:text-red-400 hover:bg-dark-900'
              }`}
              aria-label={isFavorited ? `Remove ${displayName} from Wishlist` : `Add ${displayName} to Wishlist`}
            >
              <HiHeart className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
            </button>
          </div>

          {/* Quick View Button (Center - Accessible on hover & keyboard focus) */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto">
            <button
              type="button"
              onClick={handleOpenQuickView}
              className="bg-dark-900/90 hover:bg-gold-500 text-white hover:text-dark-900 font-semibold px-4 py-2 rounded-full text-xs flex items-center gap-1.5 shadow-xl border border-dark-600 hover:border-gold-400 opacity-0 group-hover:opacity-100 focus:opacity-100 scale-90 group-hover:scale-100 focus:scale-100 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-gold-400 cursor-pointer pointer-events-auto"
              aria-label={`Quick view ${displayName}`}
            >
              <HiEye className="w-4 h-4" />
              <span>Quick View</span>
            </button>
          </div>

          {/* Out of Stock Overlay */}
          {isOutOfStock && (
            <span className="absolute bottom-3 left-3 right-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-red-600/90 text-white text-center rounded-lg shadow-lg z-10 pointer-events-none">
              Out of Stock
            </span>
          )}
        </div>

        {/* Product Details */}
        <div className="p-4 flex-1 flex flex-col justify-between">
          <div>
            {/* Transparent Recommendation Reason Badge */}
            {recommendationReason && (
              <div
                className="flex items-center gap-1 text-[10.5px] font-medium text-gold-400 bg-gold-500/10 px-2 py-0.5 rounded border border-gold-500/20 mb-2 truncate"
                title={recommendationReason}
              >
                <HiSparkles className="w-3 h-3 text-gold-400 shrink-0" />
                <span className="truncate">{recommendationReason}</span>
              </div>
            )}

            {/* Category & Origin */}
            <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
              <span className="text-gold-400/90 font-medium truncate max-w-[65%]">
                {category || 'Indian Handicrafts'}
              </span>
              {state_of_origin && (
                <span className="text-gray-500 text-[10px] truncate">
                  📍 {state_of_origin}
                </span>
              )}
            </div>

            {/* Product Title */}
            <Link to={`/products/${id}`} aria-label={displayName}>
              <h3 className="font-medium text-sm text-gray-100 group-hover:text-gold-400 transition-colors line-clamp-1 font-serif">
                {displayName}
              </h3>
            </Link>

            {/* Short Description */}
            <p className="text-gray-400 text-xs mt-1 line-clamp-1">
              {displayDesc}
            </p>

            {/* Rating Stars (strictly reflect real data without fabricating ratings) */}
            {review_count > 0 && rating ? (
              <div className="flex items-center gap-1.5 mt-2" aria-label={`Rated ${rating} out of 5 stars based on ${review_count} reviews`}>
                <div className="flex items-center text-gold-400">
                  {[...Array(5)].map((_, i) => (
                    <HiStar
                      key={i}
                      className={`w-3.5 h-3.5 ${
                        i < Math.floor(Number(rating)) ? 'text-gold-400' : 'text-gray-600'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs font-semibold text-gray-300">
                  {Number(rating).toFixed(1)}
                </span>
                <span className="text-[11px] text-gray-500">
                  ({review_count})
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1 mt-2 text-[11px] text-gray-400">
                <span className="text-gold-500/80">✦</span>
                <span>Authentic Handicraft</span>
              </div>
            )}
          </div>

          {/* Pricing & Add to Cart Footer */}
          <div className="mt-4 pt-3 border-t border-dark-700/80 flex items-center justify-between">
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-bold text-white font-sans">
                  ₹{Number(price).toLocaleString('en-IN')}
                </span>
                {original_price && original_price > price && (
                  <span className="text-xs text-gray-500 line-through">
                    ₹{Number(original_price).toLocaleString('en-IN')}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-emerald-400 font-medium">
                Free Delivery
              </span>
            </div>

            {/* Quick Add to Cart Button */}
            <button
              onClick={handleQuickAdd}
              disabled={isOutOfStock}
              className={`p-2.5 rounded-xl border transition-all duration-200 shadow-sm ${
                isOutOfStock
                  ? 'bg-dark-800 text-gray-600 border-dark-700 cursor-not-allowed opacity-50'
                  : 'bg-dark-700 hover:bg-gold-500 text-gray-200 hover:text-dark-900 border-dark-600 hover:border-gold-400 cursor-pointer'
              }`}
              aria-label={isOutOfStock ? 'Out of Stock' : 'Add to cart'}
              title={isOutOfStock ? 'Out of Stock' : 'Quick Add to Cart'}
            >
              <HiShoppingCart className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick View Modal */}
      <QuickViewModal
        product={product}
        isOpen={quickViewOpen}
        onClose={() => setQuickViewOpen(false)}
      />
    </>
  );
}
