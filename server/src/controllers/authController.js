const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { signToken } = require('../utils/jwt');
const { isDemoEmail, isBlockedDemoUser } = require('../utils/demoAccounts');

const emailRule = () =>
  body('email')
    .isString().withMessage('Valid email is required.').bail()
    .trim()
    .isLength({ max: 254 }).withMessage('Valid email is required.').bail()
    .isEmail().withMessage('Valid email is required.');

const registerValidators = [
  emailRule(),
  body('password')
    .isString().withMessage('Password is required.').bail()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.').bail()
    // bcrypt only uses the first 72 bytes, so longer input adds no security.
    .isLength({ max: 72 }).withMessage('Password must be at most 72 characters.'),
  body('name')
    .isString().withMessage('Name is required.').bail()
    .trim()
    .notEmpty().withMessage('Name is required.').bail()
    .isLength({ max: 100 }).withMessage('Name must be at most 100 characters.'),
];

const loginValidators = [
  emailRule(),
  body('password')
    .isString().withMessage('Password is required.').bail()
    .notEmpty().withMessage('Password is required.').bail()
    .isLength({ max: 128 }).withMessage('Password is too long.'),
];

// express-validator's raw errors include the submitted `value` (which for the
// password field would echo the password back), so only expose field + message.
function checkValidation(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({ field: e.path, message: e.msg }));
    throw new ApiError(400, 'Validation failed.', details);
  }
}

// Compared against when the email is unknown so that "no such user" takes as
// long as "wrong password" and response timing does not reveal which emails exist.
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
const DUMMY_HASH = bcrypt.hashSync('timing-equalisation-placeholder', SALT_ROUNDS);

const register = asyncHandler(async (req, res) => {
  checkValidation(req);
  const { email, password, name } = req.body;

  // The demo domain is reserved for the seeded demo accounts; the public cannot register into it.
  if (isDemoEmail(email)) {
    throw new ApiError(400, 'Please use a different email address.');
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: passwordHash,
      name,
      // Public registration always creates a LEARNER. Admin accounts are
      // provisioned by the seed script, never by a client-supplied role.
      role: 'LEARNER',
    },
  });

  await prisma.learnerProfile.create({ data: { userId: user.id } });

  const token = signToken(user);
  res.status(201).json({
    success: true,
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

const login = asyncHandler(async (req, res) => {
  checkValidation(req);
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Google-only accounts have no password: they can never pass this check, and
  // get the same generic error (and the same timing) as any other failure.
  const isValid = await bcrypt.compare(password, (user && user.password) || DUMMY_HASH);
  if (!user || !user.password || !isValid) {
    throw new ApiError(401, 'Invalid email or password.');
  }
  // Demo accounts are refused when disabled, with the same generic error (no hint that the account exists).
  if (isBlockedDemoUser(user)) {
    console.warn('[auth] sign-in refused: demo accounts are disabled (DEMO_ACCOUNTS_ENABLED).');
    throw new ApiError(401, 'Invalid email or password.');
  }

  const token = signToken(user);
  res.json({
    success: true,
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { profile: true },
  });
  if (!user) throw new ApiError(404, 'User not found.');

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      // Booleans only - never the hash. Lets the UI offer "set a password" to Google-only accounts.
      hasPassword: Boolean(user.password),
      hasGoogle: Boolean(user.googleId),
      profile: user.profile,
    },
  });
});

// ---------------------------------------------------------------- set / change password

const RECENT_SIGN_IN_SECONDS = 15 * 60;

const setPasswordValidators = [
  body('newPassword')
    .isString().withMessage('New password is required.').bail()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.').bail()
    .isLength({ max: 72 }).withMessage('Password must be at most 72 characters.'),
  body('currentPassword')
    .optional()
    .isString().withMessage('Current password must be text.').bail()
    .isLength({ max: 128 }).withMessage('Current password is too long.'),
];

// POST /auth/password  (authenticated)
//  - Account WITH a password (change): the current password must be supplied and correct.
//  - Account WITHOUT one (e.g. created through Google): allowed only if this session's token
//    is recent, so a stale/stolen token cannot plant a permanent password.
// The new password is hashed with the same bcrypt settings as registration and never stored or logged in plaintext.
const setPassword = asyncHandler(async (req, res) => {
  checkValidation(req);
  const { newPassword, currentPassword } = req.body;

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) throw new ApiError(401, 'User account no longer exists.');

  // Seeded demo credentials are public; they must not be changeable by anyone who logs in with them.
  if (user.email.endsWith('@demo.gov.in')) {
    throw new ApiError(403, 'Password changes are disabled for demo accounts.');
  }

  if (user.password) {
    if (typeof currentPassword !== 'string' || !currentPassword) {
      throw new ApiError(400, 'Current password is required.');
    }
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) throw new ApiError(401, 'Current password is incorrect.');
  } else {
    const age = Math.floor(Date.now() / 1000) - (req.tokenIssuedAt || 0);
    if (age > RECENT_SIGN_IN_SECONDS) {
      throw new ApiError(403, 'For your security, please sign out and sign in again, then set your password.');
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { password: passwordHash } });

  res.json({ success: true, message: 'Password saved. You can now sign in with your email and password.', hasPassword: true });
});

module.exports = { register, login, me, setPassword, setPasswordValidators, registerValidators, loginValidators };
