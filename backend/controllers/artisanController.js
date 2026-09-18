const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const { parseArtisanUpi, formatBioWithUpi } = require('./authController');
const { isValidArtisanTransition } = require('../config/ecommerce');
const { syncMasterOrderStatus, finalizeCODDelivery, createArtisanEarning } = require('../services/orderService');
const { checkAndGrantReward } = require('../services/rewardService');
const { broadcastSync } = require('../utils/realtime');

// GET /api/artisans - all verified artisans (public)
exports.getArtisans = async (req, res) => {
  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('artisan_profiles')
        .select('*, users(name, created_at)')
        .eq('verification_status', 'verified')
        .order('created_at', { ascending: false })
    );
    if (error) throw error;
    const parsed = (data || []).map(parseArtisanUpi);
    res.json(parsed);
  } catch (err) {
    console.error('getArtisans error:', err);
    res.status(500).json({ error: 'Failed to fetch artisans' });
  }
};

// GET /api/artisans/:id - public artisan store
exports.getArtisanById = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: profile, error: profileError } = await supabase
      .from('artisan_profiles')
      .select('*, users(name, created_at)')
      .eq('id', id)
      .single();
    if (profileError || !profile) {
      return res.status(404).json({ error: 'Artisan not found' });
    }
    // Fetch their products
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('artisan_id', id)
      .eq('is_in_stock', true)
      .order('created_at', { ascending: false });

    res.json({ profile: parseArtisanUpi(profile), products: products || [] });
  } catch (err) {
    console.error('getArtisanById error:', err);
    res.status(500).json({ error: 'Failed to fetch artisan' });
  }
};

// GET /api/artisans/me - own profile (artisan only)
exports.getMyProfile = async (req, res) => {
  try {
    let { data, error } = await supabase
      .from('artisan_profiles')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (!data) {
      const { data: newProfile, error: createErr } = await supabase
        .from('artisan_profiles')
        .insert([{
          user_id: req.user.id,
          store_name: req.user.name || 'Artisan Studio',
          artisan_type: 'Artisan',
          verification_status: 'pending'
        }])
        .select()
        .single();
      if (!createErr && newProfile) data = newProfile;
      else return res.status(404).json({ error: 'Artisan profile not found' });
    }
    res.json(parseArtisanUpi(data));
  } catch (err) {
    console.error('getMyProfile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

// PUT /api/artisans/me - update own profile
exports.updateMyProfile = async (req, res) => {
  try {
    const { store_name, artisan_type, specialization, location, bio, profile_image, preferred_language, upi_id, upi_qr_code, years_of_experience } = req.body;
    const bioWithUpi = formatBioWithUpi(bio, upi_id, upi_qr_code);

    const updateFields = { 
      store_name, 
      artisan_type, 
      specialization, 
      location, 
      bio: bioWithUpi, 
      profile_image, 
      preferred_language,
      years_of_experience: years_of_experience !== undefined && years_of_experience !== '' ? Number(years_of_experience) : undefined
    };

    let { data, error } = await supabase
      .from('artisan_profiles')
      .update(updateFields)
      .eq('user_id', req.user.id)
      .select()
      .maybeSingle();

    if (error && (error.code === 'PGRST204' || (error.message && error.message.includes('years_of_experience')))) {
      delete updateFields.years_of_experience;
      const resFallback = await supabase
        .from('artisan_profiles')
        .update(updateFields)
        .eq('user_id', req.user.id)
        .select()
        .maybeSingle();
      data = resFallback.data;
    }

    if (!data) {
      const { data: newProfile, error: insError } = await supabase
        .from('artisan_profiles')
        .insert([{
          user_id: req.user.id,
          store_name: store_name || req.user.name,
          artisan_type: artisan_type || 'Artisan',
          specialization,
          location,
          bio: bioWithUpi,
          profile_image,
          preferred_language,
          verification_status: 'pending'
        }])
        .select()
        .single();
      if (insError) throw insError;
      data = newProfile;
    }

    const { broadcastSync } = require('../utils/realtime');
    broadcastSync('ARTISANS_UPDATED', { action: 'update', profile: data });

    res.json(parseArtisanUpi(data));
  } catch (err) {
    console.error('updateMyProfile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// GET /api/artisans/me/stats - earnings + orders summary
exports.getMyStats = async (req, res) => {
  try {
    let { data: profile } = await supabase
      .from('artisan_profiles')
      .select('id, earnings_total, verification_status, store_name')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (!profile) {
      const { data: newProfile } = await supabase
        .from('artisan_profiles')
        .insert([{
          user_id: req.user.id,
          store_name: req.user.name || 'Artisan Studio',
          artisan_type: 'Artisan',
          verification_status: 'pending'
        }])
        .select('id, earnings_total, verification_status, store_name')
        .single();
      profile = newProfile;
    }

    if (!profile) return res.status(404).json({ error: 'Artisan profile not found' });

    // Match both profile.id OR user.id to guarantee all products are retrieved
    const orCondition = `artisan_id.eq.${profile.id},artisan_id.eq.${req.user.id}`;
    const { data: products } = await supabase
      .from('products')
      .select('id, name, price, original_price, stock_quantity, is_in_stock, image_url, ai_generated, category, subcategory, status, rejection_reason, is_hidden, created_at')
      .or(orCondition)
      .order('created_at', { ascending: false });

    const productIds = (products || []).map(p => p.id);

    let recentOrders = [];
    let totalRevenue = 0;
    let totalOrders = 0;

    if (productIds.length > 0) {
      const { data: orderItems } = await supabase
        .from('order_items')
        .select(`
          *,
          orders(
            id,
            status,
            created_at,
            user_id,
            total_price,
            shipping_address,
            phone,
            payment_method,
            payment_status,
            users(name, email, phone)
          ),
          products(id, name, price, image_url, category)
        `)
        .in('product_id', productIds);

      const sortedItems = (orderItems || []).sort((a, b) => {
        const timeA = new Date(a.orders?.created_at || 0).getTime();
        const timeB = new Date(b.orders?.created_at || 0).getTime();
        return timeB - timeA;
      });

      recentOrders = sortedItems.slice(0, 100);
      totalOrders = sortedItems.length;
      totalRevenue = sortedItems.reduce((sum, item) => sum + (item.price_at_time * item.quantity), 0);
    }

    res.json({
      verificationStatus: profile.verification_status,
      storeName: profile.store_name,
      totalProducts: (products || []).length,
      totalOrders,
      totalRevenue,
      earningsTotal: profile.earnings_total || totalRevenue,
      products: products || [],
      recentOrders
    });
  } catch (err) {
    console.error('getMyStats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};

// GET /api/artisans/me/orders - complete customer details and delivery addresses for artisan
exports.getMyOrders = async (req, res) => {
  try {
    let { data: profile } = await supabase
      .from('artisan_profiles')
      .select('id')
      .eq('user_id', req.user.id)
      .maybeSingle();

    const profileId = profile?.id;
    let productsQuery = supabase.from('products').select('id');
    if (profileId) {
      productsQuery = productsQuery.or(`artisan_id.eq.${profileId},artisan_id.eq.${req.user.id}`);
    } else {
      productsQuery = productsQuery.eq('artisan_id', req.user.id);
    }
    const { data: products } = await productsQuery;

    const productIds = (products || []).map(p => p.id);
    if (productIds.length === 0) return res.json([]);

    let { data: orderItems, error } = await supabase
      .from('order_items')
      .select(`
        *,
        orders(
          id,
          status,
          created_at,
          user_id,
          total_price,
          shipping_address,
          phone,
          payment_method,
          payment_status,
          transaction_id,
          razorpay_payment_id,
          shipping_status,
          awb_code,
          courier_name,
          tracking_url,
          shipment_id,
          users(id, name, email, phone)
        ),
        products(id, name, price, image_url, category)
      `)
      .in('product_id', productIds);

    if (error && (error.message.includes('column') || error.message.includes('does not exist'))) {
      const fallbackRes = await supabase
        .from('order_items')
        .select(`
          *,
          orders(
            id,
            status,
            created_at,
            user_id,
            total_price,
            shipping_address,
            phone,
            payment_method,
            payment_status,
            users(id, name, email, phone)
          ),
          products(id, name, price, image_url, category)
        `)
        .in('product_id', productIds);
      orderItems = fallbackRes.data;
      error = fallbackRes.error;
    }

    if (error) throw error;

    // Optional shipping service augmentation
    let shippingService = null;
    try {
      shippingService = require('../services/shipping/shippingService');
    } catch (e) {}

    // Attach extracted clean utr_number and shipping details to order objects
    const sorted = (orderItems || []).map(item => {
      if (item.orders) {
        let utr = item.orders.transaction_id || item.orders.razorpay_payment_id;
        if (!utr && item.orders.shipping_address) {
          const match = item.orders.shipping_address.match(/(?:Ref\.?\s*No|UTR)[:\s]+([A-Za-z0-9_-]+)/i);
          if (match) utr = match[1].trim();
        }
        item.orders.utr_number = utr || null;

        if (shippingService && typeof shippingService.getShipmentByOrderId === 'function') {
          try {
            const shipment = shippingService.getShipmentByOrderId(item.orders.id);
            if (shipment) {
              item.orders.shipping_status = item.orders.shipping_status || shipment.status || shipment.shipment_status;
              item.orders.awb_code = item.orders.awb_code || shipment.awb_code;
              item.orders.courier_name = item.orders.courier_name || shipment.courier_name;
              item.orders.tracking_url = item.orders.tracking_url || shipment.tracking_url;
              item.orders.shipment_id = item.orders.shipment_id || shipment.id;
            }
          } catch (err) {}
        }
      }
      return item;
    }).sort((a, b) => {
      const timeA = new Date(a.orders?.created_at || 0).getTime();
      const timeB = new Date(b.orders?.created_at || 0).getTime();
      return timeB - timeA;
    });

    res.json(sorted);
  } catch (err) {
    console.error('getMyOrders error:', err);
    res.status(500).json({ error: 'Failed to fetch artisan orders' });
  }
};


// PATCH /api/artisans/:id/verify - admin: set verification status
exports.verifyArtisan = async (req, res) => {
  try {
    const { verification_status } = req.body;
    const validStatuses = ['pending', 'verified', 'rejected'];
    if (!validStatuses.includes(verification_status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const { data, error } = await supabase
      .from('artisan_profiles')
      .update({ verification_status })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(parseArtisanUpi(data));
  } catch (err) {
    console.error('verifyArtisan error:', err);
    res.status(500).json({ error: 'Failed to update verification status' });
  }
};

// GET /api/artisans/admin/all - admin: all artisans regardless of status
exports.getAllArtisans = async (req, res) => {
  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('artisan_profiles')
        .select('*, users(name, email, created_at)')
        .order('created_at', { ascending: false })
    );
    if (error) throw error;
    const parsed = (data || []).map(parseArtisanUpi);
    res.json(parsed);
  } catch (err) {
    console.error('getAllArtisans error:', err);
    res.status(500).json({ error: 'Failed to fetch artisans' });
  }
};

// ── ARTISAN SUB-ORDER MANAGEMENT ─────────────────────────────────────────────

/**
 * GET /api/artisans/orders
 * Fetch artisan_orders for the logged-in artisan ONLY (secure by artisan_id).
 */
exports.getMyArtisanOrders = async (req, res) => {
  try {
    let { data: profile } = await supabase
      .from('artisan_profiles')
      .select('id')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (!profile) return res.status(404).json({ error: 'Artisan profile not found' });

    const { data: artisanOrders, error } = await supabase
      .from('artisan_orders')
      .select(`
        *,
        order:orders (
          id, order_number, total_amount, total_price, payment_method, payment_status,
          shipping_address, shipping_name, shipping_city, shipping_state, shipping_pincode,
          phone, created_at, order_status, status, coupon_code,
          user:users (id, name, email, phone)
        ),
        items:order_items (
          id, quantity, price_at_time, unit_price_snapshot, total_price, size,
          product_name_snapshot, product_image_snapshot, artisan_id,
          product:products (id, name, image_url, price, category)
        )
      `)
      .eq('artisan_id', profile.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Filter order_items to only this artisan's items
    const result = (artisanOrders || []).map(ao => ({
      ...ao,
      items: (ao.items || []).filter(item => item.artisan_id === profile.id),
    }));

    res.json(result);
  } catch (err) {
    console.error('getMyArtisanOrders error:', err);
    res.status(500).json({ error: 'Failed to fetch artisan orders' });
  }
};

/**
 * PATCH /api/artisans/orders/:id/status
 * Update artisan_order status following the status machine.
 * Only the assigned artisan can update their own artisan_order.
 */
exports.updateArtisanOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body;

    if (!status) return res.status(400).json({ error: 'Status is required' });

    // Get artisan profile
    const { data: profile } = await supabase
      .from('artisan_profiles')
      .select('id')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (!profile) return res.status(404).json({ error: 'Artisan profile not found' });

    // Fetch the artisan_order and verify ownership
    const { data: artOrder, error: fetchErr } = await supabase
      .from('artisan_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !artOrder) return res.status(404).json({ error: 'Artisan order not found' });

    if (artOrder.artisan_id !== profile.id) {
      return res.status(403).json({ error: 'Access denied: this order does not belong to you' });
    }

    // Validate status transition
    if (!isValidArtisanTransition(artOrder.status, status)) {
      return res.status(400).json({
        error: `Invalid transition: ${artOrder.status} → ${status}. Allowed: ${require('../config/ecommerce').ARTISAN_STATUS_TRANSITIONS[artOrder.status]?.join(', ') || 'none'}`,
      });
    }

    // Build update object with timestamp fields
    const now = new Date().toISOString();
    const timestampMap = {
      accepted: 'accepted_at',
      preparing: 'prepared_at',
      ready_for_pickup: 'ready_at',
      dispatched: 'dispatched_at',
      out_for_delivery: 'out_for_delivery_at',
      delivered: 'delivered_at',
      cancelled: 'cancelled_at',
      rejected: 'rejected_at',
    };

    const updateData = { status, updated_at: now };
    if (timestampMap[status]) updateData[timestampMap[status]] = now;
    if (status === 'rejected' && rejection_reason) updateData.rejection_reason = rejection_reason;

    const { data: updated, error: updateErr } = await supabase
      .from('artisan_orders')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Special handling for delivered (COD finalization + earnings + reward)
    if (status === 'delivered') {
      const { data: masterOrder } = await supabase
        .from('orders')
        .select('user_id, payment_method, payment_status')
        .eq('id', artOrder.order_id)
        .single();

      // Sync master order status
      const newMasterStatus = await syncMasterOrderStatus(artOrder.order_id);

      // COD: mark payment as paid when all artisan orders delivered
      if (masterOrder?.payment_method === 'cod' && newMasterStatus === 'delivered') {
        await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', artOrder.order_id);
        await supabase.from('payments').update({ status: 'paid', paid_at: now }).eq('order_id', artOrder.order_id);
      }

      // Create artisan earning record
      await createArtisanEarning(id, artOrder, profile.id);

      // Check reward for customer
      if (masterOrder?.user_id) {
        const rewardResult = await checkAndGrantReward(masterOrder.user_id);
        if (rewardResult.granted) {
          console.log(`[artisanController] 🎁 Reward granted to user ${masterOrder.user_id}`);
        }
      }
    }

    // Sync master order status for any transition
    if (status !== 'delivered') {
      await syncMasterOrderStatus(artOrder.order_id);
    }

    // Broadcast realtime
    broadcastSync('ORDERS_UPDATED', { artisanOrderId: id, status, orderId: artOrder.order_id });
    broadcastSync('ARTISAN_ORDERS_UPDATED', { id, status });

    res.json({ success: true, artisan_order: updated });
  } catch (err) {
    console.error('updateArtisanOrderStatus error:', err);
    res.status(500).json({ error: 'Failed to update artisan order status' });
  }
};

/**
 * GET /api/artisans/earnings
 * Fetch artisan earnings from artisan_earnings table with auto-sync and real-time calculation.
 */
exports.getMyEarnings = async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('artisan_profiles')
      .select('id, earnings_total, user_id')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (!profile) return res.status(404).json({ error: 'Artisan profile not found' });

    // 1. Fetch all artisan_orders for this artisan (matching profile.id or user.id)
    const { data: artOrders } = await supabase
      .from('artisan_orders')
      .select('*, orders(id, status, order_status, total_amount, total_price, payment_status, payment_method, order_number, created_at, shipping_name)')
      .or(`artisan_id.eq.${profile.id},artisan_id.eq.${req.user.id}`);

    // Auto-sync any delivered orders that need artisan_earnings records
    if (artOrders && artOrders.length > 0) {
      for (const ao of artOrders) {
        const isMasterDelivered = ao.orders?.status === 'delivered' || ao.orders?.order_status === 'delivered';
        if (isMasterDelivered && ao.status !== 'delivered') {
          const now = new Date().toISOString();
          await supabase
            .from('artisan_orders')
            .update({ status: 'delivered', delivered_at: now, updated_at: now })
            .eq('id', ao.id);
          ao.status = 'delivered';
        }

        if (ao.status === 'delivered' || isMasterDelivered) {
          await createArtisanEarning(ao.id, ao, profile.id);
        }
      }
    }

    // 2. Fetch all recorded earnings
    const { data: earnings, error } = await supabase
      .from('artisan_earnings')
      .select(`
        *,
        order:orders (id, order_number, created_at, shipping_name, payment_method),
        artisan_order:artisan_orders (id, status, delivered_at)
      `)
      .eq('artisan_id', profile.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    let totals = (earnings || []).reduce(
      (acc, e) => ({
        gross: acc.gross + (Number(e.gross_amount) || 0),
        commission: acc.commission + (Number(e.platform_commission) || 0),
        net: acc.net + (Number(e.net_earning) || 0),
        settled: e.settlement_status === 'settled' ? acc.settled + (Number(e.net_earning) || 0) : acc.settled,
        pending: e.settlement_status === 'pending' ? acc.pending + (Number(e.net_earning) || 0) : acc.pending,
      }),
      { gross: 0, commission: 0, net: 0, settled: 0, pending: 0 }
    );

    // Calculate total orders for this artisan (count non-cancelled artisan_orders)
    const validOrders = (artOrders || []).filter(o => o.status !== 'cancelled' && o.orders?.status !== 'cancelled');
    const totalOrderCount = Math.max(earnings?.length || 0, validOrders.length);

    // If earnings table has fewer records than valid orders, reflect expected totals
    if (earnings.length === 0 && validOrders.length > 0) {
      const grossVal = validOrders.reduce((sum, o) => sum + (Number(o.total_amount || o.subtotal) || 0), 0);
      const commissionVal = Math.round(grossVal * 0.10);
      const netVal = grossVal - commissionVal;
      totals = {
        gross: grossVal,
        commission: commissionVal,
        net: netVal,
        settled: 0,
        pending: netVal,
      };
    }

    res.json({
      earnings: earnings || [],
      totals,
      totalOrders: totalOrderCount,
      activeOrders: validOrders,
      success: true,
    });
  } catch (err) {
    console.error('getMyEarnings error:', err);
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
};
