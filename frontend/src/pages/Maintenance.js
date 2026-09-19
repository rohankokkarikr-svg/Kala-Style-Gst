import React from 'react';
import { useSettings } from '../context/SettingsContext';
import { motion } from 'framer-motion';
import { HiClock, HiMail, HiPhone, HiLocationMarker } from 'react-icons/hi';

export default function Maintenance() {
  const { settings } = useSettings();

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4 relative overflow-hidden select-none">
      {/* Background Gradient Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-gold-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-gold-500/5 blur-[120px] pointer-events-none" />

      {/* Main Container */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="max-w-xl w-full text-center relative z-10 space-y-8"
      >
        {/* Animated Icon */}
        <div className="flex justify-center">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
            className="w-20 h-20 rounded-full bg-gold-500/10 border border-gold-500/30 flex items-center justify-center text-gold-400 shadow-luxury"
          >
            <HiClock className="w-10 h-10" />
          </motion.div>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-5xl font-serif font-bold text-white tracking-wide">
            Refining Our Store
          </h1>
          <div className="h-0.5 w-24 bg-gradient-luxury mx-auto rounded-full" />
          <p className="text-gray-400 text-sm sm:text-base max-w-md mx-auto leading-relaxed">
            {settings?.storeName || 'KalaStyle AI'} is currently undergoing scheduled maintenance. 
            We are polishing our services to bring you a more authentic Indian handicraft shopping experience. 
            Please check back shortly.
          </p>
        </div>

        {/* Support Card */}
        <div className="bg-dark-800/80 backdrop-blur-md border border-dark-600 rounded-2xl p-6 shadow-card space-y-4">
          <h2 className="text-white text-xs font-bold uppercase tracking-widest text-gold-400">
            Need Immediate Assistance?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {settings?.supportEmail && (
              <a 
                href={`mailto:${settings.supportEmail}`} 
                className="flex items-center gap-3 p-3 rounded-xl bg-dark-700/50 border border-dark-600/50 hover:border-gold-500/30 transition-all group text-left"
              >
                <div className="w-8 h-8 rounded-full bg-gold-500/10 flex items-center justify-center text-gold-400 group-hover:scale-105 transition-transform">
                  <HiMail className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">Email Us</p>
                  <p className="text-xs text-white truncate font-medium">{settings.supportEmail}</p>
                </div>
              </a>
            )}

            {settings?.supportPhone && (
              <a 
                href={`tel:${settings.supportPhone}`} 
                className="flex items-center gap-3 p-3 rounded-xl bg-dark-700/50 border border-dark-600/50 hover:border-gold-500/30 transition-all group text-left"
              >
                <div className="w-8 h-8 rounded-full bg-gold-500/10 flex items-center justify-center text-gold-400 group-hover:scale-105 transition-transform">
                  <HiPhone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">Call Us</p>
                  <p className="text-xs text-white truncate font-medium">{settings.supportPhone}</p>
                </div>
              </a>
            )}
          </div>

          {settings?.storeAddress && (
            <div className="flex gap-3 p-3 rounded-xl bg-dark-700/30 border border-dark-600/20 text-left">
              <div className="w-8 h-8 rounded-full bg-gold-500/10 flex items-center justify-center text-gold-400 shrink-0 mt-0.5">
                <HiLocationMarker className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-semibold">Store Address</p>
                <p className="text-xs text-gray-400 leading-relaxed font-medium mt-0.5">{settings.storeAddress}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-gray-600 text-xs font-medium uppercase tracking-wider">
          © {new Date().getFullYear()} {settings?.storeName || 'KalaStyle AI'} · Artisan Marketplace
        </p>
      </motion.div>
    </div>
  );
}
