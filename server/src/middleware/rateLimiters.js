const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// Brute-force protection for authentication endpoints only. Nothing else in
// the API is rate limited, so normal app usage is unaffected.
//
// Only FAILED attempts count (skipSuccessfulRequests), so a legitimate user who
// logs in successfully never consumes their budget, and blocks expire on their
// own when the window ends - no account is ever locked permanently.
//
// Two layers:
//   1. per IP + email  - stops guessing one account's password.
//   2. per IP          - stops one client spraying many accounts.
// The store is in-memory (fine for a single Railway instance; it resets on
// restart). Behind a proxy, `trust proxy` is set in app.js so req.ip is the
// real client address.

const toInt = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

const windowMs = toInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000;

const tooManyAttempts = (req, res) => {
  res.status(429).json({
    success: false,
    message: 'Too many failed attempts. Please try again in a few minutes.',
  });
};

const base = {
  windowMs,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: tooManyAttempts,
};

const emailOf = (req) => {
  const email = req.body && req.body.email;
  return typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : '';
};

const loginAccountLimiter = rateLimit({
  ...base,
  limit: toInt(process.env.LOGIN_RATE_LIMIT_MAX, 5),
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${emailOf(req)}`,
});

const loginIpLimiter = rateLimit({
  ...base,
  limit: toInt(process.env.LOGIN_IP_RATE_LIMIT_MAX, 30),
});

// Public registration: limit total sign-ups per IP (successful ones included).
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: toInt(process.env.REGISTER_RATE_LIMIT_MAX, 20),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooManyAttempts,
});

// Google sign-in endpoints: every request counts (each one triggers work against Google or the DB).
const googleFlowLimiter = rateLimit({
  windowMs,
  limit: toInt(process.env.GOOGLE_RATE_LIMIT_MAX, 60),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooManyAttempts,
});

// Linking Google to an existing account verifies that account's password, so it is
// brute-force limited like a login: failed attempts only, per IP + link token.
const googleLinkLimiter = rateLimit({
  ...base,
  limit: toInt(process.env.LOGIN_RATE_LIMIT_MAX, 5),
  keyGenerator: (req) => {
    const token = req.body && typeof req.body.linkToken === 'string' ? req.body.linkToken.slice(-32) : '';
    return `${ipKeyGenerator(req.ip)}|link|${token}`;
  },
});

// Changing a password verifies the current one, so it is brute-force limited like a login
// (failed attempts only, per IP + user). Mount AFTER `authenticate`.
const passwordChangeLimiter = rateLimit({
  ...base,
  limit: toInt(process.env.LOGIN_RATE_LIMIT_MAX, 5),
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|pw|${req.user ? req.user.id : ''}`,
});

// Assistant chat: per learner, so one user cannot run up external-AI usage. Mount AFTER `authenticate`.
const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: toInt(process.env.ASSISTANT_RATE_LIMIT_PER_MINUTE, 20),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `u:${req.user.id}` : ipKeyGenerator(req.ip)),
  handler: (req, res) =>
    res.status(429).json({ success: false, message: 'You are sending messages too quickly. Please wait a moment.' }),
});

// Expensive per-user actions (uploads, AI analysis, MCQ generation). Per minute, per learner.
// Mount AFTER `authenticate`. Daily quotas (Step 2) are separate and come on top of these.
const perUserPerMinute = (envName, defaultLimit, message) =>
  rateLimit({
    windowMs: 60 * 1000,
    limit: toInt(process.env[envName], defaultLimit),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => (req.user ? `u:${req.user.id}` : ipKeyGenerator(req.ip)),
    handler: (req, res) => res.status(429).json({ success: false, message }),
  });

const uploadLimiter = perUserPerMinute('UPLOAD_RATE_LIMIT_PER_MINUTE', 10, 'Too many uploads. Please wait a moment and try again.');
// Downloading and deleting stored files (one shared counter).
const fileAccessLimiter = perUserPerMinute('FILE_ACCESS_RATE_LIMIT_PER_MINUTE', 30, 'Too many file requests. Please wait a moment and try again.');
// One shared counter for document analysis and MCQ generation.
const aiJobLimiter = perUserPerMinute('AI_JOB_RATE_LIMIT_PER_MINUTE', 10, 'Too many AI requests. Please wait a moment and try again.');

// ---- Password reset ----
// Forgot-password: every request counts (successful ones too) and the key is built only from what the
// caller SENT (ip + the email string), never from whether an account exists, so a 429 reveals nothing.
const resetTooMany = (req, res) =>
  res.status(429).json({ success: false, message: 'Too many password reset requests. Please try again later.' });

const forgotIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: toInt(process.env.PASSWORD_RESET_IP_LIMIT_PER_HOUR, 15),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: resetTooMany,
});
const forgotEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: toInt(process.env.PASSWORD_RESET_RATE_LIMIT_PER_HOUR, 3),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|forgot|${emailOf(req)}`,
  handler: resetTooMany,
});
// Redeeming a token: failed attempts per IP (guessing a 256-bit token is hopeless, but the endpoint is still bounded).
const resetAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: toInt(process.env.PASSWORD_RESET_ATTEMPT_LIMIT, 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: resetTooMany,
});

module.exports = {
  forgotLimiters: [forgotIpLimiter, forgotEmailLimiter],
  resetAttemptLimiter,
  fileAccessLimiter,
  uploadLimiter,
  aiJobLimiter,
  loginLimiters: [loginIpLimiter, loginAccountLimiter],
  registerLimiter,
  googleFlowLimiter,
  googleLinkLimiter,
  passwordChangeLimiter,
  assistantLimiter,
};
