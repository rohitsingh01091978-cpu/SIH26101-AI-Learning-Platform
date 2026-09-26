const express = require('express');
const { getRecommendations } = require('../controllers/learningPathController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.get('/', authenticate, getRecommendations);

module.exports = router;
