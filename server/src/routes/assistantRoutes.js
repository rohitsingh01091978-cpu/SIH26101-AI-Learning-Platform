const express = require('express');
const { chat, chatValidators } = require('../controllers/assistantController');
const { authenticate, requireRole } = require('../middleware/auth');
const { assistantLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

// Learner-only: the assistant answers from the caller's own data, so admins (who have no
// learner data) and unauthenticated callers are turned away.
router.use(authenticate, requireRole('LEARNER'));
router.post('/chat', assistantLimiter, chatValidators, chat);

module.exports = router;
