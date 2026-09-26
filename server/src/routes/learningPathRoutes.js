const express = require('express');
const { getLearningPath } = require('../controllers/learningPathController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.get('/', authenticate, getLearningPath);

module.exports = router;
