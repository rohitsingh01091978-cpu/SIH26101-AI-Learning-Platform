const express = require('express');
const { register, login, me, setPassword, setPasswordValidators, registerValidators, loginValidators } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { loginLimiters, registerLimiter, googleFlowLimiter, googleLinkLimiter, passwordChangeLimiter, forgotLimiters, resetAttemptLimiter } = require('../middleware/rateLimiters');
const { handleValidation } = require('../middleware/validate');
const { capabilities, forgotPassword, forgotValidators, resetPassword, resetValidators } = require('../controllers/passwordResetController');
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

// Password recovery (works only when an email provider is configured; see email/index.js).
router.get('/capabilities', capabilities);
router.post('/forgot-password', ...forgotLimiters, forgotValidators, handleValidation, forgotPassword);
router.post('/reset-password', resetAttemptLimiter, resetValidators, handleValidation, resetPassword);
router.post('/password', authenticate, passwordChangeLimiter, setPasswordValidators, setPassword);

// Google OAuth (authorization-code flow). /google and /google/callback are browser navigations;
// /google/exchange and /google/link are called by the frontend with fetch/axios.
router.get('/google', googleFlowLimiter, startGoogleLogin);
router.get('/google/callback', googleFlowLimiter, googleCallback);
router.post('/google/exchange', googleFlowLimiter, exchangeValidators, exchangeHandoff);
router.post('/google/link', googleFlowLimiter, googleLinkLimiter, linkValidators, linkGoogleAccount);

module.exports = router;
