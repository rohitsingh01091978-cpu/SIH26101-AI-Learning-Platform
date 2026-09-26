// Google OAuth 2.0 / OpenID Connect helpers (authorization-code flow + PKCE).
//
// Security properties:
//  - state, nonce and the PKCE verifier are bound to the browser that started the
//    flow through a signed, HttpOnly, short-lived cookie (no server session needed).
//  - The ID token's signature, issuer, audience and expiry are verified by
//    google-auth-library; we additionally check the nonce and email_verified.
//  - Only the verified `sub` and `email` claims from Google are trusted - never
//    anything supplied by the browser.
//  - The Google client secret is only ever read from the server environment.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const TX_COOKIE = 'sih_oauth_tx';
const TX_COOKIE_PATH = '/api/auth/google';
const TX_TTL_SECONDS = 10 * 60;
const HANDOFF_TTL_MS = 60 * 1000;
const LINK_TTL_SECONDS = 10 * 60;
const ALGORITHM = 'HS256';

const isProduction = () => process.env.NODE_ENV === 'production';

function getConfig() {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const callbackUrl = (process.env.GOOGLE_CALLBACK_URL || '').trim();
  return { clientId, clientSecret, callbackUrl, configured: Boolean(clientId && clientSecret && callbackUrl) };
}

// Where users are sent after Google finishes: the first configured frontend origin.
function frontendBaseUrl() {
  const first = (process.env.FRONTEND_URL || process.env.CLIENT_URL || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .find((o) => o && o !== '*');
  if (first) return first;
  return isProduction() ? null : 'http://localhost:5173';
}

// Overridable so tests can exercise our own logic without calling Google.
let clientFactory = () => {
  const { clientId, clientSecret, callbackUrl } = getConfig();
  return new OAuth2Client(clientId, clientSecret, callbackUrl);
};
const getClient = () => clientFactory();
const setClientFactory = (factory) => {
  clientFactory = factory;
};

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const randomToken = (bytes = 24) => b64url(crypto.randomBytes(bytes));
const sha256b64url = (value) => b64url(crypto.createHash('sha256').update(value).digest());

// ---- transaction cookie (state + nonce + PKCE verifier) ----

function newTransaction() {
  const codeVerifier = randomToken(32);
  return {
    state: randomToken(),
    nonce: randomToken(),
    codeVerifier,
    codeChallenge: sha256b64url(codeVerifier),
  };
}

function cookieAttributes(maxAgeSeconds) {
  return [
    `Path=${TX_COOKIE_PATH}`,
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    // Lax: sent on the top-level redirect back from Google, not on cross-site subrequests.
    'SameSite=Lax',
    ...(isProduction() ? ['Secure'] : []),
  ].join('; ');
}

function transactionCookie(tx) {
  const value = jwt.sign(
    { purpose: 'google_oauth_tx', state: tx.state, nonce: tx.nonce, cv: tx.codeVerifier },
    process.env.JWT_SECRET,
    { algorithm: ALGORITHM, expiresIn: TX_TTL_SECONDS }
  );
  return `${TX_COOKIE}=${value}; ${cookieAttributes(TX_TTL_SECONDS)}`;
}

const clearTransactionCookie = () => `${TX_COOKIE}=; ${cookieAttributes(0)}`;

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1 && part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

// Returns { state, nonce, codeVerifier } or null if missing/tampered/expired.
function readTransaction(req) {
  const raw = readCookie(req, TX_COOKIE);
  if (!raw) return null;
  try {
    const p = jwt.verify(raw, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });
    if (p.purpose !== 'google_oauth_tx') return null;
    return { state: p.state, nonce: p.nonce, codeVerifier: p.cv };
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---- one-time handoff code (backend callback -> frontend) ----
// The session JWT is never put in a URL. The callback redirects with a random,
// single-use, 60-second code which the frontend swaps for the JWT via POST.
// In-memory: fine for a single instance (a redeploy only invalidates codes that are <60s old).

const handoffs = new Map();

function createHandoffCode(userId) {
  const code = randomToken(32);
  handoffs.set(code, { userId, expires: Date.now() + HANDOFF_TTL_MS });
  return code;
}

function consumeHandoffCode(code) {
  const entry = handoffs.get(code);
  handoffs.delete(code); // single use, even if expired
  if (!entry || entry.expires < Date.now()) return null;
  return entry.userId;
}

setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of handoffs) if (entry.expires < now) handoffs.delete(code);
}, 60 * 1000).unref();

// ---- account-link token ----
// Issued when a verified Google email matches an existing email/password account.
// It only proves "this browser controls that Google account"; the caller must
// still supply the existing account's password to complete the link.

function createLinkToken(userId, googleId) {
  return jwt.sign({ purpose: 'google_link', sub: userId, gid: googleId }, process.env.JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: LINK_TTL_SECONDS,
  });
}

function verifyLinkToken(token) {
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });
    if (p.purpose !== 'google_link' || !p.sub || !p.gid) return null;
    return { userId: p.sub, googleId: p.gid };
  } catch {
    return null;
  }
}

module.exports = {
  getConfig,
  frontendBaseUrl,
  getClient,
  setClientFactory,
  newTransaction,
  transactionCookie,
  clearTransactionCookie,
  readTransaction,
  safeEqual,
  createHandoffCode,
  consumeHandoffCode,
  createLinkToken,
  verifyLinkToken,
};
