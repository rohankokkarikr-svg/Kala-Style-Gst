import axios from 'axios';
import apiCache from '../utils/apiCache';

// Base API instance pointing to backend
const api = axios.create({
  baseURL: (() => {
    const envUrl = process.env.REACT_APP_API_URL;
    if (!envUrl) return 'http://localhost:5000/api';
    return envUrl.endsWith('/api') ? envUrl : `${envUrl.replace(/\/$/, '')}/api`;
  })(),
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token from localStorage on every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('sh_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle responses and errors
api.interceptors.response.use(
  (res) => res,
  (error) => {
    // Log detailed error info for debugging
    if (error.response) {
      console.error(`🔴 API Error [${error.response.status}]:`, error.response.data);
    } else if (error.request) {
      console.error('🔴 API No Response:', error.request);
      // This happens on network errors or timeouts
    } else {
      console.error('🔴 API Setup Error:', error.message);
    }

    if (error.response?.status === 401) {
      const reqUrl = error.config?.url || '';
      const isAuthEndpoint = reqUrl.includes('/auth/login') ||
                             reqUrl.includes('/auth/signup') ||
                             reqUrl.includes('/auth/register') ||
                             reqUrl.includes('/auth/otp-session');

      // Do NOT trigger global redirect on login/signup failure so error toast can render cleanly
      if (!isAuthEndpoint) {
        localStorage.removeItem('sh_token');
        localStorage.removeItem('sh_user');

        // Only redirect to login if currently accessing a protected dashboard or action
        const currentPath = window.location.pathname;
        const isProtectedRoute = currentPath.startsWith('/admin') ||
                                 currentPath.startsWith('/artisan') ||
                                 currentPath.startsWith('/checkout') ||
                                 currentPath.startsWith('/orders') ||
                                 currentPath.startsWith('/my-orders') ||
                                 currentPath.startsWith('/account');

        if (isProtectedRoute && currentPath !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);


// ─── Auth ────────────────────────────────────────
export const authAPI = {
  login:          (data) => api.post('/auth/login', data),
  signup:         (data) => api.post('/auth/signup', data),
  otpSession:     (data) => api.post('/auth/otp-session', data),
  me:             ()     => api.get('/auth/me'),
  getRewards:     ()     => api.get('/auth/rewards'),
  getLeaderboard: ()     => api.get('/auth/leaderboard'),
};

// Ultra-fast cached GET with instant SWR revalidation
export const cachedGet = async (url, config = {}, ttl) => {
  const cacheKey = `${url}?${JSON.stringify(config.params || {})}`;
  const cached = apiCache.get(cacheKey);
  const isCachedArrayEmpty = cached && ((Array.isArray(cached.data?.data) && cached.data.data.length === 0) || (Array.isArray(cached.data) && cached.data.length === 0));

  if (cached && !cached.isExpired && !isCachedArrayEmpty) {
    return cached.data;
  }
  const promise = api.get(url, config).then((res) => {
    const isResArrayEmpty = res && ((Array.isArray(res.data) && res.data.length === 0) || (Array.isArray(res) && res.length === 0));
    if (!isResArrayEmpty) {
      apiCache.set(cacheKey, res, ttl);
    }
    return res;
  });
  if (cached && cached.data && !isCachedArrayEmpty) {
    promise.catch(() => {});
    return cached.data;
  }
  return promise;
};

// ─── Products ────────────────────────────────────
export const productAPI = {
  getAll:      (params) => cachedGet('/products', { params }, 60000),
  getById:     (id)     => cachedGet(`/products/${id}`, {}, 60000),
  getFeatured: ()       => cachedGet('/products/featured', {}, 60000),
  create:      (data)   => { apiCache.invalidateProducts(); return api.post('/products', data); },
  update:      (id, d)  => { apiCache.invalidateProducts(); return api.put(`/products/${id}`, d); },
  delete:      (id)     => { apiCache.invalidateProducts(); return api.delete(`/products/${id}`); },
  uploadImage: (id, fd) => api.post(`/products/${id}/image`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }),
  uploadDirect: (data) => {
    const isFormData = data instanceof FormData;
    return api.post('/products/upload', data, {
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : { 'Content-Type': 'application/json' },
      timeout: 60000,
    });
  },

  generateBarcode: (id) => api.post(`/products/${id}/barcode`),
};

// ─── Orders ──────────────────────────────────────────────────────
export const orderAPI = {
  create:             (data)     => { apiCache.invalidateOrders(); return api.post('/orders', data); },
  createOrder:        (data)     => { apiCache.invalidateOrders(); return api.post('/orders/create', data); },
  calculateTotal:     (data)     => api.post('/orders/calculate-total', data),
  getMyOrders:        ()         => api.get('/orders/my'),
  getAll:             (params)   => api.get('/orders', { params }),
  getById:            (id)       => api.get(`/orders/${id}`),
  getTracking:        (id)       => api.get(`/orders/${id}/tracking`),
  updateStatus:       (id, data) => { apiCache.invalidateOrders(); return api.put(`/orders/${id}/status`, data); },
  updateOrderDetails: (id, data) => { apiCache.invalidateOrders(); return api.put(`/orders/${id}/edit`, data); },
  cancelOrder:        (id)       => { apiCache.invalidateOrders(); return api.put(`/orders/${id}/cancel`); },
  pay:                (id, data) => api.put(`/orders/${id}/pay`, data),
  verifyPayment:      (id, data) => api.put(`/orders/${id}/verify-payment`, data),
  refund:             (id, data) => api.post(`/orders/${id}/refund`, data),
  confirmCODCollection: (id, data) => { apiCache.invalidateOrders(); return api.post(`/orders/${id}/confirm-cod`, data); },
};

// ─── Payments ─────────────────────────────────────────────────────
export const paymentAPI = {
  createOrder:     (data) => api.post('/payments/create-order', data),
  initializeOrder: (orderId) => api.post('/payments/initialize-order', { orderId }),
  verify:          (data) => api.post('/payments/verify', data),
  refund:          (data) => api.post('/payments/refund', data),
  getPayment:      (orderId) => api.get(`/payments/${orderId}`),
};

// ─── Sales / Barcode ─────────────────────────────
export const salesAPI = {
  recordScan:  (data)   => api.post('/sales/scan', data),
  getDailySales: (date) => api.get('/sales/daily', { params: { date } }),
  getSummary:  ()       => api.get('/sales/summary'),
};

// ─── Dashboard ───────────────────────────────────
export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
};

// ─── Reviews ─────────────────────────────────────
export const reviewAPI = {
  getApproved: (params) => cachedGet('/reviews', { params }, 60000),
  getAll: (params) => api.get('/reviews/admin', { params }),
  submit: (data) => api.post('/reviews', data),
  approve: (id) => api.patch(`/reviews/${id}/approve`),
  delete: (id) => api.delete(`/reviews/${id}`),
};

// ─── Coupons ─────────────────────────────────────
export const couponAPI = {
  spin:     ()     => api.post('/coupons/spin'),
  validate: (code) => api.post('/coupons/validate', { code }),
  getMy:    ()     => api.get('/coupons/my-coupons'),
};

// ─── Categories ──────────────────────────────────
export const categoryAPI = {
  getAll: () => cachedGet('/products/categories', {}, 120000),
};

// ─── Settings ─────────────────────────────────────
export const settingsAPI = {
  get:    ()       => cachedGet('/settings', {}, 60000),
  update: (data)   => { apiCache.invalidateSettings(); return api.put('/settings', data); },
};

// ─── Artisans ────────────────────────────────────────────────────
export const artisanAPI = {
  getAll:                   ()       => cachedGet('/artisans', {}, 60000),
  getById:                  (id)     => cachedGet(`/artisans/${id}`, {}, 60000),
  getMyProfile:             ()       => api.get('/artisans/me'),
  getMyStats:               ()       => api.get('/artisans/me/stats'),
  getMyOrders:              ()       => api.get('/artisans/me/orders'),
  // New: artisan_orders based endpoint (secure, uses artisan_id)
  getArtisanOrders:         ()       => api.get('/artisans/orders'),
  updateArtisanSubOrderStatus: (id, d) => { apiCache.invalidateOrders(); return api.patch(`/artisans/orders/${id}/status`, d); },
  getEarnings:              ()       => api.get('/artisans/earnings'),
  // Legacy compat
  updateOrderStatus:        (id, d)  => { apiCache.invalidateOrders(); return api.put(`/orders/${id}/status`, d); },
  verifyPayment:            (id, d)  => { apiCache.invalidateOrders(); return api.put(`/orders/${id}/verify-payment`, d); },
  updateProfile:            (data)   => api.put('/artisans/me', data),
  verify:                   (id, d)  => api.patch(`/artisans/${id}/verify`, d),
  getAllAdmin:               ()       => api.get('/artisans/admin/all'),
};


// ─── AI ──────────────────────────────────────────
export const aiAPI = {
  analyzeProduct:       (data) => api.post('/ai/analyze-product',       data, { timeout: 60000 }),
  generateDescription:  (data) => api.post('/ai/generate-description',   data, { timeout: 60000 }),
  generateFullCatalog:  (data) => api.post('/ai/full-catalog',           data, { timeout: 60000 }),
  detectCategory:       (data) => api.post('/ai/detect-category',        data, { timeout: 60000 }),
  translateProduct:     (data) => api.post('/ai/translate',              data, { timeout: 60000 }),
  suggestPrice:         (data) => api.post('/ai/suggest-price',          data, { timeout: 60000 }),
  generateArtisanStory: (data) => api.post('/ai/artisan-story',          data, { timeout: 60000 }),
  getInsights:          (data) => api.post('/ai/insights',               data, { timeout: 60000 }),
  smartSearch:          (data) => api.post('/ai/smart-search',           data, { timeout: 60000 }),
};

// ─── Admin Control Center ────────────────────────
export const adminAPI = {
  getOverview:          ()         => api.get('/admin/overview'),
  getArtisans:          (params)   => api.get('/admin/artisans', { params }),
  updateArtisanStatus:  (id, data) => api.put(`/admin/artisans/${id}/status`, data),
  getCustomers:         (params)   => api.get('/admin/customers', { params }),
  updateCustomerStatus: (id, data) => api.put(`/admin/customers/${id}/status`, data),
  getProducts:          (params)   => api.get('/admin/products', { params }),
  updateProduct:        (id, data) => api.put(`/admin/products/${id}`, data),
  approveProduct:       (id)       => api.put(`/admin/products/${id}/approve`),
  rejectProduct:        (id, data) => api.put(`/admin/products/${id}/reject`, data),
  hideProduct:          (id, data) => api.put(`/admin/products/${id}/hide`, data),
  deleteProduct:        (id)       => api.delete(`/admin/products/${id}`),
  getCategories:        ()         => api.get('/admin/categories'),
  createCategory:       (data)     => api.post('/admin/categories', data),
  updateCategory:       (id, data) => api.put(`/admin/categories/${id}`, data),
  deleteCategory:       (id)       => api.delete(`/admin/categories/${id}`),
  getOrders:            (params)   => api.get('/admin/orders', { params }),
  updateOrderStatus:    (id, data) => api.put(`/admin/orders/${id}/status`, data),
  confirmCODCollection: (id, data) => { apiCache.invalidateOrders(); return api.post(`/admin/orders/${id}/confirm-cod`, data); },
  refundOrder:          (id, data) => api.post(`/admin/orders/${id}/refund`, data),
  getArtisanOrders:     (params)   => api.get('/admin/artisan-orders', { params }),
  getArtisanEarnings:   (params)   => api.get('/admin/artisan-earnings', { params }),
  getPayments:          ()         => api.get('/admin/payments'),
  updatePaymentStatus:  (id, data) => api.put(`/admin/orders/${id}/status`, data),
  getAIContent:         ()         => api.get('/admin/ai/content'),
  getAIStats:           ()         => api.get('/admin/ai/stats'),
  getAILogs:            ()         => api.get('/admin/ai/logs'),
  getReviews:           (params)   => api.get('/admin/reviews', { params }),
  approveReview:        (id, data) => api.put(`/admin/reviews/${id}/approve`, data),
  deleteReview:         (id)       => api.delete(`/admin/reviews/${id}`),
  getReports:           ()         => api.get('/admin/reports'),
  createReport:         (data)     => api.post('/admin/reports', data),
  updateReportStatus:   (id, data) => api.put(`/admin/reports/${id}/status`, data),
  getAnalytics:         ()         => api.get('/admin/analytics'),
  getNotifications:     ()         => api.get('/admin/notifications'),
  sendNotification:     (data)     => api.post('/admin/notifications', data),
  getContent:           ()         => api.get('/admin/content'),
  getActivityLogs:      ()         => api.get('/admin/activity'),
  getSettings:          ()         => api.get('/admin/settings'),
  updateSettings:       (data)     => api.put('/admin/settings', data),
};

export const notificationAPI = {
  getMyNotifications: () => api.get('/notifications'),
  sendMessage: (data) => api.post('/notifications/send', data),
  markAsRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/read-all'),
  getRecipients: () => api.get('/notifications/recipients'),
};

// ─── Autonomous AI Admin Operations Manager ───────
export const aiManagerAPI = {
  getStatus:        ()         => api.get('/admin/ai-manager/status'),
  chat:             (data)     => api.post('/admin/ai-manager/chat', data, { timeout: 120000 }),
  getActions:       (params)   => api.get('/admin/ai-manager/actions', { params }),
  getQueue:         ()         => api.get('/admin/ai-manager/queue'),
  retryJob:         (id)       => api.post(`/admin/ai-manager/queue/${id}/retry`),
  getRules:         ()         => api.get('/admin/ai-manager/rules'),
  updateRule:       (id, data) => api.put(`/admin/ai-manager/rules/${id}`, data),
  getReports:       ()         => api.get('/admin/ai-manager/reports'),
  runDailyReport:   ()         => api.post('/admin/ai-manager/reports/run'),
  processEvents:    ()         => api.post('/admin/ai-manager/process-events'),
  generateReport:   ()         => api.post('/admin/ai-manager/reports/run'),
  // New: System Health
  getSystemHealth:  ()         => api.get('/admin/ai-manager/health'),
  // New: Approval Workflow
  getApprovals:     (params)   => api.get('/admin/ai-manager/approvals', { params }),
  approveAction:    (id)       => api.post(`/admin/ai-manager/approvals/${id}/approve`),
  rejectAction:     (id, data) => api.post(`/admin/ai-manager/approvals/${id}/reject`, data),
};

// ─── Shiprocket Shipping & Logistics ─────────────
export const shippingAPI = {
  checkServiceability:  (data)         => api.post('/shipping/serviceability', data),
  getRates:             (data)         => api.post('/shipping/rates', data),
  getShipments:         (params)       => api.get('/shipping', { params }),
  getShipmentById:      (id)           => api.get(`/shipping/${id}`),
  getByOrderId:         (orderId)      => api.get(`/shipping/order/${orderId}`),
  createShipment:       (orderId, data)=> api.post(`/shipping/orders/${orderId}/create`, data),
  assignAWB:            (id, data)     => api.post(`/shipping/${id}/awb`, data),
  schedulePickup:       (id, data)     => api.post(`/shipping/${id}/pickup`, data),
  generateLabel:        (id)           => api.post(`/shipping/${id}/label`),
  generateInvoice:      (id)           => api.post(`/shipping/${id}/invoice`),
  trackShipment:        (id)           => api.get(`/shipping/${id}/tracking`),
  getStatistics:        ()             => api.get('/shipping/statistics'),
  getDelayed:           ()             => api.get('/shipping/delayed'),
  retryShipment:        (id)           => api.post(`/shipping/${id}/retry`),
};

export default api;
export { apiCache };


