const express = require('express');
const { listCompetencies, myCompetencies } = require('../controllers/competencyController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', listCompetencies);
router.get('/me', myCompetencies);

module.exports = router;
