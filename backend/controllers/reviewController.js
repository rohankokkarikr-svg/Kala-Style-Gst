const { safeQuery } = require('../config/supabase');
const supabase = require('../config/supabase');

// Fallback reviews if table doesn't exist yet
const FALLBACK_REVIEWS = [
  {
    id: 'fallback-1',
    customer_name: 'Priya Sharma',
    image_url: null,
    rating: 5,
    review_text: "The Pure Katan Banarasi Silk Saree arrived in breathtaking quality with authentic Zari weaving. Supporting real Indian weavers directly feels wonderful.",
    product_name: 'Pure Katan Banarasi Silk Saree',
    is_approved: true
  },
  {
    id: 'fallback-2',
    customer_name: 'Rajesh Iyer',
    image_url: null,
    rating: 5,
    review_text: "The Channapatna wooden crafts and lacquer finish are 100% genuine and safe for children. True royal heritage craftsmanship.",
    product_name: 'Handcrafted Wooden Ambari Elephant',
    is_approved: true
  },
  {
    id: 'fallback-3',
    customer_name: 'Meenakshi Sundaram',
    image_url: null,
    rating: 5,
    review_text: "The 22K gold foil Tanjore painting with teak frame exceeded all expectations. Packaged with extreme care and museum quality.",
    product_name: 'Royal Tanjore 22K Gold Foil Painting',
    is_approved: true
  },
  {
    id: 'fallback-4',
    customer_name: 'Ananya Roy',
    image_url: null,
    rating: 5,
    review_text: "Authentic Kashmiri Pashmina with exquisite Sozni needle embroidery. The warmth and softness are unmatched.",
    product_name: 'Kashmiri Hand-Embroidered Pashmina Shawl',
    is_approved: true
  }
];


let cachedReviews = [];

exports.getApprovedReviews = async (req, res) => {
  try {
    const { product_name } = req.query;

    if (product_name && product_name.trim()) {
      const cleanName = product_name.trim();

      // Query for matches by product_name
      let { data, error } = await safeQuery(async () => {
        return await supabase
          .from('reviews')
          .select('*')
          .eq('is_approved', true)
          .ilike('product_name', `%${cleanName}%`)
          .order('created_at', { ascending: false });
      });

      // If no match and query has multiple words, search with first few keywords
      if ((!data || data.length === 0) && cleanName.length > 8) {
        const words = cleanName.split(/\s+/).filter(w => w.length > 2).slice(0, 3).join(' ');
        if (words && words !== cleanName) {
          const fallbackRes = await safeQuery(async () => {
            return await supabase
              .from('reviews')
              .select('*')
              .eq('is_approved', true)
              .ilike('product_name', `%${words}%`)
              .order('created_at', { ascending: false });
          });
          if (fallbackRes.data && fallbackRes.data.length > 0) {
            data = fallbackRes.data;
          }
        }
      }

      return res.json(data || []);
    }

    // If no product_name specified, return recent approved reviews
    const { data, error } = await safeQuery(async () => {
      return await supabase
        .from('reviews')
        .select('*')
        .eq('is_approved', true)
        .order('created_at', { ascending: false })
        .limit(30);
    });

    if (error) {
      if (error.code === '42P01') {
        return res.json([...cachedReviews.filter(r => r.is_approved), ...FALLBACK_REVIEWS]);
      }
      throw error;
    }

    res.json(data && data.length > 0 ? data : FALLBACK_REVIEWS);
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.json(req.query.product_name ? [] : FALLBACK_REVIEWS);
  }
};

exports.getAllReviews = async (req, res) => {
  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('reviews')
        .select('*')
        .order('created_at', { ascending: false })
    );

    if (error) {
      if (error.code === '42P01') {
        return res.json([...cachedReviews, ...FALLBACK_REVIEWS]);
      }
      throw error;
    }

    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
};

// Helper to sanitize user text against Stored XSS
const sanitizeText = (str) => String(str || '').replace(/<[^>]*>?/gm, '').trim();

exports.submitReview = async (req, res) => {
  try {
    const { customer_name, product_name, rating, review_text, image_url } = req.body;

    const finalCustomerName = (customer_name || req.user?.name || 'Verified Buyer').trim();
    const finalProductName = (product_name || 'Authentic Handcraft').trim();

    if (!finalCustomerName || !finalProductName || !rating || !review_text) {
      return res.status(400).json({ error: 'Please provide rating, review text, and your name.' });
    }

    const newReview = {
      user_id: req.user ? req.user.id : null,
      customer_name: finalCustomerName,
      product_name: finalProductName,
      rating: Math.max(1, Math.min(5, Number(rating) || 5)),
      review_text: String(review_text).trim(),
      image_url: image_url ? String(image_url).trim() : null,
      is_approved: true // Live immediately on product page and in admin moderation
    };

    const { data, error } = await supabase
      .from('reviews')
      .insert([newReview])
      .select()
      .single();

    if (error) {
      if (error.code === '42P01') {
        const memReview = { ...newReview, id: 'mem-' + Date.now(), created_at: new Date().toISOString() };
        cachedReviews.unshift(memReview);
        return res.status(201).json(memReview);
      }
      throw error;
    }

    if (data && data.id) {
      try {
        const { emitEvent } = require('../ai/aiEventBus');
        emitEvent('REVIEW_CREATED', 'review', data.id, {
          rating: data.rating,
          customer: data.customer_name,
          product_name: data.product_name,
        });
      } catch (e) {}
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ error: 'Failed to submit review' });
  }
};

exports.approveReview = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (id.startsWith('mem-') || id.startsWith('fallback-')) {
      const idx = cachedReviews.findIndex(r => r.id === id);
      if (idx !== -1) cachedReviews[idx].is_approved = true;
      const fIdx = FALLBACK_REVIEWS.findIndex(r => r.id === id);
      if (fIdx !== -1) FALLBACK_REVIEWS[fIdx].is_approved = true;
      return res.json({ message: 'Review approved' });
    }

    const { error } = await supabase
      .from('reviews')
      .update({ is_approved: true })
      .eq('id', id);

    if (error) throw error;
    
    res.json({ message: 'Review approved successfully' });
  } catch (error) {
    console.error('Error approving review:', error);
    res.status(500).json({ error: 'Failed to approve review' });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (id.startsWith('mem-') || id.startsWith('fallback-')) {
      cachedReviews = cachedReviews.filter(r => r.id !== id);
      return res.json({ message: 'Review deleted' });
    }

    const { error } = await supabase
      .from('reviews')
      .delete()
      .eq('id', id);

    if (error) throw error;
    
    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ error: 'Failed to delete review' });
  }
};
