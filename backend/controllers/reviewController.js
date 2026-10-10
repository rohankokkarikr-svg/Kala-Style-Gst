const { safeQuery } = require('../config/supabase');
const supabase = require('../config/supabase');

// In-memory cache for fast review lookups
let cachedReviews = [];

// Helper to sanitize user text against Stored XSS and injection
const sanitizeText = (str) =>
  String(str || '')
    .replace(/<[^>]*>?/gm, '')
    .trim();

/**
 * GET /api/reviews
 * Returns only approved reviews for a given product or catalog.
 * Never returns fabricated fallback reviews.
 */
exports.getApprovedReviews = async (req, res) => {
  try {
    const { product_name, product_id } = req.query;

    let query = supabase
      .from('reviews')
      .select('*')
      .eq('is_approved', true)
      .order('created_at', { ascending: false });

    if (product_name && product_name.trim()) {
      const cleanName = sanitizeText(product_name);
      query = query.ilike('product_name', `%${cleanName}%`);
    }

    const { data, error } = await safeQuery(async () => query);

    if (error) {
      if (error.code === '42P01') {
        // Table not yet migrated
        const approvedMem = cachedReviews.filter((r) => r.is_approved);
        return res.json(approvedMem);
      }
      throw error;
    }

    let results = Array.isArray(data) ? data : [];

    // Ensure reviews returned are strictly approved and enrich is_verified_buyer
    results = results
      .filter((r) => r.is_approved === true)
      .map(r => ({
        ...r,
        is_verified_buyer: r.is_verified_buyer !== undefined ? Boolean(r.is_verified_buyer) : Boolean(r.user_id)
      }));

    res.json(results);
  } catch (error) {
    console.error('Error fetching approved reviews:', error.message || error);
    res.json([]);
  }
};

/**
 * GET /api/reviews/admin
 * Returns all reviews (approved and pending moderation) for admin review dashboard.
 */
exports.getAllReviews = async (req, res) => {
  try {
    const { rating } = req.query;

    let query = supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false });

    if (rating) {
      query = query.eq('rating', Number(rating));
    }

    const { data, error } = await safeQuery(() => query);

    if (error) {
      if (error.code === '42P01') {
        return res.json(cachedReviews);
      }
      throw error;
    }

    const enriched = (data || []).map(r => ({
      ...r,
      is_verified_buyer: r.is_verified_buyer !== undefined ? Boolean(r.is_verified_buyer) : Boolean(r.user_id)
    }));

    res.json(enriched);
  } catch (error) {
    console.error('Failed to fetch admin reviews:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
};

/**
 * POST /api/reviews
 * Submits a new review.
 * Enforces:
 * 1. Reference to a real product in catalog.
 * 2. Verified completed purchase verification for verified badge.
 * 3. Moderation before publication (is_approved: false).
 * 4. Strict input validation and sanitization.
 */
exports.submitReview = async (req, res) => {
  try {
    const { product_id, product_name, rating, review_text, customer_name, image_url } = req.body;

    // 1. Input validation
    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5 stars.' });
    }

    const sanitizedName = sanitizeText(customer_name || req.user?.name || '');
    if (!sanitizedName || sanitizedName.length < 2 || sanitizedName.length > 100) {
      return res.status(400).json({ error: 'Customer name is required and must be between 2 and 100 characters.' });
    }

    const sanitizedText = sanitizeText(review_text || '');
    if (!sanitizedText || sanitizedText.length < 10 || sanitizedText.length > 2000) {
      return res.status(400).json({ error: 'Review text must be between 10 and 2000 characters.' });
    }

    // 2. Require review to reference an actual, existing product in catalog
    let matchedProduct = null;
    if (product_id) {
      const { data: p } = await safeQuery(() =>
        supabase.from('products').select('id, name').eq('id', product_id).maybeSingle()
      );
      if (p) matchedProduct = p;
    }

    if (!matchedProduct && product_name && product_name.trim()) {
      const cleanProdName = product_name.trim();
      const { data: p } = await safeQuery(() =>
        supabase.from('products').select('id, name').ilike('name', `%${cleanProdName}%`).maybeSingle()
      );
      if (p) matchedProduct = p;
    }

    if (!matchedProduct) {
      return res.status(400).json({
        error: 'Review must reference a valid, existing product in the catalog.'
      });
    }

    // 3. Purchase verification: Confirm authenticated buyer has completed order with this product
    let isVerifiedPurchase = false;
    const userId = req.user?.id || null;

    if (userId) {
      try {
        const { data: userOrders } = await safeQuery(() =>
          supabase
            .from('orders')
            .select('id, payment_status, order_status, items:order_items(product_id)')
            .eq('user_id', userId)
            .in('payment_status', ['paid'])
        );

        if (Array.isArray(userOrders) && userOrders.length > 0) {
          isVerifiedPurchase = userOrders.some(
            (o) =>
              Array.isArray(o.items) &&
              o.items.some((it) => it.product_id === matchedProduct.id)
          );
        }
      } catch (err) {
        console.warn('[submitReview] Purchase verification notice:', err.message);
      }
    }

    // 4. Moderate new reviews before publication (is_approved: false)
    const newReview = {
      product_id: matchedProduct.id,
      user_id: userId,
      customer_name: sanitizedName,
      product_name: matchedProduct.name,
      rating: numRating,
      review_text: sanitizedText,
      image_url: image_url ? String(image_url).trim() : null,
      is_approved: false, // Strictly false: requires admin moderation before live publication
    };

    let savedData = null;

    const isColumnError = (err) => {
      if (!err) return false;
      const code = String(err.code || '');
      const msg = String(err.message || '').toLowerCase();
      return (
        code === '42703' ||
        code === 'PGRST204' ||
        msg.includes('is_verified_buyer') ||
        msg.includes('schema cache') ||
        msg.includes('column')
      );
    };

    // Try insert with is_verified_buyer column if supported; fallback cleanly if column doesn't exist
    try {
      const { data: inserted, error: insertErr } = await supabase
        .from('reviews')
        .insert([{ ...newReview, is_verified_buyer: isVerifiedPurchase }])
        .select()
        .maybeSingle();

      if (insertErr) {
        if (isColumnError(insertErr)) {
          // Column is_verified_buyer does not exist in schema cache, fallback to base columns
          const { data: fallbackInserted, error: fallbackErr } = await supabase
            .from('reviews')
            .insert([newReview])
            .select()
            .maybeSingle();

          if (fallbackErr) throw fallbackErr;
          savedData = { ...fallbackInserted, is_verified_buyer: isVerifiedPurchase };
        } else if (insertErr.code === '42P01') {
          // Table doesn't exist
          const memReview = {
            ...newReview,
            id: 'mem-' + Date.now(),
            is_verified_buyer: isVerifiedPurchase,
            created_at: new Date().toISOString()
          };
          cachedReviews.unshift(memReview);
          savedData = memReview;
        } else {
          throw insertErr;
        }
      } else {
        savedData = { ...inserted, is_verified_buyer: isVerifiedPurchase };
      }
    } catch (insertException) {
      if (isColumnError(insertException)) {
        const { data: fallbackInserted, error: fallbackErr } = await supabase
          .from('reviews')
          .insert([newReview])
          .select()
          .maybeSingle();

        if (fallbackErr) throw fallbackErr;
        savedData = { ...fallbackInserted, is_verified_buyer: isVerifiedPurchase };
      } else if (insertException.code === '42P01') {
        const memReview = {
          ...newReview,
          id: 'mem-' + Date.now(),
          is_verified_buyer: isVerifiedPurchase,
          created_at: new Date().toISOString()
        };
        cachedReviews.unshift(memReview);
        savedData = memReview;
      } else {
        throw insertException;
      }
    }

    // Trigger AI / Admin Event Bus for review moderation queue
    if (savedData && savedData.id) {
      try {
        const { emitEvent } = require('../ai/aiEventBus');
        emitEvent('REVIEW_SUBMITTED', 'review', savedData.id, {
          rating: savedData.rating,
          customer: savedData.customer_name,
          product_name: savedData.product_name,
          is_verified_buyer: isVerifiedPurchase,
          status: 'pending_moderation',
        });
      } catch (e) {}
    }

    res.status(201).json({
      success: true,
      message: 'Thank you! Your review has been submitted for moderation.',
      review: savedData,
      is_approved: false,
      is_verified_buyer: isVerifiedPurchase,
    });
  } catch (error) {
    console.error('Error submitting review:', error.message || error);
    res.status(500).json({ error: error.message || 'Failed to submit review' });
  }
};

/**
 * PATCH or PUT /api/reviews/:id/approve
 * Approves a review after admin moderation.
 */
exports.approveReview = async (req, res) => {
  try {
    const { id } = req.params;

    if (id.startsWith('mem-')) {
      const idx = cachedReviews.findIndex((r) => r.id === id);
      if (idx !== -1) cachedReviews[idx].is_approved = true;
      return res.json({ message: 'Review approved successfully' });
    }

    const { error } = await supabase
      .from('reviews')
      .update({ is_approved: true })
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Review approved successfully' });
  } catch (error) {
    console.error('Error approving review:', error.message || error);
    res.status(500).json({ error: 'Failed to approve review' });
  }
};

/**
 * DELETE /api/reviews/:id
 * Removes a review from the database.
 */
exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    if (id.startsWith('mem-')) {
      cachedReviews = cachedReviews.filter((r) => r.id !== id);
      return res.json({ message: 'Review deleted successfully' });
    }

    const { error } = await supabase
      .from('reviews')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Error deleting review:', error.message || error);
    res.status(500).json({ error: 'Failed to delete review' });
  }
};

exports.createReview = exports.submitReview;
