import React from 'react';
import { Link } from 'react-router-dom';
import { HiMail, HiPhone, HiShieldCheck } from 'react-icons/hi';
import { FaInstagram, FaWhatsapp } from 'react-icons/fa';
import { useSettings } from '../context/SettingsContext';

const HANDICRAFT_LINKS = [
  { label: 'Handloom & Textiles', href: '/products?category=Handloom+%26+Textiles' },
  { label: 'Home Décor & Living', href: '/products?category=Home+D%C3%A9cor+%26+Furnishings' },
  { label: 'Handmade Jewelry', href: '/products?category=Handmade+Jewelry+%26+Accessories' },
  { label: 'Pottery & Terracotta', href: '/products?category=Pottery+%26+Terracotta' },
  { label: 'Wooden Handicrafts', href: '/products?category=Wooden+Handicrafts' },
  { label: 'Traditional Paintings', href: '/products?category=Traditional+Paintings+%26+Wall+Art' },
  { label: 'Eco-Friendly Crafts', href: '/products?category=Eco-Friendly+%26+Natural+Products' },
];

const QUICK_LINKS = [
  { label: 'All Handicrafts', href: '/products' },
  { label: 'My Wishlist', href: '/wishlist' },
  { label: 'My Orders', href: '/orders' },
  { label: 'AI Artisan Studio', href: '/artisan/ai-studio' },
  { label: 'Privacy Policy', href: '/privacy-policy' },
  { label: 'Terms & Conditions', href: '/terms-and-conditions' },
];

export default function Footer() {
  const year = new Date().getFullYear();
  const { settings } = useSettings();

  const {
    storeName = 'KalaStyle AI',
    supportEmail = 'support@kalastyle.ai',
    supportPhone = '+91 7676558335',
    instagramUrl = 'https://www.instagram.com',
    whatsappNumber = '917676558335',
  } = settings;

  return (
    <footer className="bg-dark-950 border-t border-dark-700/80 text-gray-400 mt-12">
      {/* Top Trust Strip */}
      <div className="border-b border-dark-800/80 py-4 bg-dark-900/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="flex items-center justify-center gap-2 text-xs text-gray-300">
              <HiShieldCheck className="w-4 h-4 text-gold-500 shrink-0" />
              <span>100% Certified Handmade</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-gray-300">
              <span className="text-gold-500 font-bold">₹</span>
              <span>Direct Artisan Earnings</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-gray-300">
              <span className="text-gold-500 font-bold">🇮🇳</span>
              <span>GI Heritage Crafts</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-gray-300">
              <span className="text-gold-500 font-bold">🚚</span>
              <span>Secure Pan-India Delivery</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* 1. Brand & Artisan Mission (4 cols) */}
          <div className="md:col-span-4 space-y-3">
            <Link to="/" className="flex items-center gap-2.5">
              <img
                src="/images/kalastyle_logo.png"
                alt={storeName}
                className="h-9 w-9 object-cover rounded-full ring-1 ring-gold-500/80 shadow-sm"
              />
              <div>
                <span className="font-serif text-lg font-bold gold-text leading-tight block">{storeName}</span>
                <span className="text-[9px] text-gray-400 uppercase tracking-widest block -mt-0.5">Indian Handicrafts</span>
              </div>
            </Link>
            <p className="text-xs text-gray-400 leading-relaxed max-w-sm">
              Connecting traditional Indian master weavers, sculptors, and folk artists directly with global patrons through authentic, ethical commerce.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full bg-dark-800 hover:bg-gold-500/20 text-gray-400 hover:text-pink-400 flex items-center justify-center transition-colors border border-dark-700"
                aria-label="Instagram"
              >
                <FaInstagram className="w-4 h-4" />
              </a>
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full bg-dark-800 hover:bg-gold-500/20 text-gray-400 hover:text-green-400 flex items-center justify-center transition-colors border border-dark-700"
                aria-label="WhatsApp"
              >
                <FaWhatsapp className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* 2. Handicraft Categories (4 cols) */}
          <div className="md:col-span-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gold-400 mb-3">
              Craft Collections
            </h4>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-2 text-xs">
              {HANDICRAFT_LINKS.map((l) => (
                <li key={l.label}>
                  <Link to={l.href} className="text-gray-400 hover:text-gold-400 transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 3. Quick Links & Customer Care (2 cols) */}
          <div className="md:col-span-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gold-400 mb-3">
              Marketplace
            </h4>
            <ul className="space-y-1.5 text-xs">
              {QUICK_LINKS.map((l) => (
                <li key={l.label}>
                  <Link to={l.href} className="text-gray-400 hover:text-gold-400 transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 4. Support & Contact (2 cols) */}
          <div className="md:col-span-2 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gold-400 mb-3">
              Artisan Help
            </h4>
            <div className="space-y-2 text-xs">
              <a
                href={`tel:${supportPhone}`}
                className="flex items-center gap-2 text-gray-300 hover:text-gold-400 transition-colors"
              >
                <HiPhone className="w-3.5 h-3.5 text-gold-500 shrink-0" />
                <span>{supportPhone}</span>
              </a>
              <a
                href={`mailto:${supportEmail}`}
                className="flex items-center gap-2 text-gray-300 hover:text-gold-400 transition-colors truncate"
              >
                <HiMail className="w-3.5 h-3.5 text-gold-500 shrink-0" />
                <span className="truncate">{supportEmail}</span>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Copyright & Notes */}
        <div className="border-t border-dark-800/80 mt-8 pt-5 flex flex-col sm:flex-row justify-between items-center gap-3 text-[11px] text-gray-500">
          <p>&copy; {year} {storeName}. Handcrafted with pride in India.</p>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-gray-400">
            <Link to="/privacy-policy" className="hover:text-gold-400 transition-colors">Privacy Policy</Link>
            <span className="text-dark-600">•</span>
            <Link to="/terms-and-conditions" className="hover:text-gold-400 transition-colors">Terms & Conditions</Link>
            <span className="text-dark-600">•</span>
            <span>Master Artisans Collective</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
