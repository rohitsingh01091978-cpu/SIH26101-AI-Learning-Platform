const express = require('express');
const { register, login, me, registerValidators, loginValidators } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/register', registerValidators, register);
router.post('/login', loginValidators, login);
router.get('/me', authenticate, me);

module.exports = router;
