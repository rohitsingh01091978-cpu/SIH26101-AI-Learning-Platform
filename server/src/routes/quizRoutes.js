const express = require('express');
const { generateQuiz, getQuiz, startQuiz, answerQuestion, submitQuiz } = require('../controllers/quizController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.post('/generate', generateQuiz);
router.get('/:id', getQuiz);
router.post('/:id/start', startQuiz);
router.post('/:id/answer', answerQuestion);
router.post('/:id/submit', submitQuiz);

module.exports = router;
