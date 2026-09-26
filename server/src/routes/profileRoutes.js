const express = require('express');
const { getProfile, updateProfile } = require('../controllers/profileController');
const { authenticate } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');
const v = require('../middleware/requestValidators');

const router = express.Router();
router.use(authenticate);

router.get('/', getProfile);
router.put('/', v.profileUpdate, handleValidation, updateProfile);

module.exports = router;
