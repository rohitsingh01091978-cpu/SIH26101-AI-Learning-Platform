const express = require('express');
const { register, login, me, registerValidators, loginValidators } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { loginLimiters, registerLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post('/register', registerLimiter, registerValidators, register);
router.post('/login', ...loginLimiters, loginValidators, login);
router.get('/me', authenticate, me);

module.exports = router;
