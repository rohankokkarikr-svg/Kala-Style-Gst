/**
 * backend/services/productService.js
 * ─────────────────────────────────────────────────────────────────
 * Product catalog governance, stock management, and approval operations.
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const { broadcastSync } = require('../utils/realtime');

/**
 * Fetch products with optional status, category, or keyword filtering.
 */
exports.getProducts = async ({ category, status = 'all', search = '', limit = 20 } = {}) => {
  let query = supabase
    .from('products')
    .select('id, name, price, original_price, category, subcategory, stock_quantity, is_in_stock, status, artisan_id, is_handmade, material, image_url, created_at, artisan_profiles(id, store_name, location)')
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 50));

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await safeQuery(() => query);
  if (error) throw new Error(`Failed to fetch products: ${error.message}`);

  let results = data || [];
  if (search && search.trim()) {
    const s = search.toLowerCase();
    results = results.filter(p =>
      p.name?.toLowerCase().includes(s) ||
      p.category?.toLowerCase().includes(s) ||
      p.material?.toLowerCase().includes(s) ||
      p.artisan_profiles?.store_name?.toLowerCase().includes(s)
    );
  }

  return results;
};

/**
 * Fetch products pending catalog approval.
 */
exports.getPendingProducts = async (limit = 20) => {
  return exports.getProducts({ status: 'pending', limit });
};

/**
 * Identify low stock or out of stock craft products.
 */
exports.getLowStockProducts = async (threshold = 5, limit = 20) => {
  const { data, error } = await safeQuery(() =>
    supabase
      .from('products')
      .select('id, name, price, stock_quantity, is_in_stock, category, artisan_id, artisan_profiles(id, store_name)')
      .or(`stock_quantity.lte.${threshold},is_in_stock.eq.false`)
      .order('stock_quantity', { ascending: true })
      .limit(Math.min(limit, 50))
  );

  if (error) throw new Error(`Failed to fetch low stock products: ${error.message}`);
  return data || [];
};

/**
 * Approve a product submission and publish it to marketplace catalog.
 */
exports.approveProduct = async (productId, reason = 'Approved by AI Admin Manager', confidence = 1.0) => {
  if (!productId) throw new Error('product_id is required');

  const { data, error } = await safeQuery(() =>
    supabase
      .from('products')
      .update({
        status: 'approved',
        rejection_reason: null,
        is_hidden: false,
      })
      .eq('id', productId)
      .select('*, artisan_profiles(id, store_name)')
      .single()
  );

  if (error) throw new Error(`Database error approving product: ${error.message}`);

  broadcastSync('PRODUCTS_UPDATED', { action: 'approve', id: productId, product: data });

  return {
    success: true,
    product_id: productId,
    name: data.name,
    status: 'approved',
    confidence,
    reason,
  };
};

/**
 * Reject a product submission.
 */
exports.rejectProduct = async (productId, reason = 'Policy Violation') => {
  if (!productId) throw new Error('product_id is required');

  const { data, error } = await safeQuery(() =>
    supabase
      .from('products')
      .update({
        status: 'rejected',
        rejection_reason: reason,
        is_hidden: true,
      })
      .eq('id', productId)
      .select()
      .single()
  );

  if (error) throw new Error(`Database error rejecting product: ${error.message}`);

  broadcastSync('PRODUCTS_UPDATED', { action: 'reject', id: productId, reason, product: data });

  return {
    success: true,
    product_id: productId,
    status: 'rejected',
    reason,
  };
};

/**
 * Hold product for revision or photography enhancement.
 */
exports.holdProduct = async (productId, reason = 'Holding for verification') => {
  if (!productId) throw new Error('product_id is required');

  const { data, error } = await safeQuery(() =>
    supabase
      .from('products')
      .update({
        status: 'pending',
        is_hidden: true,
        rejection_reason: `ON HOLD: ${reason}`,
      })
      .eq('id', productId)
      .select()
      .single()
  );

  if (error) throw new Error(`Database error placing product on hold: ${error.message}`);

  return {
    success: true,
    product_id: productId,
    status: 'pending_hold',
    reason,
  };
};

/**
 * Atomically update stock quantity and availability flag.
 */
exports.updateProductInventory = async (productId, quantity, reason = 'Stock adjustment') => {
  if (!productId) throw new Error('product_id is required');
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty < 0) {
    throw new Error('Stock quantity must be a non-negative integer');
  }

  const isInStock = qty > 0;

  const { data, error } = await safeQuery(() =>
    supabase
      .from('products')
      .update({
        stock_quantity: qty,
        is_in_stock: isInStock,
      })
      .eq('id', productId)
      .select()
      .single()
  );

  if (error) throw new Error(`Database error updating stock: ${error.message}`);

  broadcastSync('PRODUCTS_UPDATED', { action: 'inventory_update', id: productId, product: data });

  return {
    success: true,
    product_id: productId,
    stock_quantity: qty,
    is_in_stock: isInStock,
    reason,
  };
};
