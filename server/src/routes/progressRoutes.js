const express = require('express');
const { listProgress, startProgress, updateProgress } = require('../controllers/progressController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', listProgress);
router.post('/', startProgress);
router.put('/:id', updateProgress);

module.exports = router;
