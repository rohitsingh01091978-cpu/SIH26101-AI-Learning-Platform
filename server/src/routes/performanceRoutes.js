const express = require('express');
const { getPerformance } = require('../controllers/performanceController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.get('/', authenticate, getPerformance);

module.exports = router;
