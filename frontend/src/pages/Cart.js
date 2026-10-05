import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useSettings } from '../context/SettingsContext';
import { HiTrash, HiArrowRight, HiTruck } from 'react-icons/hi';
import PersonalizedRecommendations from '../components/PersonalizedRecommendations';

export default function Cart() {
  const { items, removeFromCart, updateQuantity, totalPrice } = useCart();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const deliveryFee = 0;
  const freeAbove = 0;
  const shipping = 0;
  const finalTotal = totalPrice;

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="min-h-[40vh] flex flex-col items-center justify-center px-4 text-center">
          <div className="text-6xl mb-6">🛒</div>
          <h2 className="text-2xl font-serif font-bold text-white mb-2">Your cart is empty</h2>
          <p className="text-gray-400 mb-6">Looks like you haven't added anything yet.</p>
          <Link to="/products" className="btn-primary">Continue Shopping</Link>
        </div>
        <PersonalizedRecommendations
          title="Recommended For You"
          subtitle="Explore authentic artisan creations curated for you"
          limit={4}
          className="pt-12 border-t border-dark-700/60"
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-serif font-bold text-white mb-8">Shopping Cart</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-6">
          {items.map((item) => (
            <div key={item.key} className="card p-4 flex gap-4 sm:gap-6 relative">
              <Link to={`/products/${item.product.id}`} className="shrink-0 w-24 h-32 sm:w-32 sm:h-40 bg-dark-800 rounded-lg overflow-hidden border border-dark-600">
                <img 
                  src={item.product.image_url} 
                  alt={item.product.name} 
                  className="w-full h-full object-cover" 
                />
              </Link>
              
              <div className="flex-1 flex flex-col">
                <div className="flex justify-between pr-8">
                  <div>
                    <Link to={`/products/${item.product.id}`} className="text-lg font-medium text-white hover:text-gold-400 transition-colors">
                      {item.product.name}
                    </Link>
                    <p className="text-sm text-gray-400 mt-1 capitalize">{item.product.category}</p>
                    {item.size && <p className="text-sm text-gray-400 mt-1">Size: <span className="text-white">{item.size}</span></p>}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gold-400">₹{(item.product.price * item.quantity).toLocaleString()}</p>
                    {item.quantity > 1 && <p className="text-xs text-gray-500 mt-1">₹{item.product.price.toLocaleString()} each</p>}
                  </div>
                </div>

                <div className="mt-auto flex items-center gap-4">
                  <div className="flex items-center border border-dark-500 rounded-lg bg-dark-800 p-1">
                    <button onClick={() => updateQuantity(item.key, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white">-</button>
                    <span className="w-8 text-center text-sm font-medium text-white">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.key, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white">+</button>
                  </div>
                  <button 
                    onClick={() => removeFromCart(item.key)}
                    className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1 absolute top-4 right-4 sm:static"
                  >
                    <HiTrash className="w-4 h-4 sm:hidden" />
                    <span className="hidden sm:inline border-b border-red-400/30 hover:border-red-300 pb-0.5">Remove</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="card p-6 sticky top-24">
            <h2 className="text-xl font-bold text-white mb-6">Order Summary</h2>
            
            <div className="space-y-4 text-sm text-gray-300 mb-6">
              <div className="flex justify-between">
                <span>Subtotal ({items.length} items)</span>
                <span className="text-white">₹{totalPrice.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Shipping</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <HiTruck className="w-4 h-4" /> FREE (₹0)
                </span>
              </div>
              <div className="text-[11px] text-gray-400 flex items-center gap-1.5 pt-1">
                <HiTruck className="w-3.5 h-3.5 text-gold-400" />
                <span>Estimated Delivery: <strong className="text-gray-200">{settings?.shipping_estimated_days || '3-5 Business Days'}</strong></span>
              </div>
            </div>

            <div className="border-t border-dark-600 pt-4 mb-8">
              <div className="flex justify-between items-end">
                <span className="font-bold text-white">Total</span>
                <span className="text-2xl font-bold text-gold-400">₹{finalTotal.toLocaleString()}</span>
              </div>
            </div>

            <button 
              onClick={() => navigate('/checkout')}
              className="w-full btn-primary flex justify-center items-center gap-2"
            >
              Proceed to Checkout <HiArrowRight />
            </button>

            <div className="mt-6 flex justify-center">
              <div className="flex gap-2">
                {/* Trust badges */}
                <span className="text-2xl" title="Secure Payment">🔒</span>
                <span className="text-2xl" title="Quality Guarantee">⭐</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Additions for Active Cart */}
      <PersonalizedRecommendations
        title="Complete Your Handcrafted Look"
        subtitle="Artisan handicraft pairings curated to complement your current selections"
        limit={4}
        excludeIds={items.map((i) => i.product?.id).filter(Boolean)}
        className="pt-16 border-t border-dark-700/60 mt-12"
      />
    </div>
  );
}
