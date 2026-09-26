const express = require('express');
const { register, login, me, registerValidators, loginValidators } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { loginLimiters, registerLimiter, googleFlowLimiter, googleLinkLimiter } = require('../middleware/rateLimiters');
const {
  startGoogleLogin,
  googleCallback,
  exchangeHandoff,
  exchangeValidators,
  linkGoogleAccount,
  linkValidators,
} = require('../controllers/googleAuthController');

const router = express.Router();

router.post('/register', registerLimiter, registerValidators, register);
router.post('/login', ...loginLimiters, loginValidators, login);
router.get('/me', authenticate, me);

// Google OAuth (authorization-code flow). /google and /google/callback are browser navigations;
// /google/exchange and /google/link are called by the frontend with fetch/axios.
router.get('/google', googleFlowLimiter, startGoogleLogin);
router.get('/google/callback', googleFlowLimiter, googleCallback);
router.post('/google/exchange', googleFlowLimiter, exchangeValidators, exchangeHandoff);
router.post('/google/link', googleFlowLimiter, googleLinkLimiter, linkValidators, linkGoogleAccount);

module.exports = router;
