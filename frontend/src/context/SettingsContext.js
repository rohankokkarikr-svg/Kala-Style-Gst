import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { settingsAPI } from '../services/api';
import { supabase } from '../lib/supabase';
import { apiCache } from '../utils/apiCache';

const SETTINGS_CACHE_KEY = 'sh_settings_v8_hero_slides';

// Clean up old legacy keys that cause stale demo data on mobile and desktop browsers
try {
  localStorage.removeItem('heroSlides');
  localStorage.removeItem('discountBanner');
  localStorage.removeItem('sh_settings');
  localStorage.removeItem('sh_settings_v2');
  localStorage.removeItem('sh_settings_v3');
  localStorage.removeItem('sh_settings_v4_synced');
  localStorage.removeItem('sh_settings_v5_synced');
  localStorage.removeItem('sh_settings_v6_shipping');
  localStorage.removeItem('sh_settings_v7_slides');
} catch {}

export const DEFAULT_HERO_SLIDES = [
  {
    id: 1,
    image: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048652/kalastyle-artisan-marketplace/wesedw9fpem0032yfsmk.jpg',
    badgeText: '✦ Heritage Handlooms',
    badgeType: 'new',
    headline: 'Pure Handloom & Heritage Silks',
    subtitle: 'Authentic Banarasi, Kanchipuram, and Pashmina handwoven by master generational weavers across India.',
    buttonText: 'Explore Handlooms',
    buttonLink: '/products?category=Handloom+%26+Textiles',
    align: 'left',
  },
  {
    id: 2,
    image: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789047566/kalastyle-artisan-marketplace/xtzypfezplersfalej58.jpg',
    badgeText: '★ 22K Gold Heritage',
    badgeType: 'sale',
    headline: 'Traditional Indian Art & Paintings',
    subtitle: 'Royal Tanjore gold foil art, Madhubani folk paintings, and Pattachitra scrolls straight from artisan guilds.',
    buttonText: 'Discover Art',
    buttonLink: '/products?category=Traditional+Paintings+%26+Wall+Art',
    align: 'center',
  },
  {
    id: 3,
    image: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789047399/kalastyle-artisan-marketplace/m4z3g3pnrgfwpaixwlbg.jpg',
    badgeText: '✦ Hand-Carved Teak',
    badgeType: 'new',
    headline: 'Artisanal Wooden Handicrafts',
    subtitle: 'Intricate Saharanpur woodcrafts, ornate jharokha mirrors, and vibrant Channapatna organic toy craft.',
    buttonText: 'Shop Wooden Crafts',
    buttonLink: '/products?category=Wooden+Handicrafts',
    align: 'left',
  },
  {
    id: 4,
    image: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048918/kalastyle-artisan-marketplace/jkjs1hgqonmbq9h3eizd.jpg',
    badgeText: '★ 100% Handmade',
    badgeType: 'sale',
    headline: 'Timeless Indian Home Décor',
    subtitle: 'Hand-knotted rugs, brass hanging lamps, and natural river clay terracotta pottery for elegant spaces.',
    buttonText: 'Explore Home Décor',
    buttonLink: '/products?category=Home+D%C3%A9cor+%26+Furnishings',
    align: 'center',
  },
];

export const DEFAULT_DISCOUNT_BANNER = {
  title: 'Artisan Launch Sale',
  description: 'Use this code and get upto 30% off on handmade products',
  discount: '30%',
  code: 'KALA30',
  discountPercentage: 30,
  buttonText: 'Grab the Deal',
  buttonLink: '/products',
  isActive: true,
};

export const DEFAULT_CATEGORY_BANNERS = {
  all: {
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-an-artisan-weaving-colorful-threads-42859-large.mp4',
    imageUrl: '/images/explore_handicrafts_banner.jpg',
    title: 'Explore Indian Handicrafts',
    subtitle: 'Browse handloom textiles, home décor, brass jewelry, pottery, and folk art handcrafted with generations of heritage.',
  },
  'handloom-textiles': {
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-woman-weaving-on-a-loom-42861-large.mp4',
    imageUrl: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048623/kalastyle-artisan-marketplace/lzc4iz6pi8bmvgh5zl9b.jpg',
    title: 'Handloom & Textiles',
    subtitle: "Discover India's rich heritage of handwoven fabrics, sarees, shawls, and traditional textiles.",
  },
  'pottery-terracotta': {
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-potter-working-on-a-clay-pot-on-a-pottery-wheel-42845-large.mp4',
    imageUrl: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048198/kalastyle-artisan-marketplace/dgqnjxjokbbkuuznvwnu.jpg',
    title: 'Pottery & Terracotta',
    subtitle: 'Handcrafted clay pots, blue pottery vases, terracotta diyas, and authentic artisanal ceramics.',
  },
  'wooden-handicrafts': {
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-an-artisan-sculpting-wood-with-a-chisel-42857-large.mp4',
    imageUrl: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789047127/kalastyle-artisan-marketplace/xi20ztdn6lzlcvssqskl.jpg',
    title: 'Wooden Handicrafts',
    subtitle: 'Channapatna lac-turnery toys, intricately hand-carved teak sculptures, wall art, and heritage woodwork.',
  },
  'home-decor': {
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-an-artisan-weaving-colorful-threads-42859-large.mp4',
    imageUrl: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789049267/kalastyle-artisan-marketplace/gnyzho03a9jz09nrwzti.jpg',
    title: 'Home Décor & Furnishings',
    subtitle: 'Elevate your living space with artisanal wall hangings, rugs, decorative lamps, and Indian crafts.',
  },
  'handmade-jewelry': {
    videoUrl: '',
    imageUrl: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048588/kalastyle-artisan-marketplace/wswk3llhg5bu3y2ypuj6.jpg',
    title: 'Handmade Jewelry & Accessories',
    subtitle: 'Adorn timeless silver, oxidized brass, Kundan, and terracotta handmade jewelry masterfully crafted by hand.',
  },
  'traditional-paintings': {
    videoUrl: '',
    imageUrl: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789047511/kalastyle-artisan-marketplace/vhhx4egup5jxucqtelv9.jpg',
    title: 'Traditional Paintings & Wall Art',
    subtitle: 'Authentic Madhubani, Warli tribal art, Pattachitra, Gond, and Tanjore gold foil handmade paintings.',
  },
  'eco-friendly': {
    videoUrl: '',
    imageUrl: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789044071/kalastyle-artisan-marketplace/pwgxu5f4ucraorrlyfip.jpg',
    title: 'Eco-Friendly & Natural Products',
    subtitle: 'Sustainable natural fiber baskets, golden jute rugs, bamboo tableware, and conscious handcrafted living.',
  },
};

const DEFAULT_SETTINGS = {
  storeName: 'KalaStyle AI',
  supportEmail: 'support@kalastyle.ai',
  supportPhone: '+91 7676558335',
  storeAddress: 'KalaStyle AI, Supporting Artisans & Handloom Crafts Across India',
  currency: 'INR (₹)',
  taxRate: '18',
  maintenanceMode: false,
  orderNotifications: true,
  instagramUrl: 'https://www.instagram.com/style_heaven_mens_wear?igsh=MXVueXV5ejc1bXVvNQ==',
  whatsappNumber: '917676558335',
  footerTagline: "Empowering India's generational artisans, master handloom weavers, and traditional craftsmen with AI-driven direct commerce.",
  heroSlides: DEFAULT_HERO_SLIDES,
  discountBanner: DEFAULT_DISCOUNT_BANNER,
  categoryBanners: DEFAULT_CATEGORY_BANNERS,
  delivery_fee: 0,
  free_delivery_above: 0,
  shipping_estimated_days: '3 - 5 Business Days',
  cod_enabled: true,
  cod_min_order_value: 100,
  cod_max_order_value: 5000,
};

const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  refreshSettings: () => {},
  updateSettings: async () => {},
});

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(() => {
    // Seed from versioned localStorage for instant paint without stale data
    try {
      const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          heroSlides: Array.isArray(parsed.heroSlides) && parsed.heroSlides.length > 0 ? parsed.heroSlides : DEFAULT_HERO_SLIDES,
          discountBanner: parsed.discountBanner ? { ...DEFAULT_DISCOUNT_BANNER, ...parsed.discountBanner } : DEFAULT_DISCOUNT_BANNER,
          categoryBanners: { ...DEFAULT_CATEGORY_BANNERS, ...(parsed.categoryBanners || {}) },
          delivery_fee: 0,
          free_delivery_above: 0,
          shipping_estimated_days: parsed.shipping_estimated_days || '3 - 5 Business Days',
          cod_enabled: parsed.cod_enabled !== undefined ? Boolean(parsed.cod_enabled) : true,
          cod_min_order_value: parsed.cod_min_order_value !== undefined ? Number(parsed.cod_min_order_value) : 100,
          cod_max_order_value: parsed.cod_max_order_value !== undefined ? Number(parsed.cod_max_order_value) : 5000,
        };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });

  const refreshSettings = useCallback(async (force = false) => {
    let loadedData = null;
    let cloudHeroSlides = null;
    let cloudCategoryBanners = null;

    // 0. Instant fetch from persistent Supabase Storage CDN (public bucket site-config)
    try {
      const storageCdnUrl = 'https://fwuhlhaadhhveuljsqbh.supabase.co/storage/v1/object/public/site-config/hero_slides.json?t=' + Date.now();
      const cdnRes = await fetch(storageCdnUrl);
      if (cdnRes.ok) {
        const cdnSlides = await cdnRes.json();
        if (Array.isArray(cdnSlides) && cdnSlides.length > 0) {
          cloudHeroSlides = cdnSlides;
        }
      }
    } catch (e) {
      // Storage CDN fallback
    }

    try {
      const catBannersCdnUrl = 'https://fwuhlhaadhhveuljsqbh.supabase.co/storage/v1/object/public/site-config/category_banners.json?t=' + Date.now();
      const catRes = await fetch(catBannersCdnUrl);
      if (catRes.ok) {
        const catData = await catRes.json();
        if (catData && typeof catData === 'object') {
          cloudCategoryBanners = catData;
        }
      }
    } catch (_) {}

    // 1. Fast parallel load: Race Backend API with direct Supabase Edge
    try {
      if (force) {
        apiCache.invalidateSettings();
      }
      const backendPromise = settingsAPI.get().catch(() => null);
      const supaPromise = supabase
        .from('platform_settings')
        .select('*')
        .eq('id', 'main')
        .single()
        .then((res) => (res.data ? { data: { ...DEFAULT_SETTINGS, ...res.data } } : null))
        .catch(() => null);

      // Fast race: whichever responds first with valid data wins!
      const fastResult = await Promise.race([backendPromise, supaPromise]);
      if (fastResult?.data && typeof fastResult.data === 'object') {
        loadedData = fastResult.data;
      } else {
        const fallback = await (backendPromise || supaPromise);
        if (fallback?.data && typeof fallback.data === 'object') {
          loadedData = fallback.data;
        }
      }
    } catch (err) {
      // Backend or Supabase fetch caught
    }

    const activeHeroSlides = (Array.isArray(cloudHeroSlides) && cloudHeroSlides.length > 0)
      ? cloudHeroSlides
      : (Array.isArray(loadedData?.heroSlides) && loadedData.heroSlides.length > 0
          ? loadedData.heroSlides
          : (Array.isArray(loadedData?.hero_slides) && loadedData.hero_slides.length > 0
              ? loadedData.hero_slides
              : DEFAULT_HERO_SLIDES));

    const activeCategoryBanners = (cloudCategoryBanners && typeof cloudCategoryBanners === 'object')
      ? { ...DEFAULT_CATEGORY_BANNERS, ...cloudCategoryBanners }
      : ((loadedData?.categoryBanners && typeof loadedData.categoryBanners === 'object')
          ? { ...DEFAULT_CATEGORY_BANNERS, ...loadedData.categoryBanners }
          : DEFAULT_CATEGORY_BANNERS);

    const merged = {
      ...DEFAULT_SETTINGS,
      ...(loadedData || {}),
      storeName: loadedData?.storeName || loadedData?.platform_name || DEFAULT_SETTINGS.storeName,
      platform_name: loadedData?.platform_name || loadedData?.storeName || DEFAULT_SETTINGS.storeName,
      supportEmail: loadedData?.supportEmail || loadedData?.contact_email || DEFAULT_SETTINGS.supportEmail,
      contact_email: loadedData?.contact_email || loadedData?.supportEmail || DEFAULT_SETTINGS.supportEmail,
      supportPhone: loadedData?.supportPhone || loadedData?.contact_phone || DEFAULT_SETTINGS.supportPhone,
      contact_phone: loadedData?.contact_phone || loadedData?.supportPhone || DEFAULT_SETTINGS.supportPhone,
      heroSlides: activeHeroSlides,
      categoryBanners: activeCategoryBanners,
      discountBanner: loadedData?.discountBanner || loadedData?.discount_banner
        ? { ...DEFAULT_DISCOUNT_BANNER, ...(loadedData?.discountBanner || loadedData?.discount_banner) }
        : DEFAULT_DISCOUNT_BANNER,
      delivery_fee: loadedData?.delivery_fee !== undefined ? Number(loadedData.delivery_fee) : 0,
      free_delivery_above: loadedData?.free_delivery_above !== undefined ? Number(loadedData.free_delivery_above) : 0,
      shipping_estimated_days: loadedData?.shipping_estimated_days || DEFAULT_SETTINGS.shipping_estimated_days,
      cod_enabled: loadedData?.cod_enabled !== undefined ? Boolean(loadedData.cod_enabled) : DEFAULT_SETTINGS.cod_enabled,
      cod_min_order_value: loadedData?.cod_min_order_value !== undefined ? Number(loadedData.cod_min_order_value) : DEFAULT_SETTINGS.cod_min_order_value,
      cod_max_order_value: loadedData?.cod_max_order_value !== undefined ? Number(loadedData.cod_max_order_value) : DEFAULT_SETTINGS.cod_max_order_value,
    };

    setSettings(merged);
    try {
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(merged));
    } catch {}
  }, []);

  const updateSettings = useCallback(async (partialUpdates) => {
    try {
      const updated = {
        ...settings,
        ...partialUpdates,
      };

      // Invalidate frontend cache so any subsequent fetch immediately gets fresh data
      apiCache.invalidateSettings();

      // 1. Optimistic local update
      setSettings(updated);
      try {
        localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(updated));
      } catch {}

      // 2. Persist to backend server API
      try {
        await settingsAPI.update(partialUpdates);
      } catch (apiErr) {
        console.warn('Backend API update failed, syncing with Supabase directly:', apiErr.message);
      }

      // 3. Multi-device live broadcast across all tabs and devices
      try {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const bc = new BroadcastChannel('kalastyle_device_sync');
          bc.postMessage({ type: 'SETTINGS_UPDATED', payload: updated });
          bc.close();
        }
        if (supabase && typeof supabase.channel === 'function') {
          const channel = supabase.channel('kalastyle_live_sync');
          channel.send({
            type: 'broadcast',
            event: 'KALA_SYNC',
            payload: { type: 'SETTINGS_UPDATED', data: updated },
          }).catch(() => {});
        }
        window.dispatchEvent(new CustomEvent('kala:sync:settings_updated', {
          detail: { payload: updated }
        }));
      } catch (bcErr) {}

      return { success: true };
    } catch (err) {
      console.error('Failed to update settings:', err);
      throw err;
    }
  }, [settings]);

  // Load fresh settings on mount
  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  // Listen for real-time updates from other devices / Admin control center
  useEffect(() => {
    const handleLiveSettings = (e) => {
      const incoming = e.detail?.payload;
      if (incoming) {
        setSettings((prev) => {
          const merged = {
            ...prev,
            ...incoming,
            heroSlides: Array.isArray(incoming.heroSlides || incoming.hero_slides) && (incoming.heroSlides || incoming.hero_slides).length > 0
              ? (incoming.heroSlides || incoming.hero_slides)
              : prev.heroSlides,
            discountBanner: (incoming.discountBanner || incoming.discount_banner)
              ? { ...prev.discountBanner, ...(incoming.discountBanner || incoming.discount_banner) }
              : prev.discountBanner,
            categoryBanners: (incoming.categoryBanners || incoming.category_banners)
              ? { ...prev.categoryBanners, ...(incoming.categoryBanners || incoming.category_banners) }
              : prev.categoryBanners,
          };
          try {
            localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(merged));
          } catch {}
          return merged;
        });
      } else {
        refreshSettings();
      }
    };

    window.addEventListener('kala:sync:settings_updated', handleLiveSettings);
    return () => window.removeEventListener('kala:sync:settings_updated', handleLiveSettings);
  }, [refreshSettings]);

  return (
    <SettingsContext.Provider value={{ settings, refreshSettings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
