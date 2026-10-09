/**
 * Persistent & In-Memory Stale-While-Revalidate (SWR) API Cache
 * Makes page navigation & first-time/repeat visits 0ms instantaneous
 */

class APICache {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 10 * 60 * 1000; // 10 minutes fresh
    this.storagePrefix = 'kala_swr_';
    this.cacheVersion = 'v3_real_catalog_live';

    // Auto-purge stale cached data on startup if cache version bumped
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (localStorage.getItem('kala_swr_version') !== this.cacheVersion) {
          const toDelete = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(this.storagePrefix)) toDelete.push(k);
          }
          toDelete.forEach((k) => localStorage.removeItem(k));
          localStorage.setItem('kala_swr_version', this.cacheVersion);
        }
      }
    } catch (_) {}
  }

  _toStorageKey(key) {
    return this.storagePrefix + key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  }

  get(key) {
    // 1. In-memory hot cache
    const memoryEntry = this.cache.get(key);
    if (memoryEntry) {
      const isExpired = Date.now() - memoryEntry.timestamp > memoryEntry.ttl;
      return {
        data: memoryEntry.data,
        isExpired,
      };
    }

    // 2. Persistent localStorage cache (survives tab close & page reloads)
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(this._toStorageKey(key));
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.data !== undefined) {
            this.cache.set(key, parsed);
            const isExpired = Date.now() - parsed.timestamp > (parsed.ttl || this.defaultTTL);
            return {
              data: parsed.data,
              isExpired,
            };
          }
        }
      }
    } catch (_) {}

    return null;
  }

  getSync(key) {
    const res = this.get(key);
    return res ? res.data : null;
  }

  set(key, data, ttl = this.defaultTTL) {
    if (data === undefined || data === null) return;

    const entry = {
      data,
      timestamp: Date.now(),
      ttl,
    };
    this.cache.set(key, entry);

    // Persist safe read catalog/settings queries to localStorage
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(this._toStorageKey(key), JSON.stringify(entry));
      }
    } catch (_) {}
  }

  invalidate(pattern) {
    if (!pattern) {
      this.cache.clear();
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const toDelete = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(this.storagePrefix)) toDelete.push(k);
          }
          toDelete.forEach((k) => localStorage.removeItem(k));
        }
      } catch (_) {}
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const safePat = pattern.replace(/[^a-zA-Z0-9_-]/g, '_');
        const toDelete = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(this.storagePrefix) && k.includes(safePat)) {
            toDelete.push(k);
          }
        }
        toDelete.forEach((k) => localStorage.removeItem(k));
      }
    } catch (_) {}
  }

  invalidateProducts() {
    this.invalidate('/products');
  }

  invalidateArtisans() {
    this.invalidate('/artisans');
    this.invalidate('/admin/artisans');
  }

  invalidateReviews() {
    this.invalidate('/reviews');
    this.invalidate('/admin/reviews');
  }

  invalidateCategories() {
    this.invalidate('/products/categories');
    this.invalidate('/admin/categories');
  }

  invalidateOrders() {
    this.invalidate('/orders');
  }

  invalidateSettings() {
    this.invalidate('/settings');
  }
}

export const apiCache = new APICache();
export default apiCache;

