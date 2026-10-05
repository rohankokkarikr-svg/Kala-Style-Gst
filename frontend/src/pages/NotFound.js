import React from 'react';
import { Link } from 'react-router-dom';
import { HiHome, HiSearch, HiOutlineSupport, HiArrowLeft } from 'react-icons/hi';
import Footer from '../components/Footer';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-dark-900 text-gray-100 flex flex-col justify-between">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 flex-1 flex flex-col items-center justify-center text-center">
        {/* Decorative Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-400 text-xs font-semibold uppercase tracking-wider mb-6">
          <span>Error 404 · Page Not Found</span>
        </div>

        {/* Big Stylized Number */}
        <h1 className="text-7xl sm:text-9xl font-serif font-black tracking-tight text-white mb-4">
          4<span className="gold-text">0</span>4
        </h1>

        <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white mb-3">
          This Masterpiece Seems to be Missing
        </h2>

        <p className="text-gray-400 max-w-md mx-auto text-sm sm:text-base leading-relaxed mb-8">
          The artisan handicraft or page you are looking for may have been moved, renamed, or is temporarily unavailable. Let us guide you back to our curated Indian collections.
        </p>

        {/* Quick Action Navigation */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="btn-primary px-6 py-3 rounded-xl flex items-center gap-2 text-sm font-semibold shadow-gold hover:shadow-gold/40"
          >
            <HiHome className="w-4 h-4" /> Return to Home
          </Link>
          <Link
            to="/products"
            className="btn-outline px-6 py-3 rounded-xl flex items-center gap-2 text-sm font-semibold"
          >
            <HiSearch className="w-4 h-4" /> Explore Collections
          </Link>
          <Link
            to="/contact"
            className="px-5 py-3 rounded-xl bg-dark-800 hover:bg-dark-700 border border-dark-600 text-gray-300 hover:text-white flex items-center gap-2 text-sm font-semibold transition-all"
          >
            <HiOutlineSupport className="w-4 h-4 text-gold-400" /> Need Help?
          </Link>
        </div>

        {/* Popular Categories Links */}
        <div className="mt-12 pt-8 border-t border-dark-700/80 w-full max-w-lg">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-4">
            Popular Handicraft Categories
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            <Link
              to="/products?category=Handloom+%26+Textiles"
              className="px-3 py-1.5 rounded-lg bg-dark-800/80 hover:bg-dark-700 text-gray-300 hover:text-gold-400 border border-dark-700 transition-colors"
            >
              🧵 Handloom & Textiles
            </Link>
            <Link
              to="/products?category=Wooden+Handicrafts"
              className="px-3 py-1.5 rounded-lg bg-dark-800/80 hover:bg-dark-700 text-gray-300 hover:text-gold-400 border border-dark-700 transition-colors"
            >
              🪵 Wooden Handicrafts
            </Link>
            <Link
              to="/products?category=Pottery+%26+Terracotta"
              className="px-3 py-1.5 rounded-lg bg-dark-800/80 hover:bg-dark-700 text-gray-300 hover:text-gold-400 border border-dark-700 transition-colors"
            >
              🏺 Pottery & Terracotta
            </Link>
            <Link
              to="/products?category=Traditional+Paintings+%26+Wall+Art"
              className="px-3 py-1.5 rounded-lg bg-dark-800/80 hover:bg-dark-700 text-gray-300 hover:text-gold-400 border border-dark-700 transition-colors"
            >
              🖼️ Traditional Paintings
            </Link>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
