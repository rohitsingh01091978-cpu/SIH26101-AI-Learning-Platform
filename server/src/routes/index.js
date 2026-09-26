const express = require('express');

const router = express.Router();

router.use('/auth', require('./authRoutes'));
router.use('/profile', require('./profileRoutes'));
router.use('/competencies', require('./competencyRoutes'));
router.use('/assessment', require('./assessmentRoutes'));
router.use('/skill-gaps', require('./skillGapRoutes'));
router.use('/materials', require('./materialRoutes'));
router.use('/quizzes', require('./quizRoutes'));
router.use('/performance', require('./performanceRoutes'));
router.use('/learning-path', require('./learningPathRoutes'));
router.use('/recommendations', require('./recommendationRoutes'));
router.use('/progress', require('./progressRoutes'));
router.use('/igot', require('./igotRoutes'));
router.use('/assistant', require('./assistantRoutes'));
router.use('/admin', require('./adminRoutes'));

module.exports = router;
