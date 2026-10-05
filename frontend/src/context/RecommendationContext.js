import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { recommendationAPI, productAPI } from '../services/api';
import toast from 'react-hot-toast';

const RecommendationContext = createContext(null);

const STORAGE_KEYS = {
  SIGNALS: 'kala_shopper_signals_v1',
  DISMISSED: 'kala_dismissed_products_v1',
  PREFERENCES: 'kala_shopper_preferences_v1',
  PAUSED: 'kala_personalization_paused_v1',
};

const MAX_SIGNALS = 50;
const SIGNAL_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const RecommendationProvider = ({ children }) => {
  // 1. Privacy & Preferences State
  const [isPaused, setIsPaused] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.PAUSED) === 'true';
    } catch {
      return false;
    }
  });

  const [preferences, setPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [dismissedIds, setDismissedIds] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DISMISSED);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 2. Shopper Activity Signals
  const [signals, setSignals] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SIGNALS);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      const now = Date.now();
      // Filter expired signals
      return Array.isArray(parsed)
        ? parsed.filter(s => s && s.timestamp && (now - new Date(s.timestamp).getTime()) < SIGNAL_EXPIRY_MS)
        : [];
    } catch {
      return [];
    }
  });

  // Sync state to first-party storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PAUSED, isPaused ? 'true' : 'false');
    } catch {}
  }, [isPaused]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(preferences));
    } catch {}
  }, [preferences]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.DISMISSED, JSON.stringify(dismissedIds));
    } catch {}
  }, [dismissedIds]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SIGNALS, JSON.stringify(signals));
    } catch {}
  }, [signals]);

  // Record a shopper interaction signal
  const recordSignal = useCallback((type, data = {}) => {
    if (isPaused) return; // Respect privacy pause

    const now = new Date().toISOString();
    const newSignal = {
      type,
      ...data,
      timestamp: now,
    };

    setSignals(prev => {
      // Avoid duplicate consecutive identical signals within 5 seconds
      if (prev.length > 0) {
        const last = prev[0];
        if (
          last.type === type &&
          last.productId === data.productId &&
          last.term === data.term &&
          (new Date(now).getTime() - new Date(last.timestamp).getTime()) < 5000
        ) {
          return prev;
        }
      }
      return [newSignal, ...prev].slice(0, MAX_SIGNALS);
    });
  }, [isPaused]);

  // Convenience tracking methods
  const trackSearch = useCallback((term) => {
    if (!term || typeof term !== 'string') return;
    const clean = term.trim().slice(0, 100);
    if (clean.length < 2) return;
    recordSignal('SEARCH', { term: clean });
  }, [recordSignal]);

  const trackProductView = useCallback((product) => {
    if (!product || !product.id) return;
    recordSignal('VIEW', {
      productId: String(product.id),
      productName: product.name,
      category: product.category,
    });
  }, [recordSignal]);

  const trackCartAdd = useCallback((product) => {
    if (!product || !product.id) return;
    recordSignal('CART', {
      productId: String(product.id),
      productName: product.name,
      category: product.category,
    });
  }, [recordSignal]);

  const trackWishlistAdd = useCallback((product) => {
    if (!product || !product.id) return;
    recordSignal('WISHLIST', {
      productId: String(product.id),
      productName: product.name,
      category: product.category,
    });
  }, [recordSignal]);

  // Cross-context event listener for cart & wishlist signals
  useEffect(() => {
    const handleSignalEvent = (e) => {
      const { type, product, term } = e.detail || {};
      if (type === 'CART' && product) trackCartAdd(product);
      else if (type === 'WISHLIST' && product) trackWishlistAdd(product);
      else if (type === 'VIEW' && product) trackProductView(product);
      else if (type === 'SEARCH' && term) trackSearch(term);
    };
    window.addEventListener('kala:signal', handleSignalEvent);
    return () => window.removeEventListener('kala:signal', handleSignalEvent);
  }, [trackCartAdd, trackWishlistAdd, trackProductView, trackSearch]);

  // Product Dismissal
  const dismissProduct = useCallback((productId) => {
    if (!productId) return;
    setDismissedIds(prev => prev.includes(productId) ? prev : [...prev, productId]);
    recordSignal('DISMISS', { productId });
    toast.success('Product hidden from recommendations', { icon: '👁️', id: 'dismiss-toast' });
  }, [recordSignal]);

  const clearDismissedProducts = useCallback(() => {
    setDismissedIds([]);
    toast.success('Hidden products restored', { id: 'undismiss-toast' });
  }, []);

  // Privacy Controls
  const togglePausePersonalization = useCallback(() => {
    setIsPaused(prev => {
      const next = !prev;
      if (next) {
        toast('Personalization paused. Trending items will be shown.', { icon: '⏸️' });
      } else {
        toast.success('Personalized recommendations enabled!', { icon: '✨' });
      }
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setSignals([]);
    try {
      localStorage.removeItem(STORAGE_KEYS.SIGNALS);
    } catch {}
    toast.success('Recommendation activity history cleared', { icon: '🧹' });
  }, []);

  const updatePreferences = useCallback((newPrefs) => {
    const list = Array.isArray(newPrefs) ? newPrefs.slice(0, 10) : [];
    setPreferences(list);
    toast.success('Craft preferences updated!', { icon: '🎨' });
  }, []);

  // Fetch Personalized Recommendations (with offline/graceful client fallback)
  const fetchRecommendations = useCallback(async ({
    limit = 8,
    excludeIds = [],
    targetCategory = null,
  } = {}) => {
    const allExcludes = Array.from(new Set([...dismissedIds, ...excludeIds].filter(Boolean)));

    // If personalization is paused, don't pass shopper signals
    const activeSignals = isPaused ? [] : signals;

    try {
      const res = await recommendationAPI.getPersonalized({
        signals: activeSignals,
        preferences: isPaused ? [] : preferences,
        excludeIds: allExcludes,
        limit,
        targetCategory,
      });

      if (res?.data?.success && Array.isArray(res.data.recommendations) && res.data.recommendations.length > 0) {
        return res.data;
      }
    } catch (err) {
      console.warn('[RecommendationContext] Backend recommendation API notice, utilizing local fallback:', err.message);
    }

    // Client-side fallback if backend call returns empty or is unreachable
    try {
      const fallbackRes = await productAPI.getFeatured();
      const raw = fallbackRes?.data || fallbackRes;
      const list = Array.isArray(raw) ? raw : [];
      const filtered = list.filter(p => p && p.id && !allExcludes.includes(p.id));

      return {
        success: true,
        recommendations: filtered.slice(0, limit).map(p => ({
          ...p,
          recommendationReason: 'Trending Indian handicraft',
          matchSource: 'trending',
        })),
        totalFound: Math.min(filtered.length, limit),
        coldStart: true,
      };
    } catch {
      return {
        success: true,
        recommendations: [],
        totalFound: 0,
        coldStart: true,
      };
    }
  }, [dismissedIds, isPaused, signals, preferences]);

  const value = {
    isPaused,
    preferences,
    signalsCount: signals.length,
    dismissedCount: dismissedIds.length,
    trackSearch,
    trackProductView,
    trackCartAdd,
    trackWishlistAdd,
    dismissProduct,
    clearDismissedProducts,
    togglePausePersonalization,
    clearHistory,
    updatePreferences,
    fetchRecommendations,
  };

  return (
    <RecommendationContext.Provider value={value}>
      {children}
    </RecommendationContext.Provider>
  );
};

export const useRecommendations = () => {
  const ctx = useContext(RecommendationContext);
  if (!ctx) {
    throw new Error('useRecommendations must be used within a RecommendationProvider');
  }
  return ctx;
};
