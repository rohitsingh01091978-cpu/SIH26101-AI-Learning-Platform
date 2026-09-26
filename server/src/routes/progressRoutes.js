const express = require('express');
const { listProgress, startProgress, updateProgress } = require('../controllers/progressController');
const { authenticate } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');
const v = require('../middleware/requestValidators');

const router = express.Router();
router.use(authenticate);

router.get('/', listProgress);
router.post('/', v.progressStart, handleValidation, startProgress);
router.put('/:id', v.progressUpdate, handleValidation, updateProgress);

module.exports = router;
