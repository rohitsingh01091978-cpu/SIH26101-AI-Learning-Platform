const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { signToken } = require('../utils/jwt');

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
  const isValid = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !isValid) {
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
      profile: user.profile,
    },
  });
});

module.exports = { register, login, me, registerValidators, loginValidators };
