const express = require('express');
const { startAssessment, submitAssessment } = require('../controllers/assessmentController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.post('/start', startAssessment);
router.post('/submit', submitAssessment);

module.exports = router;
