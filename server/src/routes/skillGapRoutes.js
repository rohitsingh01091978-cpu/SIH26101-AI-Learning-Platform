const express = require('express');
const { getSkillGaps } = require('../controllers/skillGapController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.get('/', authenticate, getSkillGaps);

module.exports = router;
