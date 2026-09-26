const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');
const { getUsageSummary } = require('../services/aiQuota');

const router = express.Router();
router.use(authenticate);

// GET /api/ai/usage - the caller's own daily AI limits and how much is left (counts only, no content).
router.get(
  '/usage',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, ...(await getUsageSummary(req.user.id)) });
  })
);

module.exports = router;
