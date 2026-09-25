/**
 * backend/controllers/adminController.js
 * ──────────────────────────────────────
 * Central Admin Control Center Controller for KalaStyle AI
 * Handles all 15 Admin modules with robust queries and safe fallbacks.
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const { HANDICRAFT_CATEGORIES } = require('../data/handicraftsData');
const { invalidateCache } = require('./productController');
const { broadcastSync } = require('../utils/realtime');

// ── In-Memory Activity & AI Log Fallbacks ────────────────────────────────────
let inMemoryActivityLogs = [];

let inMemoryNotifications = [];

let inMemoryReports = [];

let inMemorySettings = {
  platform_name: 'KalaStyle AI',
  contact_email: 'support@kalastyle.ai',
  contact_phone: '+91 7676558335',
  currency: 'INR',
  currency_symbol: '₹',
  tax_rate: 5.0,
  platform_commission: 10.0,
  ai_features_enabled: true,
  daily_ai_limit_per_artisan: 50,
  auto_approve_products: false,
  maintenance_mode: false,
};

// Helper: Log Admin Activity
async function logActivity(req, action, target_type, target_id, details = {}) {
  const admin_name = req.user?.name || 'Admin';
  const admin_id = req.user?.id || null;
  const logEntry = {
    admin_id,
    admin_name,
    action,
    target_type,
    target_id: String(target_id),
    details,
    created_at: new Date().toISOString(),
  };

  try {
    await safeQuery(() => supabase.from('admin_activity_logs').insert([logEntry]));
  } catch (err) {
    // Save to in-memory fallback
    inMemoryActivityLogs.unshift({ ...logEntry, id: String(Date.now()) });
    if (inMemoryActivityLogs.length > 100) inMemoryActivityLogs.pop();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 1. DASHBOARD OVERVIEW 📊
// ════════════════════════════════════════════════════════════════════════════

exports.getOverview = async (req, res) => {
  try {
    const [
      artisansRes,
      usersRes,
      productsRes,
      ordersRes,
      reviewsRes
    ] = await Promise.all([
      safeQuery(() => supabase.from('artisan_profiles').select('id, verification_status, created_at')),
      safeQuery(() => supabase.from('users').select('id, role, created_at')),
      safeQuery(() => supabase.from('products').select('id, status, is_in_stock, ai_generated, created_at')),
      safeQuery(() => supabase.from('orders').select('id, total_price, status, created_at')),
      safeQuery(() => supabase.from('reviews').select('id, is_approved, rating'))
    ]);

    const artisans = artisansRes.data || [];
    const users = usersRes.data || [];
    const products = productsRes.data || [];
    const orders = ordersRes.data || [];
    const reviews = reviewsRes.data || [];

    // Customers are users with role !== 'artisan' && role !== 'admin'
    const customers = users.filter(u => u.role !== 'artisan' && u.role !== 'admin');

    // Product breakdown
    const productStats = {
      total: products.length,
      active: products.filter(p => p.status !== 'rejected' && p.is_in_stock !== false).length,
      pending: products.filter(p => p.status === 'pending').length,
      rejected: products.filter(p => p.status === 'rejected').length,
      outOfStock: products.filter(p => p.is_in_stock === false).length,
      aiGenerated: products.filter(p => p.ai_generated).length,
    };

    // Order breakdown
    const orderStats = {
      total: orders.length,
      pending: orders.filter(o => (o.status || 'pending').toLowerCase() === 'pending').length,
      processing: orders.filter(o => (o.status || '').toLowerCase() === 'processing').length,
      shipped: orders.filter(o => (o.status || '').toLowerCase() === 'shipped').length,
      delivered: orders.filter(o => (o.status || '').toLowerCase() === 'delivered').length,
      cancelled: orders.filter(o => (o.status || '').toLowerCase() === 'cancelled').length,
    };

    // Revenue
    const totalRevenue = orders
      .filter(o => (o.status || '').toLowerCase() !== 'cancelled')
      .reduce((sum, o) => sum + Number(o.total_price || 0), 0);

    // Recent Activity Feed
    const recentActivity = [
      ...artisans.slice(0, 3).map(a => ({ type: 'artisan', message: 'New artisan registered', time: a.created_at })),
      ...orders.slice(0, 3).map(o => ({ type: 'order', message: `Order #${o.id.slice(0, 8)} placed (₹${o.total_price})`, time: o.created_at })),
      ...products.slice(0, 3).map(p => ({ type: 'product', message: p.ai_generated ? 'AI product catalog created' : 'New product listed', time: p.created_at }))
    ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 6);

    res.json({
      totalArtisans: artisans.length,
      verifiedArtisans: artisans.filter(a => a.verification_status === 'verified').length,
      pendingArtisans: artisans.filter(a => a.verification_status === 'pending').length,
      totalCustomers: customers.length,
      productStats,
      orderStats,
      totalRevenue: Math.round(totalRevenue),
      pendingReviews: reviews.filter(r => !r.is_approved).length,
      recentActivity,
    });
  } catch (err) {
    console.error('getOverview error:', err);
    res.status(500).json({ error: 'Failed to load dashboard overview' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 2. ARTISAN MANAGEMENT 👨‍🎨
// ════════════════════════════════════════════════════════════════════════════

exports.getArtisans = async (req, res) => {
  try {
    const { search, status } = req.query;
    let query = supabase
      .from('artisan_profiles')
      .select('*, users(name, email, role, created_at, status)')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('verification_status', status);
    }

    const { data, error } = await safeQuery(() => query);
    if (error) throw error;

    let artisans = data || [];
    if (search) {
      const s = search.toLowerCase();
      artisans = artisans.filter(a =>
        a.store_name?.toLowerCase().includes(s) ||
        a.users?.name?.toLowerCase().includes(s) ||
        a.users?.email?.toLowerCase().includes(s) ||
        a.location?.toLowerCase().includes(s) ||
        a.specialization?.toLowerCase().includes(s)
      );
    }

    res.json(artisans);
  } catch (err) {
    console.error('getArtisans error:', err);
    res.status(500).json({ error: 'Failed to fetch artisans' });
  }
};

exports.updateArtisanStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { verification_status } = req.body; // 'verified', 'pending', 'rejected', 'suspended'

    const { data, error } = await supabase
      .from('artisan_profiles')
      .update({ verification_status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    broadcastSync('ARTISANS_UPDATED', { id, user_id: data?.user_id, verification_status, artisan: data });
    await logActivity(req, `Artisan Status Changed to ${verification_status}`, 'Artisan', id);
    res.json({ message: 'Artisan status updated successfully', artisan: data });
  } catch (err) {
    console.error('updateArtisanStatus error:', err);
    res.status(500).json({ error: 'Failed to update artisan status' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 3. CUSTOMER MANAGEMENT 👥
// ════════════════════════════════════════════════════════════════════════════

exports.getCustomers = async (req, res) => {
  try {
    const { search, status } = req.query;
    const { data: users, error } = await safeQuery(() =>
      supabase
        .from('users')
        .select('id, name, email, role, created_at, status')
        .eq('role', 'user')
        .order('created_at', { ascending: false })
    );

    if (error) throw error;

    // Filter customers strictly by role = 'user' (artisans and admins excluded)
    let customers = (users || []).filter(u => u.role === 'user');

    if (status && status !== 'all') {
      customers = customers.filter(c => (c.status || 'active') === status);
    }

    if (search) {
      const s = search.toLowerCase();
      customers = customers.filter(c =>
        c.name?.toLowerCase().includes(s) ||
        c.email?.toLowerCase().includes(s)
      );
    }

    // Fetch order counts and spend per customer
    const { data: orders } = await safeQuery(() =>
      supabase.from('orders').select('user_id, total_price, status')
    );

    const customerStats = customers.map(c => {
      const userOrders = (orders || []).filter(o => o.user_id === c.id);
      const totalSpent = userOrders
        .filter(o => o.status !== 'cancelled')
        .reduce((sum, o) => sum + Number(o.total_price || 0), 0);

      return {
        ...c,
        orderCount: userOrders.length,
        totalSpent: Math.round(totalSpent),
        status: c.status || 'active',
      };
    });

    res.json(customerStats);
  } catch (err) {
    console.error('getCustomers error:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
};

exports.updateCustomerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'active', 'suspended'

    // Server-side authorization guard: only update customer accounts (role = 'user')
    const { data, error } = await supabase
      .from('users')
      .update({ status })
      .eq('id', id)
      .eq('role', 'user')
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Customer not found or account is not a customer' });
    }
    await logActivity(req, `Customer Status Changed to ${status}`, 'Customer', id);
    res.json({ message: 'Customer status updated successfully', user: data });
  } catch (err) {
    console.error('updateCustomerStatus error:', err);
    res.status(500).json({ error: 'Failed to update customer status' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 4. PRODUCT MANAGEMENT 📦
// ════════════════════════════════════════════════════════════════════════════

exports.getProducts = async (req, res) => {
  try {
    const { search, category, status } = req.query;
    let query = supabase
      .from('products')
      .select('*, artisan_profiles(id, store_name, location, artisan_type)')
      .order('created_at', { ascending: false });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await safeQuery(() => query);
    if (error) throw error;

    let products = data || [];
    if (search) {
      const s = search.toLowerCase();
      products = products.filter(p =>
        p.name?.toLowerCase().includes(s) ||
        p.category?.toLowerCase().includes(s) ||
        p.material?.toLowerCase().includes(s)
      );
    }

    res.json(products);
  } catch (err) {
    console.error('getProducts error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      original_price,
      category,
      subcategory,
      stock_quantity,
      is_in_stock,
      image_url,
      status,
      rejection_reason,
      material,
      style,
      sizes,
      tags,
      is_handmade,
      barcode,
      artisan_id,
    } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = Number(price);
    if (original_price !== undefined) {
      updateData.original_price = original_price ? Number(original_price) : null;
    }
    if (category !== undefined) updateData.category = category;
    if (subcategory !== undefined) updateData.subcategory = subcategory;
    if (stock_quantity !== undefined) updateData.stock_quantity = Number(stock_quantity);
    if (is_in_stock !== undefined) updateData.is_in_stock = Boolean(is_in_stock);
    if (image_url !== undefined) updateData.image_url = image_url;
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'approved') updateData.rejection_reason = null;
    }
    if (rejection_reason !== undefined) updateData.rejection_reason = rejection_reason;
    if (material !== undefined) updateData.material = material;
    if (style !== undefined) updateData.style = style;
    if (artisan_id !== undefined) updateData.artisan_id = artisan_id;
    if (sizes !== undefined) {
      updateData.sizes = Array.isArray(sizes)
        ? sizes
        : typeof sizes === 'string'
        ? sizes.split(',').map(s => s.trim()).filter(Boolean)
        : [];
    }
    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags)
        ? tags
        : typeof tags === 'string'
        ? tags.split(',').map(t => t.trim()).filter(Boolean)
        : [];
    }
    if (is_handmade !== undefined) updateData.is_handmade = Boolean(is_handmade);
    if (barcode !== undefined) updateData.barcode = barcode ? barcode.trim() : null;

    const { data, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', id)
      .select('*, artisan_profiles(id, store_name, location, artisan_type)')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Barcode already exists. Please use a unique barcode.' });
      }
      throw error;
    }

    invalidateCache();
    broadcastSync('PRODUCTS_UPDATED', { action: 'update', id, product: data });
    await logActivity(req, `Edited Product Details: ${data?.name || id}`, 'Product', id, updateData);
    res.json({ message: 'Product updated successfully', product: data });
  } catch (err) {
    console.error('admin updateProduct error:', err);
    res.status(500).json({ error: err.message || 'Failed to update product' });
  }
};

exports.approveProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('products')
      .update({ status: 'approved', rejection_reason: null })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    invalidateCache();
    broadcastSync('PRODUCTS_UPDATED', { action: 'approve', id, product: data });
    await logActivity(req, 'Approved Product', 'Product', id);
    res.json({ message: 'Product approved successfully', product: data });
  } catch (err) {
    console.error('approveProduct error:', err);
    res.status(500).json({ error: 'Failed to approve product' });
  }
};

exports.rejectProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { data, error } = await supabase
      .from('products')
      .update({ status: 'rejected', rejection_reason: reason || 'Policy Violation' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    invalidateCache();
    broadcastSync('PRODUCTS_UPDATED', { action: 'reject', id, reason, product: data });
    await logActivity(req, `Rejected Product (${reason || 'No reason specified'})`, 'Product', id);
    res.json({ message: 'Product rejected', product: data });
  } catch (err) {
    console.error('rejectProduct error:', err);
    res.status(500).json({ error: 'Failed to reject product' });
  }
};

exports.hideProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_hidden } = req.body;

    const { data, error } = await supabase
      .from('products')
      .update({ is_hidden: is_hidden !== false })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    invalidateCache();
    broadcastSync('PRODUCTS_UPDATED', { action: 'hide', id, is_hidden, product: data });
    await logActivity(req, is_hidden ? 'Hidden Product' : 'Unhidden Product', 'Product', id);
    res.json({ message: 'Product visibility updated', product: data });
  } catch (err) {
    console.error('hideProduct error:', err);
    res.status(500).json({ error: 'Failed to update visibility' });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;

    invalidateCache();
    broadcastSync('PRODUCTS_UPDATED', { action: 'delete', id });
    await logActivity(req, 'Deleted Product', 'Product', id);
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('deleteProduct error:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 5. CATEGORY MANAGEMENT 🗂️
// ════════════════════════════════════════════════════════════════════════════

exports.getCategories = async (req, res) => {
  try {
    const { data, error } = await safeQuery(() =>
      supabase.from('categories').select('*').order('name')
    );

    if (error) {
      console.error('getCategories database error:', error.message);
      return res.status(500).json({ error: 'Database unavailable: Could not fetch categories from database.' });
    }

    // Return real database records (never fabricate fake IDs like "1", "2")
    return res.json(data || []);
  } catch (err) {
    console.error('getCategories error:', err);
    res.status(500).json({ error: 'Database unavailable or categories query failed' });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, slug, description, image_url, subcategories } = req.body;
    const { data, error } = await supabase
      .from('categories')
      .insert([{
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        description,
        image_url,
        subcategories: Array.isArray(subcategories) ? subcategories : subcategories?.split(',').map(s => s.trim()) || [],
        is_active: true
      }])
      .select()
      .single();

    if (error) throw error;
    broadcastSync('CATEGORIES_UPDATED', { action: 'create', category: data });
    await logActivity(req, `Created Category: ${name}`, 'Category', data?.id);
    res.status(201).json(data);
  } catch (err) {
    console.error('createCategory error:', err);
    res.status(500).json({ error: err.message || 'Failed to create category' });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, image_url, subcategories, is_active } = req.body;

    const { data, error } = await supabase
      .from('categories')
      .update({
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
        ...(image_url ? { image_url } : {}),
        ...(subcategories ? { subcategories: Array.isArray(subcategories) ? subcategories : subcategories.split(',').map(s => s.trim()) } : {}),
        ...(is_active !== undefined ? { is_active } : {})
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    broadcastSync('CATEGORIES_UPDATED', { action: 'update', id, category: data });
    await logActivity(req, `Updated Category: ${name || id}`, 'Category', id);
    res.json(data);
  } catch (err) {
    console.error('updateCategory error:', err);
    res.status(500).json({ error: 'Failed to update category' });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;

    broadcastSync('CATEGORIES_UPDATED', { action: 'delete', id });
    await logActivity(req, `Deleted Category`, 'Category', id);
    res.json({ message: 'Category deleted' });
  } catch (err) {
    console.error('deleteCategory error:', err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 6. ORDER MANAGEMENT 🛒
// ════════════════════════════════════════════════════════════════════════════

exports.getOrders = async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = supabase
      .from('orders')
      .select('*, users(name, email), order_items(*, products(name, image_url, price))')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await safeQuery(() => query);
    if (error) throw error;

    let orders = data || [];
    if (search) {
      const s = search.toLowerCase();
      orders = orders.filter(o =>
        o.id?.toLowerCase().includes(s) ||
        o.users?.name?.toLowerCase().includes(s) ||
        o.users?.email?.toLowerCase().includes(s) ||
        o.phone?.includes(s)
      );
    }

    res.json(orders);
  } catch (err) {
    console.error('getOrders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_status } = req.body;

    // Access control: Only the related artisan can verify UTR and approve payment
    if (payment_status === 'paid' || payment_status === 'successful') {
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('payment_status, status')
        .eq('id', id)
        .maybeSingle();

      if (existingOrder && (existingOrder.payment_status === 'pending_verification' || existingOrder.status === 'payment_verification_pending')) {
        return res.status(403).json({
          error: 'Access denied. Only the related artisan can verify the UTR and confirm this order.'
        });
      }
    }

    const { data, error } = await supabase
      .from('orders')
      .update({
        ...(status ? { status, order_status: status } : {}),
        ...(payment_status ? { payment_status } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    // SECTION 6 COMPLIANCE: Do NOT blindly synchronize every artisan order
    // Separate Master Order Status from Artisan Fulfillment Status
    if (status) {
      try {
        if (status === 'cancelled') {
          // Cancellation cascades to all sub-orders
          const aoUpdate = {
            status: 'cancelled',
            updated_at: new Date().toISOString(),
            cancelled_at: new Date().toISOString(),
          };
          await supabase.from('artisan_orders').update(aoUpdate).eq('order_id', id);
        } else if (status === 'delivered') {
          // When master order is delivered, check verified earnings for delivered sub-orders
          const isPaid = ['paid', 'completed'].includes(String(data.payment_status || '').toLowerCase());
          if (isPaid) {
            const { createArtisanEarning } = require('../services/orderService');
            const { data: artOrders } = await supabase.from('artisan_orders').select('*').eq('order_id', id);
            if (artOrders && artOrders.length > 0) {
              for (const ao of artOrders) {
                if (ao.artisan_id && ao.status === 'delivered') {
                  await createArtisanEarning(ao.id, ao, ao.artisan_id);
                }
              }
            }
          } else {
            console.log(`[adminController] Order #${id.slice(0, 8)} marked delivered with payment_status '${data.payment_status}'. Earnings deferred until confirmed payment collection.`);
          }
        }
      } catch (syncErr) {
        console.warn('Sub-order status handling in updateOrderStatus:', syncErr.message);
      }
    }

    broadcastSync('ORDERS_UPDATED', { id, status, payment_status, order: data });
    broadcastSync('ARTISAN_ORDERS_UPDATED', { orderId: id, status });
    broadcastSync('PAYMENTS_UPDATED', { id, status, payment_status, order: data });
    broadcastSync('EARNINGS_UPDATED', { orderId: id, status });
    await logActivity(req, `Updated Order #${id.slice(0, 8)} to ${status || payment_status}`, 'Order', id);
    res.json(data);
  } catch (err) {
    console.error('updateOrderStatus error:', err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
};

exports.confirmCODCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, override_shipping_guard } = req.body || {};
    const confirmedBy = req.user?.name || req.user?.email || 'admin';

    const { confirmCODCollection } = require('../services/orderService');
    const result = await confirmCODCollection(id, confirmedBy, { notes, override_shipping_guard });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await logActivity(req, `Confirmed COD Payment Collection for Order #${id.slice(0, 8)}`, 'Payment', id);
    res.json(result);
  } catch (err) {
    console.error('adminController.confirmCODCollection error:', err);
    res.status(500).json({ error: 'Failed to confirm COD collection: ' + err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 7. PAYMENT MONITORING 💰
// ════════════════════════════════════════════════════════════════════════════

exports.getPayments = async (req, res) => {
  try {
    const { data: orders, error } = await safeQuery(() =>
      supabase
        .from('orders')
        .select('id, total_price, payment_status, payment_method, razorpay_payment_id, created_at, phone, shipping_address, status, users(name, email, phone)')
        .order('created_at', { ascending: false })
    );

    if (error) throw error;

    const payments = (orders || []).map(o => {
      // Determine payment method if not explicitly stored
      let method = o.payment_method;
      if (!method && o.shipping_address) {
        const match = o.shipping_address.match(/\[Method:\s*([^\]]+)\]/i);
        if (match) method = match[1].trim();
      }
      if (!method) {
        method = o.razorpay_payment_id ? 'Online UPI / Card' : 'cod';
      }

      // Customer name and identifier
      const customerName = o.users?.name || 'Customer';
      const customerContact = o.users?.email || o.phone || o.users?.phone || '';
      const customerPhone = o.phone || o.users?.phone || '';

      // Normalize status strictly from verified payment status (never fabricate payment success)
      const pStatus = (o.payment_status || '').toLowerCase();
      let status = 'pending';
      if (pStatus === 'paid' || pStatus === 'successful' || pStatus === 'completed') {
        status = 'successful';
      } else if (pStatus === 'failed' || o.status === 'cancelled') {
        status = 'failed';
      } else if (pStatus === 'refunded') {
        status = 'refunded';
      } else {
        // SECTION 7 COMPLIANCE: COD delivered orders must NOT be treated as paid
        // For COD or unpaid orders: delivered orders without confirmed collection remain pending
        status = 'pending';
      }

      return {
        transactionId: o.razorpay_payment_id || `TXN-${o.id.slice(0, 8).toUpperCase()}`,
        orderId: o.id,
        customerName,
        customerEmail: customerContact,
        customerPhone,
        amount: Number(o.total_price || 0),
        paymentMethod: method,
        status,
        rawPaymentStatus: o.payment_status || 'pending',
        orderStatus: o.status || 'pending',
        date: o.created_at,
      };
    });

    res.json(payments);
  } catch (err) {
    console.error('getPayments error:', err);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 8. AI MANAGEMENT 🤖
// ════════════════════════════════════════════════════════════════════════════

exports.getAIContent = async (req, res) => {
  try {
    const { data: products, error } = await safeQuery(() =>
      supabase
        .from('products')
        .select('*, artisan_profiles(store_name, location)')
        .eq('ai_generated', true)
        .order('created_at', { ascending: false })
    );

    if (error) throw error;
    res.json(products || []);
  } catch (err) {
    console.error('getAIContent error:', err);
    res.status(500).json({ error: 'Failed to fetch AI content' });
  }
};

exports.getAIUsageStats = async (req, res) => {
  try {
    const { data: logs } = await safeQuery(() =>
      supabase.from('ai_usage_logs').select('*').order('created_at', { ascending: false })
    );

    const { data: products } = await safeQuery(() =>
      supabase.from('products').select('ai_generated, created_at')
    );

    const catalogProductsCount = (products || []).filter(p => p.ai_generated).length;
    const logList = logs || [];

    const totalRequests = logList.length || catalogProductsCount;
    const successfulRequests = logList.filter(l => l.status === 'success').length || catalogProductsCount;
    const failedRequests = logList.filter(l => l.status === 'failed').length;
    const catalogsGenerated = Math.max(logList.filter(l => l.feature === 'catalog').length, catalogProductsCount);
    const priceSuggestions = logList.filter(l => l.feature === 'price_suggestion').length;
    const translationsDone = logList.filter(l => l.feature === 'translation').length;

    res.json({
      totalRequests,
      successfulRequests,
      failedRequests,
      catalogsGenerated,
      priceSuggestions,
      translationsDone,
      modelUsed: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      recentLogs: logList.slice(0, 25)
    });
  } catch (err) {
    console.error('getAIUsageStats error:', err);
    res.status(500).json({ error: 'Failed to fetch AI stats' });
  }
};

exports.getAIUsageLogs = async (req, res) => {
  try {
    const { data, error } = await safeQuery(() =>
      supabase.from('ai_usage_logs').select('*').order('created_at', { ascending: false }).limit(100)
    );
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('getAIUsageLogs error:', err);
    res.status(500).json({ error: 'Failed to fetch AI usage logs' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 9. REVIEW MANAGEMENT ⭐
// ════════════════════════════════════════════════════════════════════════════

exports.getReviews = async (req, res) => {
  try {
    const { rating } = req.query;
    let query = supabase.from('reviews').select('*').order('created_at', { ascending: false });

    if (rating && rating !== 'all') {
      query = query.eq('rating', Number(rating));
    }

    const { data, error } = await safeQuery(() => query);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('getReviews error:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
};

exports.approveReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_approved } = req.body;

    const { data, error } = await supabase
      .from('reviews')
      .update({ is_approved: is_approved !== false })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    await logActivity(req, is_approved ? 'Approved Review' : 'Hidden Review', 'Review', id);
    res.json(data);
  } catch (err) {
    console.error('approveReview error:', err);
    res.status(500).json({ error: 'Failed to update review' });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('reviews').delete().eq('id', id);
    if (error) throw error;

    await logActivity(req, 'Deleted Review', 'Review', id);
    res.json({ message: 'Review deleted' });
  } catch (err) {
    console.error('deleteReview error:', err);
    res.status(500).json({ error: 'Failed to delete review' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 10. REPORTS & COMPLAINTS 🚨
// ════════════════════════════════════════════════════════════════════════════

exports.getReports = async (req, res) => {
  try {
    const { data, error } = await safeQuery(() =>
      supabase.from('reports').select('*').order('created_at', { ascending: false })
    );

    if (data && data.length > 0) {
      // Enrich with reporter details if reporter_id or user_id exists
      const enriched = await Promise.all(data.map(async (r) => {
        const uid = r.reporter_id || r.user_id;
        if (uid) {
          try {
            const { data: u } = await supabase.from('users').select('name, email').eq('id', uid).maybeSingle();
            if (u) return { ...r, users: u, customer_name: u.name, customer_email: u.email };
          } catch (e) {}
        }
        return r;
      }));
      return res.json(enriched);
    }
    return res.json(data || []);
  } catch (err) {
    console.error('getReports error:', err.message);
    res.status(500).json({ error: 'Failed to fetch reports from database' });
  }
};

exports.createReport = async (req, res) => {
  try {
    const { report_type, target_id, reason, description } = req.body;
    if (!target_id || !reason) {
      return res.status(400).json({ error: 'target_id and reason are required' });
    }

    const reporter_id = req.user?.id || null;
    const newReport = {
      report_type: report_type || 'product',
      target_id: String(target_id),
      reporter_id,
      user_id: reporter_id,
      reason,
      description: description || '',
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let { data, error } = await supabase
      .from('reports')
      .insert([newReport])
      .select()
      .maybeSingle();

    if (error) {
      console.warn('createReport initial insert error, retrying without user_id:', error.message);
      delete newReport.user_id;
      const res2 = await supabase
        .from('reports')
        .insert([newReport])
        .select()
        .maybeSingle();
      data = res2.data;
    }

    if (!data) {
      const fallbackReport = { id: String(Date.now()), ...newReport };
      inMemoryReports.unshift(fallbackReport);
      data = fallbackReport;
    }

    await logActivity(req, `Filed New Report against ${target_id}`, 'Report', data.id || 'new');
    broadcastSync('REPORTS_UPDATED', { report: data });
    res.status(201).json(data);
  } catch (err) {
    console.error('createReport error:', err);
    res.status(500).json({ error: 'Failed to create report' });
  }
};

exports.updateReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

    try {
      const { data, error } = await supabase
        .from('reports')
        .update({ status, admin_notes, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      await logActivity(req, `Updated Report #${id} to ${status}`, 'Report', id);
      broadcastSync('REPORTS_UPDATED', { id, status, admin_notes });
      return res.json(data);
    } catch {
      const report = inMemoryReports.find(r => r.id === id);
      if (report) {
        report.status = status;
        report.admin_notes = admin_notes;
      }
      await logActivity(req, `Updated Report #${id} to ${status}`, 'Report', id);
      broadcastSync('REPORTS_UPDATED', { id, status, admin_notes });
      return res.json(report || { id, status, admin_notes });
    }
  } catch (err) {
    console.error('updateReportStatus error:', err);
    res.status(500).json({ error: 'Failed to update report' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 11. MARKETPLACE ANALYTICS 📈
// ════════════════════════════════════════════════════════════════════════════

exports.getAnalytics = async (req, res) => {
  try {
    const [ordersRes, productsRes, artisansRes, usersRes] = await Promise.all([
      safeQuery(() => supabase.from('orders').select('id, total_price, status, created_at')),
      safeQuery(() => supabase.from('products').select('id, name, category, price, created_at')),
      safeQuery(() => supabase.from('artisan_profiles').select('id, store_name, specialization, created_at')),
      safeQuery(() => supabase.from('users').select('id, role, created_at'))
    ]);

    const orders = ordersRes.data || [];
    const products = productsRes.data || [];
    const artisans = artisansRes.data || [];
    const users = usersRes.data || [];

    // Monthly revenue trend (last 6 months)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const monthlyRevenue = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const monthOrders = orders.filter(o => {
        const od = new Date(o.created_at);
        return od >= d && od < nextMonth && o.status !== 'cancelled';
      });
      const revenue = monthOrders.reduce((sum, o) => sum + Number(o.total_price || 0), 0);
      monthlyRevenue.push({
        month: monthNames[d.getMonth()],
        revenue: Math.round(revenue),
        orders: monthOrders.length
      });
    }

    // Category breakdown
    const categoryCounts = {};
    products.forEach(p => {
      const cat = p.category || 'Other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const categoryDistribution = Object.entries(categoryCounts).map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / (products.length || 1)) * 100)
    }));

    res.json({
      monthlyRevenue,
      categoryDistribution,
      totalArtisans: artisans.length,
      totalCustomers: users.filter(u => u.role !== 'admin' && u.role !== 'artisan').length,
      totalProducts: products.length,
      totalOrders: orders.length,
      totalRevenue: Math.round(orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + Number(o.total_price || 0), 0)),
    });
  } catch (err) {
    console.error('getAnalytics error:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 12. NOTIFICATIONS 🔔
// ════════════════════════════════════════════════════════════════════════════

exports.getNotifications = async (req, res) => {
  try {
    const { data, error } = await safeQuery(() =>
      supabase
        .from('notifications')
        .select('*, sender:sender_id(id, name, email, role), target_user:target_user_id(id, name, email, role)')
        .order('created_at', { ascending: false })
    );
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    console.error('getNotifications error:', err.message);
    res.status(500).json({ error: 'Failed to fetch notifications from database' });
  }
};

exports.sendNotification = async (req, res) => {
  try {
    let { title, message, target_audience, target_user_id } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    // If target_user_id is an artisan_profile id, resolve to user_id
    if (target_user_id) {
      try {
        const { data: artProfile } = await supabase
          .from('artisan_profiles')
          .select('user_id')
          .eq('id', target_user_id)
          .maybeSingle();
        if (artProfile && artProfile.user_id) {
          target_user_id = artProfile.user_id;
        }
      } catch {}
    }

    const notif = {
      title,
      message,
      target_audience: target_audience || (target_user_id ? 'specific' : 'all'),
      target_user_id: target_user_id || null,
      sender_id: req.user?.id || null,
      is_read: false,
      created_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert([notif])
        .select('*, sender:sender_id(id, name, email, role), target_user:target_user_id(id, name, email, role)')
        .single();
      if (error) throw error;
      await logActivity(req, `Sent Notification: "${title}" to ${target_audience}`, 'Notification', data?.id);
      return res.status(201).json(data);
    } catch {
      const newNotif = { 
        ...notif, 
        id: String(Date.now()),
        sender: { id: req.user?.id, name: req.user?.name || 'Admin', role: 'admin' }
      };
      inMemoryNotifications.unshift(newNotif);
      await logActivity(req, `Sent Notification: "${title}" to ${target_audience}`, 'Notification', newNotif.id);
      return res.status(201).json(newNotif);
    }
  } catch (err) {
    console.error('sendNotification error:', err);
    res.status(500).json({ error: 'Failed to send notification' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 13. CONTENT MANAGEMENT 📄
// ════════════════════════════════════════════════════════════════════════════

exports.getContent = async (req, res) => {
  try {
    const { data: settings } = await safeQuery(() =>
      supabase.from('settings').select('*')
    );
    res.json(settings || []);
  } catch (err) {
    res.json([]);
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 14. ADMIN ACTIVITY LOGS 📜
// ════════════════════════════════════════════════════════════════════════════

exports.getActivityLogs = async (req, res) => {
  try {
    const { data, error } = await safeQuery(() =>
      supabase.from('admin_activity_logs').select('*').order('created_at', { ascending: false }).limit(50)
    );

    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    console.error('getActivityLogs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch activity logs from database' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 15. PLATFORM SETTINGS ⚙️
// ════════════════════════════════════════════════════════════════════════════

exports.getSettings = async (req, res) => {
  try {
    let cloudSlides = null;
    try {
      const { data: fileData, error: fileErr } = await supabase.storage
        .from('site-config')
        .download('hero_slides.json');
      if (fileData && !fileErr) {
        const text = await fileData.text();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cloudSlides = parsed;
        }
      }
    } catch {
      // Storage fallback
    }

    const { data } = await safeQuery(() =>
      supabase.from('platform_settings').select('*').eq('id', 'main').single()
    );

    const merged = {
      ...inMemorySettings,
      ...(data || {}),
      heroSlides: (Array.isArray(cloudSlides) && cloudSlides.length > 0)
        ? cloudSlides
        : (inMemorySettings.heroSlides || []),
    };

    res.json(merged);
  } catch {
    res.json(inMemorySettings);
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const updates = req.body;
    // Security check: NEVER allow setting GEMINI_API_KEY from frontend
    delete updates.GEMINI_API_KEY;
    delete updates.gemini_api_key;

    const normalizedUpdates = {
      ...updates,
      ...(updates.platform_name ? { platform_name: updates.platform_name, storeName: updates.platform_name } : {}),
      ...(updates.storeName ? { storeName: updates.storeName, platform_name: updates.storeName } : {}),
      ...(updates.contact_email ? { contact_email: updates.contact_email, supportEmail: updates.contact_email } : {}),
      ...(updates.supportEmail ? { supportEmail: updates.supportEmail, contact_email: updates.supportEmail } : {}),
      ...(updates.contact_phone ? { contact_phone: updates.contact_phone, supportPhone: updates.contact_phone } : {}),
      ...(updates.supportPhone ? { supportPhone: updates.supportPhone, contact_phone: updates.supportPhone } : {}),
      ...(updates.tax_rate !== undefined ? { tax_rate: updates.tax_rate, taxRate: String(updates.tax_rate) } : {}),
      ...(updates.taxRate !== undefined ? { taxRate: updates.taxRate, tax_rate: Number(updates.taxRate) || 0 } : {}),
      ...(updates.maintenance_mode !== undefined ? { maintenance_mode: updates.maintenance_mode, maintenanceMode: updates.maintenance_mode } : {}),
      ...(updates.maintenanceMode !== undefined ? { maintenanceMode: updates.maintenanceMode, maintenance_mode: updates.maintenanceMode } : {}),
      ...(updates.heroSlides ? { heroSlides: updates.heroSlides, hero_slides: updates.heroSlides } : {}),
      ...(updates.hero_slides ? { hero_slides: updates.hero_slides, heroSlides: updates.hero_slides } : {}),
      ...(updates.discountBanner ? { discountBanner: updates.discountBanner, discount_banner: updates.discountBanner } : {}),
      ...(updates.discount_banner ? { discount_banner: updates.discount_banner, discountBanner: updates.discount_banner } : {}),
      ...(updates.delivery_fee !== undefined ? { delivery_fee: Number(updates.delivery_fee) || 0 } : {}),
      ...(updates.free_delivery_above !== undefined ? { free_delivery_above: Number(updates.free_delivery_above) || 0 } : {}),
      ...(updates.shipping_estimated_days !== undefined ? { shipping_estimated_days: updates.shipping_estimated_days } : {}),
      ...(updates.cod_enabled !== undefined ? { cod_enabled: Boolean(updates.cod_enabled) } : {}),
      ...(updates.cod_min_order_value !== undefined ? { cod_min_order_value: Number(updates.cod_min_order_value) || 0 } : {}),
      ...(updates.cod_max_order_value !== undefined ? { cod_max_order_value: Number(updates.cod_max_order_value) || 0 } : {}),
    };

    // Invalidate ecommerce cache so orders immediately calculate using updated rates
    try {
      const { invalidateEcomCache } = require('../config/ecommerce');
      if (typeof invalidateEcomCache === 'function') invalidateEcomCache();
    } catch {
      // Ignore if not loaded
    }

    // Also sync to local JSON backup if available
    try {
      const fs = require('fs');
      const path = require('path');
      const settingsFile = path.join(__dirname, '../data/site_settings.json');
      let currentFileSettings = {};
      if (fs.existsSync(settingsFile)) {
        currentFileSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8') || '{}');
      }
      fs.writeFileSync(settingsFile, JSON.stringify({ ...currentFileSettings, ...normalizedUpdates }, null, 2), 'utf8');
    } catch (e) {
      // Ignore local file error
    }

    // Sync hero slides to Supabase Storage 'site-config' bucket
    const activeHeroSlides = normalizedUpdates.heroSlides || updates.heroSlides || updates.hero_slides;
    if (Array.isArray(activeHeroSlides) && activeHeroSlides.length > 0) {
      try {
        await supabase.storage
          .from('site-config')
          .upload('hero_slides.json', Buffer.from(JSON.stringify(activeHeroSlides, null, 2)), {
            contentType: 'application/json',
            upsert: true,
          });
      } catch (storageErr) {
        console.warn('Failed to upload hero_slides.json to Supabase storage:', storageErr.message);
      }
    }

    // Filter platform_settings columns
    const validPlatformCols = [
      'platform_name', 'contact_email', 'contact_phone', 'currency', 'currency_symbol',
      'tax_rate', 'platform_commission', 'ai_features_enabled', 'daily_ai_limit_per_artisan',
      'auto_approve_products', 'maintenance_mode', 'delivery_fee', 'free_delivery_above',
      'cod_enabled', 'cod_max_order_value', 'cod_min_order_value', 'cancellation_window_hours',
      'reward_eligible_count'
    ];
    const platformPayload = { id: 'main', updated_at: new Date().toISOString() };
    for (const key of validPlatformCols) {
      if (normalizedUpdates[key] !== undefined) {
        platformPayload[key] = normalizedUpdates[key];
      }
    }

    try {
      const { data } = await supabase
        .from('platform_settings')
        .upsert([platformPayload])
        .select()
        .single();
      inMemorySettings = { ...inMemorySettings, ...normalizedUpdates };
      broadcastSync('SETTINGS_UPDATED', inMemorySettings);
      await logActivity(req, 'Updated Platform Settings', 'Settings', 'main');
      return res.json(data || inMemorySettings);
    } catch {
      inMemorySettings = { ...inMemorySettings, ...normalizedUpdates };
      broadcastSync('SETTINGS_UPDATED', inMemorySettings);
      await logActivity(req, 'Updated Platform Settings', 'Settings', 'main');
      return res.json(inMemorySettings);
    }
  } catch (err) {
    console.error('updateSettings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 16. ARTISAN ORDERS (Admin view of all artisan sub-orders)
// ════════════════════════════════════════════════════════════════════════════

exports.getAdminArtisanOrders = async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('artisan_orders')
      .select(`
        *,
        artisan:artisan_profiles (id, store_name, profile_image, user_id, users(name, email, phone)),
        order:orders (id, order_number, total_amount, payment_method, payment_status, created_at,
          shipping_name, shipping_address, shipping_city, phone,
          user:users (id, name, email, phone))
      `)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('getAdminArtisanOrders error:', err);
    res.status(500).json({ error: 'Failed to fetch artisan orders' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 17. ARTISAN EARNINGS (Admin settlement view)
// ════════════════════════════════════════════════════════════════════════════

exports.getAdminArtisanEarnings = async (req, res) => {
  try {
    const { settlement_status } = req.query;
    let query = supabase
      .from('artisan_earnings')
      .select(`
        *,
        artisan:artisan_profiles (id, store_name, user_id, users(name, email)),
        order:orders (id, order_number, created_at, payment_method),
        artisan_order:artisan_orders (id, status, delivered_at)
      `)
      .order('created_at', { ascending: false });

    if (settlement_status && settlement_status !== 'all') {
      query = query.eq('settlement_status', settlement_status);
    }

    const { data, error } = await query;
    if (error) throw error;

    const totals = (data || []).reduce(
      (acc, e) => ({
        gross: acc.gross + (e.gross_amount || 0),
        commission: acc.commission + (e.platform_commission || 0),
        net: acc.net + (e.net_earning || 0),
        pending: e.settlement_status === 'pending' ? acc.pending + (e.net_earning || 0) : acc.pending,
        settled: e.settlement_status === 'settled' ? acc.settled + (e.net_earning || 0) : acc.settled,
      }),
      { gross: 0, commission: 0, net: 0, pending: 0, settled: 0 }
    );

    res.json({ earnings: data || [], totals });
  } catch (err) {
    console.error('getAdminArtisanEarnings error:', err);
    res.status(500).json({ error: 'Failed to fetch artisan earnings' });
  }
};

