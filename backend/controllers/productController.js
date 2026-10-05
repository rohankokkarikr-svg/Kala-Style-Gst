const { safeQuery, formatSupabaseError } = require('../config/supabase');
const supabase = require('../config/supabase');
const { HANDICRAFT_CATEGORIES } = require('../data/handicraftsData');

let productCache = {
  all: { data: null, timestamp: 0 },
  featured: { data: null, timestamp: 0 }
};
const CACHE_TTL = 60000; // 60 seconds

const invalidateCache = () => {
  productCache.all = { data: null, timestamp: 0 };
  productCache.featured = { data: null, timestamp: 0 };
};
exports.invalidateCache = invalidateCache;

// Canonical category mappings (slugs, variations, URL-encoded names, and lowercase names -> exact DB category name)
const CATEGORY_MAP = {
  // Handloom & Textiles
  'handloom-textiles': 'Handloom & Textiles',
  'handloom & textiles': 'Handloom & Textiles',
  'handloom and textiles': 'Handloom & Textiles',
  'handloom': 'Handloom & Textiles',
  'textiles': 'Handloom & Textiles',

  // Home Décor & Furnishings
  'home-decor-furnishings': 'Home Décor & Furnishings',
  'home-decor': 'Home Décor & Furnishings',
  'home decor & furnishings': 'Home Décor & Furnishings',
  'home decor and furnishings': 'Home Décor & Furnishings',
  'home décor & furnishings': 'Home Décor & Furnishings',
  'home décor and furnishings': 'Home Décor & Furnishings',
  'home decor': 'Home Décor & Furnishings',
  'home décor': 'Home Décor & Furnishings',
  'homedecor': 'Home Décor & Furnishings',

  // Handmade Jewelry & Accessories
  'handmade-jewelry-accessories': 'Handmade Jewelry & Accessories',
  'handmade-jewelry': 'Handmade Jewelry & Accessories',
  'handmade jewelry & accessories': 'Handmade Jewelry & Accessories',
  'handmade jewelry and accessories': 'Handmade Jewelry & Accessories',
  'handmade jewelry': 'Handmade Jewelry & Accessories',
  'jewelry': 'Handmade Jewelry & Accessories',
  'jewellery': 'Handmade Jewelry & Accessories',
  'accessories': 'Handmade Jewelry & Accessories',

  // Pottery & Terracotta
  'pottery-terracotta': 'Pottery & Terracotta',
  'pottery & terracotta': 'Pottery & Terracotta',
  'pottery and terracotta': 'Pottery & Terracotta',
  'pottery': 'Pottery & Terracotta',
  'terracotta': 'Pottery & Terracotta',

  // Wooden Handicrafts
  'wooden-handicrafts': 'Wooden Handicrafts',
  'wooden handicrafts': 'Wooden Handicrafts',
  'woodcraft': 'Wooden Handicrafts',
  'wooden': 'Wooden Handicrafts',
  'woodwork': 'Wooden Handicrafts',

  // Traditional Paintings & Wall Art
  'traditional-paintings-wall-art': 'Traditional Paintings & Wall Art',
  'traditional-paintings': 'Traditional Paintings & Wall Art',
  'traditional paintings & wall art': 'Traditional Paintings & Wall Art',
  'traditional paintings and wall art': 'Traditional Paintings & Wall Art',
  'traditional paintings': 'Traditional Paintings & Wall Art',
  'paintings': 'Traditional Paintings & Wall Art',
  'wall art': 'Traditional Paintings & Wall Art',

  // Eco-Friendly & Natural Products
  'eco-friendly-natural-products': 'Eco-Friendly & Natural Products',
  'eco-friendly & natural products': 'Eco-Friendly & Natural Products',
  'eco-friendly and natural products': 'Eco-Friendly & Natural Products',
  'eco-friendly': 'Eco-Friendly & Natural Products',
  'eco friendly': 'Eco-Friendly & Natural Products',
  'natural products': 'Eco-Friendly & Natural Products',
};

exports.getCategories = async (req, res) => {
  try {
    const { data, error } = await safeQuery(() =>
      supabase.from('categories').select('*').order('name')
    );

    if (error) {
      console.error('getCategories database error:', error.message);
      return res.status(500).json({ error: 'Database unavailable: Could not fetch categories from database.' });
    }

    let result = data || [];
    try {
      const { readSettings } = require('./settingsController');
      const settings = readSettings();
      const banners = settings?.categoryBanners || {};
      result = result.map(c => {
        const slug = c.slug || c.name?.toLowerCase().replace(/\s+/g, '-');
        const b = banners[slug] || banners[c.name?.toLowerCase()] || {};
        return {
          ...c,
          video_url: c.video_url || b.videoUrl || '',
          banner_image: c.banner_image || b.imageUrl || c.image_url || ''
        };
      });
    } catch (_) {}

    return res.json(result);
  } catch (err) {
    console.error('getCategories error:', err.message);
    res.status(500).json({ error: 'Database unavailable or categories query failed' });
  }
};

/**
 * Ensures 4–5 styled variants of the same product image are available.
 * Applies Studio, Lifestyle, Craft Detail, and Festive Showcase transformations.
 */
function generateStyledProductImages(primaryUrl, existingImages = [], tags = []) {
  let images = [];
  if (Array.isArray(existingImages) && existingImages.length > 0) {
    images = existingImages.filter(Boolean);
  } else if (typeof existingImages === 'string') {
    try {
      const parsed = JSON.parse(existingImages);
      if (Array.isArray(parsed)) images = parsed.filter(Boolean);
    } catch (_) {}
  }

  // Check tags for __IMAGES__: fallback
  if (images.length === 0 && Array.isArray(tags)) {
    const imgTag = tags.find(t => typeof t === 'string' && t.startsWith('__IMAGES__:'));
    if (imgTag) {
      try {
        const parsed = JSON.parse(imgTag.replace('__IMAGES__:', ''));
        if (Array.isArray(parsed)) images = parsed.filter(Boolean);
      } catch (_) {}
    }
  }

  // If already has 3 or more distinct images, return them (capped at 5)
  if (images.length >= 3) {
    return [...new Set(images)].slice(0, 5);
  }

  const base = primaryUrl || (images.length > 0 ? images[0] : null);
  if (!base) return images;

  const result = images.length > 0 ? [...images] : [base];
  if (!result.includes(base)) result.unshift(base);

  if (base.includes('/image/upload/')) {
    const transforms = [
      'e_improve,e_sharpen:90,f_auto,q_auto',
      'e_vibrance:40,e_tint:equalize:15:gold,f_auto,q_auto',
      'c_crop,g_auto,h_800,w_800,z_1.4,e_sharpen:110,f_auto,q_auto',
      'e_contrast:25,e_saturation:25,e_sharpen:80,f_auto,q_auto',
    ];
    for (const tr of transforms) {
      if (result.length >= 5) break;
      const styledUrl = base.replace('/image/upload/', `/image/upload/${tr}/`);
      if (!result.includes(styledUrl)) {
        result.push(styledUrl);
      }
    }
  } else if (base.startsWith('http')) {
    const transforms = [
      'e_improve,e_sharpen:90,f_auto,q_auto',
      'e_vibrance:40,e_tint:equalize:15:gold,f_auto,q_auto',
      'c_crop,g_auto,h_800,w_800,z_1.4,e_sharpen:110,f_auto,q_auto',
      'e_contrast:25,e_saturation:25,e_sharpen:80,f_auto,q_auto',
    ];
    for (const tr of transforms) {
      if (result.length >= 5) break;
      const styledUrl = `https://res.cloudinary.com/dcmmxmikz/image/fetch/${tr}/${encodeURIComponent(base)}`;
      if (!result.includes(styledUrl)) {
        result.push(styledUrl);
      }
    }
  }

  return [...new Set(result)].slice(0, 5);
}

exports.getProducts = async (req, res) => {
  try {
    const { category, subcategory, search, material, is_handmade, artisan_id, min_price, max_price, sort } = req.query;
    
    // Check cache for basic requests (no search/filter)
    const isBasicRequest = (!category || category === 'all') && (!subcategory || subcategory === 'all') && !search && !material && !is_handmade && !artisan_id && !min_price && !max_price && (!sort || sort === 'popular' || sort === 'newest');
    if (isBasicRequest && productCache.all.data && productCache.all.data.length > 0 && (Date.now() - productCache.all.timestamp < CACHE_TTL)) {
      return res.json(productCache.all.data);
    }

    const { data, error } = await safeQuery(async () => {
      let query = supabase.from('products').select('*, artisan_profiles(id, store_name, location, specialization, verification_status)').order('created_at', { ascending: false });

      // For public shoppers (no specific artisan query), strictly show approved, non-hidden products only
      if (!artisan_id) {
        query = query.neq('is_hidden', true);
        query = query.or('status.eq.approved,status.is.null');
      }

      if (category && category !== 'all') {
        let cleanCat = category.trim();
        try { cleanCat = decodeURIComponent(cleanCat); } catch (_) {}
        cleanCat = cleanCat.trim().toLowerCase();
        const canonical = CATEGORY_MAP[cleanCat] || CATEGORY_MAP[cleanCat.replace(/\s+/g, '-')];
        if (canonical) {
          query = query.eq('category', canonical);
        } else {
          // If not in canonical map, search category or subcategory
          query = query.or(`category.ilike.%${cleanCat}%,subcategory.ilike.%${cleanCat}%`);
        }
      }

      if (subcategory && subcategory !== 'all') {
        let cleanSub = subcategory.trim();
        try { cleanSub = decodeURIComponent(cleanSub); } catch (_) {}
        query = query.ilike('subcategory', `%${cleanSub}%`);
      }

      if (search) {
        const cleanTerm = search.trim();
        query = query.or(`name.ilike.%${cleanTerm}%,description.ilike.%${cleanTerm}%,category.ilike.%${cleanTerm}%,material.ilike.%${cleanTerm}%,style.ilike.%${cleanTerm}%`);
      }
      if (sort === 'price_asc' || sort === 'price-asc') {
        query = query.order('price', { ascending: true });
      } else if (sort === 'price_desc' || sort === 'price-desc') {
        query = query.order('price', { ascending: false });
      }
      if (material && material !== 'all') {
        query = query.ilike('material', `%${material}%`);
      }
      if (min_price) {
        query = query.gte('price', Number(min_price));
      }
      if (max_price) {
        query = query.lte('price', Number(max_price));
      }
      if (is_handmade === 'true') {
        query = query.eq('is_handmade', true);
      }
      if (artisan_id) {
        query = query.eq('artisan_id', artisan_id);
      }
      return await query;
    });

    if (error) {
      console.error('getProducts safeQuery error:', error);
      throw error;
    }

    let filteredData = data || [];

    // Further sanitize raw data: shoppers only see approved, visible products
    if (!artisan_id) {
      filteredData = filteredData.filter(p => !p.is_hidden && (p.status === 'approved' || !p.status));
    }

    // Exclude any legacy demo menswear products if present in DB
    const DEMO_KEYWORDS = ['t-shirt', 'jean', 'sweatpant', 'hoodie', 'mens jacket', 'casual trouser'];
    filteredData = filteredData.filter(p => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      const isDemo = DEMO_KEYWORDS.some(k => cat.includes(k) || (name.includes(k) && !cat.includes('handloom') && !cat.includes('textile')));
      return !isDemo;
    });

    filteredData = filteredData.map(p => ({
      ...p,
      images: generateStyledProductImages(p.image_url, p.images, p.tags),
    }));

    if (isBasicRequest && filteredData.length > 0) {
      productCache.all = { data: filteredData, timestamp: Date.now() };
    }

    res.json(filteredData);
  } catch (error) {
    console.error('Products Fetch Error:', error.message || error);
    const friendly = formatSupabaseError(error);
    res.status(friendly ? 503 : 500).json(friendly || { error: 'Failed to fetch products' });
  }
};

exports.getFeaturedProducts = async (req, res) => {
  try {
    if (productCache.featured.data && (Date.now() - productCache.featured.timestamp < CACHE_TTL)) {
      return res.json(productCache.featured.data);
    }

    const { data, error } = await safeQuery(() => 
      supabase
        .from('products')
        .select('*, artisan_profiles(id, store_name, location, specialization)')
        .neq('is_hidden', true)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(9)
    );

    if (error) throw error;
    
    let filteredData = (data || []).filter(p => !p.is_hidden && (p.status === 'approved' || !p.status)).slice(0, 8);
    filteredData = filteredData.map(p => ({
      ...p,
      images: generateStyledProductImages(p.image_url, p.images, p.tags),
    }));
    
    productCache.featured = { data: filteredData, timestamp: Date.now() };
    
    res.json(filteredData);
  } catch (error) {
    console.error('Featured Products Fetch Error:', error);
    const friendly = formatSupabaseError(error);
    res.status(friendly ? 503 : 500).json(friendly || { error: 'Server Error' });
  }
};


exports.getProductById = async (req, res) => {
  try {
    let { data, error } = await supabase
      .from('products')
      .select('*, artisan_profiles(id, store_name, artisan_type, location, specialization, bio, profile_image, verification_status, years_of_experience, user_id)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (data) {
      if (data.is_hidden) {
        return res.status(404).json({ error: 'This product is currently hidden.' });
      }
      if (data.status && data.status !== 'approved') {
        const isPrivileged = req.user && (req.user.role === 'admin' || req.user.role === 'artisan');
        if (!isPrivileged) {
          return res.status(403).json({ error: 'This product is currently under admin review and awaiting approval.' });
        }
      }

      // If artisan_profiles is null, try looking up by artisan_id or user_id
      if (!data.artisan_profiles && data.artisan_id) {
        try {
          const { data: prof } = await supabase
            .from('artisan_profiles')
            .select('id, store_name, artisan_type, location, specialization, bio, profile_image, verification_status, years_of_experience, user_id')
            .or(`id.eq.${data.artisan_id},user_id.eq.${data.artisan_id}`)
            .maybeSingle();
          if (prof) data.artisan_profiles = prof;
        } catch (e) {
          console.warn('Artisan profile lookup notice:', e.message);
        }
      }

      // Normalize real artisan data and clean bio
      if (data.artisan_profiles) {
        const { parseArtisanUpi } = require('./authController');
        const parsed = parseArtisanUpi(data.artisan_profiles);
        data.artisan_profiles = parsed;
        data.artisan_name = parsed.store_name || data.artisan_name || 'Independent Artisan';
        data.artisan_avatar = parsed.profile_image || data.artisan_avatar;
        data.artisan_location = parsed.location || data.artisan_location;
        data.artisan_bio = parsed.bio || data.artisan_bio;
        data.artisan_type = parsed.artisan_type || data.artisan_type || 'Artisan';
        data.artisan_specialization = parsed.specialization || data.artisan_specialization;
      } else {
        data.artisan_name = data.artisan_name || 'Master Craftsman (Artisan Guild)';
        data.artisan_location = data.artisan_location || 'India';
        data.artisan_type = data.artisan_type || 'Artisan';
      }

      // Ensure rating and review counts strictly agree with approved reviews
      try {
        const { data: revStats } = await supabase
          .from('reviews')
          .select('rating')
          .eq('product_id', data.id)
          .eq('is_approved', true);
        if (revStats && revStats.length > 0) {
          const sum = revStats.reduce((acc, r) => acc + (Number(r.rating) || 5), 0);
          data.rating = Number((sum / revStats.length).toFixed(1));
          data.reviews_count = revStats.length;
        } else {
          data.rating = null;
          data.reviews_count = 0;
        }
      } catch (revErr) {
        console.warn('Review stats agreement check notice:', revErr.message);
      }

      // Ensure 3–5 styled images of the same product are provided for gallery
      data.images = generateStyledProductImages(data.image_url, data.images, data.tags);

      return res.json(data);
    }

    res.status(404).json({ error: 'Product not found' });
  } catch (error) {
    console.error('getProductById Error:', error);
    res.status(500).json({ error: 'Server Error' });
  }
};


exports.createProduct = async (req, res) => {
  try {
    const {
      name, description, price, original_price, category, subcategory, sizes,
      stock_quantity = 0, is_in_stock = true, image_url, images, barcode,
      artisan_id, is_handmade, material, style, ai_generated, ai_suggested_price, tags,
      status
    } = req.body;

    // Reliably resolve artisan_id from authenticated user session or body
    let targetArtisanId = artisan_id || null;

    if (req.user) {
      if (req.user.role === 'artisan') {
        // Authenticated artisan always attributes product to their own artisan profile
        let { data: profile } = await supabase
          .from('artisan_profiles')
          .select('id')
          .eq('user_id', req.user.id)
          .maybeSingle();

        if (!profile) {
          // Auto-create profile if missing so product is never orphaned
          const { data: newProfile } = await supabase
            .from('artisan_profiles')
            .insert([{
              user_id: req.user.id,
              store_name: req.user.name || 'Artisan Studio',
              artisan_type: 'Artisan',
              verification_status: 'verified'
            }])
            .select('id')
            .single();
          targetArtisanId = newProfile?.id || req.user.id;
        } else {
          targetArtisanId = profile.id;
        }
      } else if (req.user.role === 'admin') {
        // If admin specified an artisan_id, honor it!
        if (artisan_id) {
          let { data: targetProfile } = await supabase
            .from('artisan_profiles')
            .select('id')
            .or(`id.eq.${artisan_id},user_id.eq.${artisan_id}`)
            .maybeSingle();
          targetArtisanId = targetProfile?.id || artisan_id;
        } else {
          // If admin didn't specify, check if admin has an artisan profile or use first artisan
          let { data: profile } = await supabase
            .from('artisan_profiles')
            .select('id')
            .eq('user_id', req.user.id)
            .maybeSingle();
          targetArtisanId = profile?.id || null;
        }
      }
    }

    const finalPrice = Number(price) || 0;
    const finalOrigPrice = original_price ? Number(original_price) : Math.round(finalPrice * 1.2);
    const productStatus = status || 'pending';

    const finalImages = generateStyledProductImages(image_url, images, tags);
    let finalTags = Array.isArray(tags) ? [...tags] : [];
    if (finalImages.length > 0 && !finalTags.some(t => typeof t === 'string' && t.startsWith('__IMAGES__:'))) {
      finalTags.push(`__IMAGES__:${JSON.stringify(finalImages)}`);
    }

    const insertPayload = {
      name,
      description,
      price: finalPrice,
      original_price: finalOrigPrice,
      category: category || 'Handicrafts',
      subcategory: subcategory || null,
      sizes: sizes || ['Free Size'],
      stock_quantity: Number(stock_quantity) || 0,
      is_in_stock: is_in_stock !== undefined ? is_in_stock : true,
      status: productStatus,
      barcode: barcode ? barcode.trim() : null,
      ...(image_url ? { image_url } : {}),
      ...(finalImages.length > 0 ? { images: finalImages } : {}),
      ...(targetArtisanId ? { artisan_id: targetArtisanId } : {}),
      ...(is_handmade !== undefined ? { is_handmade } : { is_handmade: true }),
      ...(material ? { material } : {}),
      ...(style ? { style } : {}),
      ...(ai_generated !== undefined ? { ai_generated } : {}),
      ...(ai_suggested_price ? { ai_suggested_price } : {}),
      ...(finalTags.length > 0 ? { tags: finalTags } : {}),
    };

    const { data, error } = await supabase
      .from('products')
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Barcode already exists. Please use a unique barcode.' });
      }
      throw error;
    }

    invalidateCache();
    const { broadcastSync } = require('../utils/realtime');
    broadcastSync('PRODUCTS_UPDATED', { action: 'create', product: data });

    try {
      const { emitEvent } = require('../ai/aiEventBus');
      emitEvent('PRODUCT_SUBMITTED', 'product', data.id, {
        name: data.name,
        price: data.price,
        artisan_id: data.artisan_id,
        category: data.category,
      });
    } catch (e) {}

    res.status(201).json(data);
  } catch (error) {
    console.error('createProduct error:', error);
    res.status(500).json({ error: error.message || 'Server Error' });
  }
};


exports.updateProduct = async (req, res) => {
  try {
    const { 
      name, description, price, original_price, category, subcategory, sizes, 
      stock_quantity, is_in_stock, image_url, images, barcode,
      artisan_id, is_handmade, material, style, ai_generated, ai_suggested_price, tags, status
    } = req.body;

    const finalImages = generateStyledProductImages(image_url, images, tags);
    let finalTags = tags ? (Array.isArray(tags) ? [...tags] : []) : undefined;
    if (finalTags && finalImages.length > 0 && !finalTags.some(t => typeof t === 'string' && t.startsWith('__IMAGES__:'))) {
      finalTags.push(`__IMAGES__:${JSON.stringify(finalImages)}`);
    }

    const updatePayload = { 
      name, description, price, original_price, category, subcategory, sizes, 
      stock_quantity, is_in_stock, image_url,
      barcode: barcode ? barcode.trim() : null,
      artisan_id, is_handmade, material, style, ai_generated, ai_suggested_price,
      ...(finalTags !== undefined ? { tags: finalTags } : {}),
      ...(finalImages.length > 0 ? { images: finalImages } : {}),
    };
    if (status !== undefined) updatePayload.status = status;

    const { data, error } = await supabase
      .from('products')
      .update(updatePayload)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Barcode already exists. Please use a unique barcode.' });
      }
      throw error;
    }
    
    invalidateCache();
    const { broadcastSync } = require('../utils/realtime');
    broadcastSync('PRODUCTS_UPDATED', { action: 'update', id: req.params.id, product: data });
    res.json(data);
  } catch (error) {
    console.error('Update Error:', error);
    res.status(500).json({ error: error.message || 'Server Error' });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    
    invalidateCache();
    const { broadcastSync } = require('../utils/realtime');
    broadcastSync('PRODUCTS_UPDATED', { action: 'delete', id: req.params.id });
    res.json({ message: 'Product removed' });
  } catch (error) {
    res.status(500).json({ error: 'Server Error' });
  }
};

exports.uploadProductImage = async (req, res) => {
  try {
    const { cloudinary } = require('../config/cloudinary');
    let imageUrl = null;

    if (process.env.NODE_ENV === 'test' || process.env.MOCK_CLOUDINARY === 'true') {
      imageUrl = 'https://res.cloudinary.com/mock-cloud/image/upload/mock-artisan-photo.jpg';
    } else if (req.file && req.file.buffer) {
      const mime = req.file.mimetype || 'image/jpeg';
      const base64Data = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
      const uploadRes = await cloudinary.uploader.upload(base64Data, {
        folder: 'kalastyle-artisan-marketplace',
        resource_type: 'auto'
      });
      imageUrl = uploadRes.secure_url || uploadRes.url;
    } else if (req.file && (req.file.secure_url || req.file.path || req.file.url)) {
      imageUrl = req.file.secure_url || req.file.path || req.file.url;
    } else if (req.body && req.body.image) {
      const uploadRes = await cloudinary.uploader.upload(req.body.image, {
        folder: 'kalastyle-artisan-marketplace',
        resource_type: 'auto'
      });
      imageUrl = uploadRes.secure_url || uploadRes.url;
    }

    if (!imageUrl) {
      return res.status(400).json({ error: 'Please upload a file or image data' });
    }

    const { data, error } = await supabase
      .from('products')
      .update({ image_url: imageUrl })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    
    invalidateCache();
    res.json(data);
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ error: error.message || 'Server Error during upload' });
  }
};

exports.uploadDirect = async (req, res) => {
  try {
    const { cloudinary } = require('../config/cloudinary');
    let imageUrl = null;

    if (process.env.NODE_ENV === 'test' || process.env.MOCK_CLOUDINARY === 'true') {
      imageUrl = 'https://res.cloudinary.com/mock-cloud/image/upload/mock-artisan-photo.jpg';
    } else if (req.file && req.file.buffer) {
      const mime = req.file.mimetype || 'image/jpeg';
      const base64Data = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
      const uploadRes = await cloudinary.uploader.upload(base64Data, {
        folder: 'kalastyle-artisan-marketplace',
        resource_type: 'auto'
      });
      imageUrl = uploadRes.secure_url || uploadRes.url;
    } else if (req.file && (req.file.secure_url || req.file.path || req.file.url)) {
      imageUrl = req.file.secure_url || req.file.path || req.file.url;
    } else if (req.body && req.body.image) {
      const uploadRes = await cloudinary.uploader.upload(req.body.image, {
        folder: 'kalastyle-artisan-marketplace',
        resource_type: 'auto'
      });
      imageUrl = uploadRes.secure_url || uploadRes.url;
    }

    if (!imageUrl) {
      return res.status(400).json({ error: 'No image file or image data received' });
    }

    res.json({ imageUrl, url: imageUrl, secure_url: imageUrl });
  } catch (error) {
    console.error('Direct Upload Error:', error);
    res.status(500).json({ error: error.message || 'Server Error during direct upload' });
  }
};


