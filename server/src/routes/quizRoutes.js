const express = require('express');
const { generateQuiz, getQuiz, startQuiz, answerQuestion, submitQuiz } = require('../controllers/quizController');
const { authenticate } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');
const v = require('../middleware/requestValidators');
const { aiJobLimiter } = require('../middleware/rateLimiters');

const router = express.Router();
router.use(authenticate);

router.post('/generate', aiJobLimiter, v.quizGenerate, handleValidation, generateQuiz);
router.get('/:id', getQuiz);
router.post('/:id/start', startQuiz);
router.post('/:id/answer', v.quizAnswer, handleValidation, answerQuestion);
router.post('/:id/submit', v.quizSubmit, handleValidation, submitQuiz);

module.exports = router;
