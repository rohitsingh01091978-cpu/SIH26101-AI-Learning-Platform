const express = require('express');
const { listCourses, searchCourses, getCourseDetails } = require('../controllers/igotController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/courses', listCourses);
router.get('/courses/:id', getCourseDetails);
router.get('/search', searchCourses);

module.exports = router;
