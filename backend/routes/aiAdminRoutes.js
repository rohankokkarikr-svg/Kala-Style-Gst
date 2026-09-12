/**
 * backend/routes/aiAdminRoutes.js
 * ─────────────────────────────────────────────────────────────────
 * Protected Routes for the Autonomous AI Admin Management System.
 * Accessible strictly to verified Administrators.
 */

const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const { adminAiLimiter } = require('../middleware/rateLimiter');
const aiAdminController = require('../controllers/aiAdminController');

// Enforce JWT Authentication & Administrator Role Verification
router.use(protect);
router.use(admin);
router.use(adminAiLimiter);

router.get('/status',          aiAdminController.getStatus);
router.post('/chat',           aiAdminController.chat);
router.get('/actions',         aiAdminController.getActions);
router.get('/queue',           aiAdminController.getQueue);
router.post('/queue/:id/retry', aiAdminController.retryQueueJob);
router.get('/rules',           aiAdminController.getRules);
router.put('/rules/:id',       aiAdminController.updateRule);
router.get('/reports',         aiAdminController.getReports);
router.post('/reports/run',    aiAdminController.generateReport);
router.post('/process-events', aiAdminController.processEvents);

module.exports = router;
