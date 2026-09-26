const express = require('express');
const { startAssessment, submitAssessment } = require('../controllers/assessmentController');
const { authenticate } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');
const v = require('../middleware/requestValidators');

const router = express.Router();
router.use(authenticate);

router.post('/start', startAssessment);
router.post('/submit', v.assessmentSubmit, handleValidation, submitAssessment);

module.exports = router;
