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

module.exports = {
  loginLimiters: [loginIpLimiter, loginAccountLimiter],
  registerLimiter,
  googleFlowLimiter,
  googleLinkLimiter,
};
