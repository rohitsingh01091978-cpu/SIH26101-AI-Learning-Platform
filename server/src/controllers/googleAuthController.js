const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { signToken } = require('../utils/jwt');
const oauth = require('../auth/googleOAuth');
const { isBlockedDemoUser } = require('../utils/demoAccounts');

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });
const sessionResponse = (user) => ({ success: true, token: signToken(user), user: publicUser(user) });

// Sends the browser back to the frontend login page with a short, non-sensitive reason code.
function redirectToLogin(res, reason) {
  const base = oauth.frontendBaseUrl();
  if (!base) {
    return res.status(500).json({ success: false, message: 'Sign-in is temporarily unavailable.' });
  }
  return res.redirect(`${base}/login?google_error=${encodeURIComponent(reason)}`);
}

// ---------------------------------------------------------------- GET /auth/google

const startGoogleLogin = (req, res) => {
  const config = oauth.getConfig();
  if (!config.configured) return redirectToLogin(res, 'unavailable');

  const tx = oauth.newTransaction();
  const url = oauth.getClient().generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state: tx.state,
    nonce: tx.nonce,
    code_challenge: tx.codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account', // always show Google's account chooser
    access_type: 'online',
  });

  res.setHeader('Set-Cookie', oauth.transactionCookie(tx));
  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(url);
};

// ------------------------------------------------------ user lookup / creation

// Returns { user } to sign in, or { linkRequired: user } when the verified Google
// email belongs to an existing email/password account (needs its password to link).
async function resolveUser({ sub, email, name }) {
  const byGoogleId = await prisma.user.findUnique({ where: { googleId: sub } });
  if (byGoogleId) return { user: byGoogleId };

  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    // Same email but already tied to a different Google account, or an account
    // with no usable sign-in method: refuse rather than guess.
    if (byEmail.googleId || !byEmail.password) {
      throw new ApiError(409, 'Account conflict.');
    }
    return { linkRequired: byEmail };
  }

  try {
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: null,
        authProvider: 'google',
        googleId: sub,
        // Google sign-up can only ever create a learner. Admins are provisioned by the seed script.
        role: 'LEARNER',
      },
    });
    await prisma.learnerProfile.create({ data: { userId: user.id } });
    return { user };
  } catch (err) {
    // Two concurrent first-time callbacks: the unique constraint stopped the duplicate.
    if (err.code === 'P2002') {
      const existing = await prisma.user.findUnique({ where: { googleId: sub } });
      if (existing) return { user: existing };
    }
    throw err;
  }
}

// ------------------------------------------------- GET /auth/google/callback

const googleCallback = async (req, res) => {
  const tx = oauth.readTransaction(req);
  // The transaction is single use whatever happens next.
  res.setHeader('Set-Cookie', oauth.clearTransactionCookie());
  res.setHeader('Cache-Control', 'no-store');

  try {
    const config = oauth.getConfig();
    if (!config.configured) return redirectToLogin(res, 'unavailable');

    if (req.query.error) {
      return redirectToLogin(res, req.query.error === 'access_denied' ? 'cancelled' : 'failed');
    }

    const { code, state } = req.query;
    if (!tx || typeof code !== 'string' || !code || !oauth.safeEqual(state, tx.state)) {
      return redirectToLogin(res, 'failed');
    }

    const client = oauth.getClient();
    const { tokens } = await client.getToken({ code, codeVerifier: tx.codeVerifier });
    if (!tokens || !tokens.id_token) return redirectToLogin(res, 'failed');

    // Verifies signature (Google's public keys), expiry and audience === our client id.
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
    const claims = ticket.getPayload();

    if (
      !claims ||
      !GOOGLE_ISSUERS.includes(claims.iss) ||
      claims.aud !== config.clientId ||
      !oauth.safeEqual(claims.nonce, tx.nonce) ||
      claims.email_verified !== true ||
      typeof claims.sub !== 'string' ||
      typeof claims.email !== 'string'
    ) {
      return redirectToLogin(res, 'failed');
    }

    const email = claims.email.trim().toLowerCase();
    const name = (claims.name || claims.given_name || email.split('@')[0]).toString().trim().slice(0, 100);
    const result = await resolveUser({ sub: claims.sub, email, name });
    const base = oauth.frontendBaseUrl();
    if (!base) return redirectToLogin(res, 'failed');

    if (result.linkRequired) {
      const linkToken = oauth.createLinkToken(result.linkRequired.id, claims.sub);
      // Fragment: never sent to servers, not included in Referer.
      return res.redirect(
        `${base}/auth/callback#link=${encodeURIComponent(linkToken)}&email=${encodeURIComponent(email)}`
      );
    }

    const handoff = oauth.createHandoffCode(result.user.id);
    return res.redirect(`${base}/auth/callback#code=${encodeURIComponent(handoff)}`);
  } catch (err) {
    // Log the reason only - never tokens, codes or profile data.
    console.error('[google-oauth] callback failed:', err && err.message ? err.message : 'unknown error');
    return redirectToLogin(res, 'failed');
  }
};

// ------------------------------------------------ POST /auth/google/exchange

const exchangeValidators = [body('code').isString().isLength({ min: 20, max: 200 })];

const exchangeHandoff = asyncHandler(async (req, res) => {
  if (!validationResult(req).isEmpty()) throw new ApiError(400, 'Invalid request.');
  const userId = oauth.consumeHandoffCode(req.body.code);
  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  if (!user || isBlockedDemoUser(user)) throw new ApiError(401, 'Sign-in link is invalid or has expired. Please try again.');
  res.setHeader('Cache-Control', 'no-store');
  res.json(sessionResponse(user));
});

// -------------------------------------------------- POST /auth/google/link

const linkValidators = [
  body('linkToken').isString().isLength({ min: 20, max: 2000 }),
  body('password').isString().isLength({ min: 1, max: 128 }),
];

// Completes linking Google to an existing email/password account. Requires the
// account's current password, so a Google identity alone can never take over an
// account that someone else registered with the same (unverified) email.
const linkGoogleAccount = asyncHandler(async (req, res) => {
  if (!validationResult(req).isEmpty()) throw new ApiError(400, 'Invalid request.');

  const link = oauth.verifyLinkToken(req.body.linkToken);
  if (!link) throw new ApiError(401, 'This link has expired. Please start Google sign-in again.');

  const user = await prisma.user.findUnique({ where: { id: link.userId } });
  if (!user || !user.password || user.googleId || isBlockedDemoUser(user)) {
    throw new ApiError(401, 'This link has expired. Please start Google sign-in again.');
  }

  const ok = await bcrypt.compare(req.body.password, user.password);
  if (!ok) throw new ApiError(401, 'Incorrect password.');

  let linked;
  try {
    linked = await prisma.user.update({ where: { id: user.id }, data: { googleId: link.googleId } });
  } catch (err) {
    if (err.code === 'P2002') throw new ApiError(409, 'This Google account is already linked to another user.');
    throw err;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json(sessionResponse(linked));
});

module.exports = {
  startGoogleLogin,
  googleCallback,
  exchangeHandoff,
  exchangeValidators,
  linkGoogleAccount,
  linkValidators,
};
