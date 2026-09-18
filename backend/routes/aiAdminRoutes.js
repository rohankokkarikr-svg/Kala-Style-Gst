/**
 * backend/routes/aiAdminRoutes.js
 * ─────────────────────────────────────────────────────────────────
 * Protected Routes for the Autonomous AI Admin Management System.
 * Accessible strictly to verified Administrators.
 */

const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const aiAdminController = require('../controllers/aiAdminController');
const { agentChatLimiter, adminAiLimiter } = require('../middleware/rateLimiter');

// Enforce JWT Authentication & Administrator Role Verification
router.use(protect);
router.use(admin);

router.get('/status',          adminAiLimiter, aiAdminController.getStatus);
router.post('/chat',           agentChatLimiter, aiAdminController.chat);
router.get('/actions',         adminAiLimiter, aiAdminController.getActions);
router.get('/queue',           adminAiLimiter, aiAdminController.getQueue);
router.post('/queue/:id/retry', adminAiLimiter, aiAdminController.retryQueueJob);
router.get('/rules',           adminAiLimiter, aiAdminController.getRules);
router.put('/rules/:id',       adminAiLimiter, aiAdminController.updateRule);
router.get('/reports',         aiAdminController.getReports);
router.post('/reports/run',    aiAdminController.generateReport);
router.post('/process-events', aiAdminController.processEvents);

// ── New: System Health ───────────────────────────────────────────
router.get('/health',          aiAdminController.getSystemHealth);

// ── New: Approval Workflow ───────────────────────────────────────
router.get('/approvals',                    aiAdminController.getApprovals);
router.post('/approvals/:id/approve',       aiAdminController.approveAction);
router.post('/approvals/:id/reject',        aiAdminController.rejectAction);

// ── New: Agent Memory ────────────────────────────────────────────
router.get('/memory',          aiAdminController.getAgentMemory);

module.exports = router;
