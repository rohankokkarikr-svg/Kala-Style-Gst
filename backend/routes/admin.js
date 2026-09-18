const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const { initiateRefund } = require('../controllers/orderController');

// All /api/admin routes are strictly protected by JWT authentication & Admin role verification
router.use(protect);
router.use(admin);

// 1. Overview
router.get('/overview', adminController.getOverview);

// 2. Artisans
router.get('/artisans', adminController.getArtisans);
router.put('/artisans/:id/status', adminController.updateArtisanStatus);

// 3. Customers
router.get('/customers', adminController.getCustomers);
router.put('/customers/:id/status', adminController.updateCustomerStatus);

// 4. Products
router.get('/products', adminController.getProducts);
router.put('/products/:id', adminController.updateProduct);
router.put('/products/:id/approve', adminController.approveProduct);
router.put('/products/:id/reject', adminController.rejectProduct);
router.put('/products/:id/hide', adminController.hideProduct);
router.delete('/products/:id', adminController.deleteProduct);

// 5. Categories
router.get('/categories', adminController.getCategories);
router.post('/categories', adminController.createCategory);
router.put('/categories/:id', adminController.updateCategory);
router.delete('/categories/:id', adminController.deleteCategory);

// 6. Orders
router.get('/orders', adminController.getOrders);
router.put('/orders/:id/status', adminController.updateOrderStatus);
router.post('/orders/:id/refund', initiateRefund);
router.post('/orders/:id/confirm-cod', adminController.confirmCODCollection);

// 6b. Artisan Orders & Earnings
router.get('/artisan-orders', adminController.getAdminArtisanOrders);
router.get('/artisan-earnings', adminController.getAdminArtisanEarnings);

// 7. Payments
router.get('/payments', adminController.getPayments);

// 8. AI Management
router.get('/ai/content', adminController.getAIContent);
router.get('/ai/stats', adminController.getAIUsageStats);
router.get('/ai/logs', adminController.getAIUsageLogs);

// 9. Reviews
router.get('/reviews', adminController.getReviews);
router.put('/reviews/:id/approve', adminController.approveReview);
router.delete('/reviews/:id', adminController.deleteReview);

// 10. Reports
router.get('/reports', adminController.getReports);
router.post('/reports', adminController.createReport);
router.put('/reports/:id/status', adminController.updateReportStatus);

// 11. Analytics
router.get('/analytics', adminController.getAnalytics);

// 12. Notifications
router.get('/notifications', adminController.getNotifications);
router.post('/notifications', adminController.sendNotification);

// 13. Content Management
router.get('/content', adminController.getContent);

// 14. Activity Logs
router.get('/activity', adminController.getActivityLogs);

// 15. Settings
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);

module.exports = router;
