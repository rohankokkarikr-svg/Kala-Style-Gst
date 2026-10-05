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
      stock_quantity = 0, is_in_stock = true, image_url, barcode,
      artisan_id, is_handmade, material, style, ai_generated, ai_suggested_price, tags,
      status, images
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
      ...(images !== undefined ? { images: Array.isArray(images) ? images.filter(Boolean) : [images] } : {}),
      ...(targetArtisanId ? { artisan_id: targetArtisanId } : {}),
      ...(is_handmade !== undefined ? { is_handmade } : { is_handmade: true }),
      ...(material ? { material } : {}),
      ...(style ? { style } : {}),
      ...(ai_generated !== undefined ? { ai_generated } : {}),
      ...(ai_suggested_price ? { ai_suggested_price } : {}),
      ...(tags ? { tags } : {}),
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
      stock_quantity, is_in_stock, image_url, barcode,
      artisan_id, is_handmade, material, style, ai_generated, ai_suggested_price, tags, status,
      images
    } = req.body;

    const updatePayload = { 
      name, description, price, original_price, category, subcategory, sizes, 
      stock_quantity, is_in_stock, image_url,
      barcode: barcode ? barcode.trim() : null,
      artisan_id, is_handmade, material, style, ai_generated, ai_suggested_price, tags
    };
    if (status !== undefined) updatePayload.status = status;
    if (images !== undefined) {
      const imgArr = Array.isArray(images) ? images.filter(Boolean) : (images ? [images] : []);
      updatePayload.images = imgArr;
      if (!updatePayload.image_url && imgArr.length > 0) {
        updatePayload.image_url = imgArr[0];
      }
    }

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

// Helper for bulletproof upload: attempts Cloudinary first (if configured), falls back to Supabase Storage
const processMediaUpload = async (req) => {
  const { cloudinary } = require('../config/cloudinary');
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();
  const hasCloudinary = Boolean(cloudName && apiKey && apiSecret);

  if (process.env.NODE_ENV === 'test' || process.env.MOCK_CLOUDINARY === 'true') {
    return 'https://res.cloudinary.com/mock-cloud/image/upload/mock-artisan-photo.jpg';
  }

  // Already a URL?
  if (req.file && (req.file.secure_url || req.file.path || req.file.url)) {
    return req.file.secure_url || req.file.path || req.file.url;
  }
  if (req.body && typeof req.body.image === 'string' && (req.body.image.startsWith('http://') || req.body.image.startsWith('https://'))) {
    return req.body.image;
  }

  let buffer = null;
  let mimetype = 'image/jpeg';
  let ext = 'jpg';

  if (req.file && req.file.buffer) {
    buffer = req.file.buffer;
    mimetype = req.file.mimetype || 'image/jpeg';
    const origExt = (req.file.originalname || '').split('.').pop();
    if (origExt && origExt.length <= 4) ext = origExt.toLowerCase();
  } else if (req.body && req.body.image) {
    const raw = req.body.image;
    const match = raw.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimetype = match[1];
      buffer = Buffer.from(match[2], 'base64');
      if (mimetype.includes('png')) ext = 'png';
      else if (mimetype.includes('webp')) ext = 'webp';
      else if (mimetype.includes('gif')) ext = 'gif';
    } else {
      buffer = Buffer.from(raw, 'base64');
    }
  }

  if (!buffer) {
    return null;
  }

  // 1. Try Cloudinary if keys are present
  if (hasCloudinary) {
    try {
      const base64Data = `data:${mimetype};base64,${buffer.toString('base64')}`;
      const uploadRes = await cloudinary.uploader.upload(base64Data, {
        folder: 'kalastyle-artisan-marketplace',
        resource_type: 'auto',
        timeout: 45000,
      });
      const cUrl = uploadRes.secure_url || uploadRes.url;
      if (cUrl) return cUrl;
    } catch (cErr) {
      console.warn('⚠️ Cloudinary upload attempt failed, falling back to Supabase Storage:', cErr.message);
    }
  }

  // 2. Fallback to Supabase Storage (always available on Render via SUPABASE_SERVICE_KEY)
  const filename = `products/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
  try {
    let uploadRes = await supabase.storage
      .from('product-images')
      .upload(filename, buffer, { contentType: mimetype, upsert: true });

    if (uploadRes.error) {
      console.warn('⚠️ product-images bucket notice:', uploadRes.error.message, '- trying site-config bucket');
      uploadRes = await supabase.storage
        .from('site-config')
        .upload(filename, buffer, { contentType: mimetype, upsert: true });
    }

    if (uploadRes.data?.path) {
      const bucket = uploadRes.error ? 'site-config' : 'product-images';
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(uploadRes.data.path);
      if (urlData?.publicUrl) {
        return urlData.publicUrl;
      }
    }
    if (uploadRes.error) throw uploadRes.error;
  } catch (sErr) {
    console.error('❌ Supabase storage upload error:', sErr.message);
    throw new Error(`Media storage upload failed: ${sErr.message}`);
  }

  throw new Error('Could not upload media');
};

exports.uploadProductImage = async (req, res) => {
  try {
    const imageUrl = await processMediaUpload(req);

    if (!imageUrl) {
      return res.status(400).json({ error: 'Please upload a file or image data' });
    }

    const { data: currentProduct } = await supabase
      .from('products')
      .select('images')
      .eq('id', req.params.id)
      .maybeSingle();

    let imagesList = [];
    if (currentProduct?.images) {
      imagesList = Array.isArray(currentProduct.images) ? [...currentProduct.images] : [currentProduct.images];
    }
    if (!imagesList.includes(imageUrl)) {
      imagesList.unshift(imageUrl);
    }

    const { data, error } = await supabase
      .from('products')
      .update({ image_url: imageUrl, images: imagesList })
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
    const imageUrl = await processMediaUpload(req);

    if (!imageUrl) {
      return res.status(400).json({ error: 'No image file or image data received' });
    }

    res.json({ imageUrl, url: imageUrl, secure_url: imageUrl });
  } catch (error) {
    console.error('Direct Upload Error:', error);
    res.status(500).json({ error: error.message || 'Server Error during direct upload' });
  }
};


