const { body } = require('express-validator');
const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { isDemoEmail } = require('../utils/demoAccounts');
const { isPasswordResetAvailable, issueResetToken, sendResetEmail, redeemResetToken } = require('../services/passwordReset');

// Identical for every well-formed request, whether or not the address belongs to an account.
const GENERIC_FORGOT_RESPONSE = {
  success: true,
  message: 'If an account exists for that email address, password reset instructions have been sent. Please check your inbox.',
};

const forgotValidators = [
  body('email')
    .isString().withMessage('Valid email is required.').bail()
    .trim()
    .isLength({ max: 254 }).withMessage('Valid email is required.').bail()
    .isEmail().withMessage('Valid email is required.'),
];

const resetValidators = [
  body('token').isString().withMessage('token is required.').bail().isLength({ min: 1, max: 200 }).withMessage('token is invalid.'),
  body('newPassword')
    .isString().withMessage('New password is required.').bail()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.').bail()
    .isLength({ max: 72 }).withMessage('Password must be at most 72 characters.'),
];

// GET /auth/capabilities - lets the UI know whether password recovery can work on this deployment.
// Says nothing about any account.
const capabilities = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, passwordReset: isPasswordResetAvailable() });
};

// POST /auth/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
  // No email provider configured: say so plainly (for everyone alike) rather than pretend to send mail.
  if (!isPasswordResetAvailable()) {
    throw new ApiError(503, 'Password recovery is currently unavailable. Please contact the administrator.', null, 'PASSWORD_RESET_UNAVAILABLE');
  }

  const email = req.body.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  // Demo accounts (public credentials) never get reset tokens.
  if (user && !isDemoEmail(user.email)) {
    const token = await issueResetToken(user.id);
    if (token) {
      // Not awaited: the response time must not depend on whether an email was actually sent.
      sendResetEmail({ to: user.email, name: user.name, token }).catch(() => {
        console.error('[password-reset] email delivery failed.'); // no address, token or provider detail is logged
      });
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  res.json(GENERIC_FORGOT_RESPONSE);
});

// POST /auth/reset-password
const resetPassword = asyncHandler(async (req, res) => {
  await redeemResetToken(req.body.token, req.body.newPassword);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, message: 'Your password has been reset. You can now sign in with your new password.' });
});

module.exports = { capabilities, forgotPassword, forgotValidators, resetPassword, resetValidators, GENERIC_FORGOT_RESPONSE };
