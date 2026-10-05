import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiX, HiShieldCheck, HiTrash, HiCheck, HiAdjustments, HiEyeOff } from 'react-icons/hi';
import { useRecommendations } from '../context/RecommendationContext';

const CRAFT_CATEGORIES = [
  'Handloom & Textiles',
  'Home Décor & Furnishings',
  'Handmade Jewelry & Accessories',
  'Pottery & Terracotta',
  'Wooden Handicrafts',
  'Traditional Paintings & Wall Art',
  'Eco-Friendly & Natural Products',
];

export default function PersonalizationModal({ isOpen, onClose }) {
  const {
    isPaused,
    preferences,
    signalsCount,
    dismissedCount,
    togglePausePersonalization,
    clearHistory,
    clearDismissedProducts,
    updatePreferences,
  } = useRecommendations();

  const [selectedPrefs, setSelectedPrefs] = useState(() => preferences);

  // Sync when modal opens
  React.useEffect(() => {
    setSelectedPrefs(preferences);
  }, [preferences, isOpen]);

  const toggleCategory = (cat) => {
    setSelectedPrefs(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleSavePreferences = () => {
    updatePreferences(selectedPrefs);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-dark-850 border border-dark-600 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
          role="dialog"
          aria-labelledby="personalization-modal-title"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-dark-700 bg-dark-900/60">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gold-500/10 text-gold-400">
                <HiAdjustments className="w-5 h-5" />
              </div>
              <div>
                <h3 id="personalization-modal-title" className="text-lg font-serif font-bold text-white">
                  Personalization & Privacy
                </h3>
                <p className="text-xs text-gray-400">
                  Control how recommendations adapt to your shopping journey
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-dark-700 transition-colors"
              aria-label="Close modal"
            >
              <HiX className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Toggle Pause Personalization */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-dark-800 border border-dark-700">
              <div>
                <h4 className="text-sm font-semibold text-white">
                  {isPaused ? 'Personalization is Paused' : 'Personalization is Active'}
                </h4>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  {isPaused
                    ? 'Your searches and product views are not being recorded. You are seeing standard trending handicrafts.'
                    : 'KalaStyle tailors product recommendations based on crafts you browse and search for.'}
                </p>
              </div>
              <button
                type="button"
                onClick={togglePausePersonalization}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  !isPaused ? 'bg-gold-500' : 'bg-dark-600'
                }`}
                role="switch"
                aria-checked={!isPaused}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-dark-900 shadow ring-0 transition duration-200 ease-in-out ${
                    !isPaused ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Explicit Category Preferences */}
            <div>
              <label className="text-xs font-semibold text-gold-400 uppercase tracking-wider block mb-2">
                Your Preferred Crafts & Categories
              </label>
              <p className="text-xs text-gray-400 mb-3">
                Select the artisanal crafts you are most interested in seeing:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CRAFT_CATEGORIES.map(cat => {
                  const isChecked = selectedPrefs.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs font-medium transition-all ${
                        isChecked
                          ? 'border-gold-500 bg-gold-500/10 text-white'
                          : 'border-dark-700 bg-dark-800 text-gray-300 hover:border-dark-600'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          isChecked ? 'border-gold-500 bg-gold-500 text-dark-900' : 'border-gray-500'
                        }`}
                      >
                        {isChecked && <HiCheck className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="truncate">{cat}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* History & Dismissals Controls */}
            <div className="space-y-3 pt-2 border-t border-dark-700">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-white block">Recommendation Activity</span>
                  <span className="text-xs text-gray-400">
                    {signalsCount} interaction signals stored locally
                  </span>
                </div>
                <button
                  type="button"
                  onClick={clearHistory}
                  disabled={signalsCount === 0}
                  className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5 text-red-400 border-red-500/30 hover:bg-red-500/10 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <HiTrash className="w-3.5 h-3.5" />
                  Clear Activity
                </button>
              </div>

              {dismissedCount > 0 && (
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <span className="text-xs font-semibold text-white block">Hidden Masterpieces</span>
                    <span className="text-xs text-gray-400">
                      {dismissedCount} items hidden with "Not interested"
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={clearDismissedProducts}
                    className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5 text-gold-400 border-gold-500/30 hover:bg-gold-500/10"
                  >
                    <HiEyeOff className="w-3.5 h-3.5" />
                    Reset Hidden
                  </button>
                </div>
              )}
            </div>

            {/* Privacy Guarantee */}
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-dark-900/60 border border-dark-700/60 text-xs text-gray-400">
              <HiShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>First-Party Privacy:</strong> Your browsing signals stay in your browser. We never sell your data, use third-party tracking scripts, or share activity with external advertisers.
              </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 px-6 border-t border-dark-700 bg-dark-900/60 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-outline text-xs py-2 px-4"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSavePreferences}
              className="btn-primary text-xs py-2 px-5"
            >
              Save Preferences
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
