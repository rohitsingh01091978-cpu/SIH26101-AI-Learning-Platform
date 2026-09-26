// Google OAuth tests.
//
// IMPORTANT - what these do and do not prove:
//  * They exercise OUR code for real: the redirect to Google, state/nonce/PKCE/cookie
//    handling, user creation/linking, one-time handoff, RBAC and the session JWT.
//  * The two calls that talk to Google (code -> tokens, ID-token verification) are
//    replaced by a stub so tests can run offline with fake credentials. So these tests
//    do NOT prove that a real Google account can sign in; that requires manual testing
//    with real Google Cloud credentials (see docs/google-oauth-setup.md).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('./helpers');

process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-value-not-real';
process.env.GOOGLE_CALLBACK_URL = 'http://localhost:5000/api/auth/google/callback';
process.env.GOOGLE_RATE_LIMIT_MAX = '1000';

const { request, startServer, stop, LEARNER } = helpers;
const oauth = require('../src/auth/googleOAuth');
const prisma = require('../src/utils/prisma');
const { OAuth2Client } = require('google-auth-library');

const FRONTEND = process.env.FRONTEND_URL; // set by helpers.js
const TEST_PREFIX = 'google-test-';
const uniq = () => `${TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let server;
let base;
const origin = () => base.replace(/\/api$/, '');

async function get(path, { cookie } = {}) {
  const res = await fetch(`${base}${path}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, location: res.headers.get('location'), headers: res.headers };
}

// Starts a flow and returns what Google would have received plus the browser's cookie.
async function beginFlow() {
  const res = await get('/auth/google');
  const url = new URL(res.location);
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith('sih_oauth_tx='));
  return {
    res,
    url,
    cookie: setCookie ? setCookie.split(';')[0] : undefined,
    state: url.searchParams.get('state'),
    nonce: url.searchParams.get('nonce'),
    setCookie,
  };
}

// Stub for the two network calls to Google.
function stubGoogle(claimsFor) {
  oauth.setClientFactory(() => {
    const real = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_CALLBACK_URL);
    real.getToken = async () => ({ tokens: { id_token: 'stub-id-token' } });
    real.verifyIdToken = async () => ({ getPayload: () => claimsFor() });
    return real;
  });
}
const restoreGoogle = () =>
  oauth.setClientFactory(
    () => new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_CALLBACK_URL)
  );

const claims = (over) => ({
  iss: 'https://accounts.google.com',
  aud: process.env.GOOGLE_CLIENT_ID,
  sub: `sub-${uniq()}`,
  email: `${uniq()}@example.com`,
  email_verified: true,
  name: 'Test Google User',
  ...over,
});

// Runs a complete callback with given claims; returns the redirect Location.
async function completeFlow(makeClaims, { tamper } = {}) {
  const flow = await beginFlow();
  stubGoogle(() => makeClaims(flow));
  const state = tamper === 'state' ? 'wrong-state' : flow.state;
  const cookie = tamper === 'nocookie' ? undefined : flow.cookie;
  return get(`/auth/google/callback?code=fake-auth-code&state=${state}`, { cookie });
}

const fragment = (location) => new URLSearchParams(new URL(location).hash.slice(1));

before(async () => {
  ({ server, base } = await startServer());
});
after(async () => {
  restoreGoogle();
  const users = await prisma.user.findMany({ where: { email: { startsWith: TEST_PREFIX } }, select: { id: true } });
  for (const u of users) {
    await prisma.learnerProfile.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
  await stop(server);
});

// ---------------------------------------------------------------- start of flow

test('GET /auth/google redirects to Google with state, nonce, PKCE and account chooser', async () => {
  const f = await beginFlow();
  assert.equal(f.res.status, 302);
  assert.equal(f.url.origin + f.url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  const q = f.url.searchParams;
  assert.equal(q.get('client_id'), process.env.GOOGLE_CLIENT_ID);
  assert.equal(q.get('redirect_uri'), process.env.GOOGLE_CALLBACK_URL);
  assert.equal(q.get('response_type'), 'code');
  assert.deepEqual(q.get('scope').split(' ').sort(), ['email', 'openid', 'profile']);
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.ok(q.get('code_challenge'));
  assert.ok(f.state && f.state.length >= 20);
  assert.ok(f.nonce && f.nonce.length >= 20);
  assert.equal(q.get('prompt'), 'select_account');
});

test('transaction cookie is HttpOnly + SameSite=Lax and the client secret is never in the redirect', async () => {
  const f = await beginFlow();
  assert.match(f.setCookie, /HttpOnly/i);
  assert.match(f.setCookie, /SameSite=Lax/i);
  assert.ok(!f.res.location.includes(process.env.GOOGLE_CLIENT_SECRET));
  assert.ok(!f.setCookie.includes(process.env.GOOGLE_CLIENT_SECRET));
});

test('when Google credentials are not configured the user is sent back to login (no crash)', async () => {
  const saved = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = '';
  try {
    const res = await get('/auth/google');
    assert.equal(res.status, 302);
    assert.equal(res.location, `${FRONTEND}/login?google_error=unavailable`);
  } finally {
    process.env.GOOGLE_CLIENT_ID = saved;
  }
});

// ------------------------------------------------------------ callback rejection

test('user cancelling on Google (access_denied) returns to login with a cancelled reason', async () => {
  const res = await get('/auth/google/callback?error=access_denied');
  assert.equal(res.location, `${FRONTEND}/login?google_error=cancelled`);
});

test('callback with wrong state, missing cookie, or missing code is rejected', async () => {
  for (const tamper of ['state', 'nocookie']) {
    const res = await completeFlow((f) => claims({ nonce: f.nonce }), { tamper });
    assert.equal(res.location, `${FRONTEND}/login?google_error=failed`, tamper);
  }
  const f = await beginFlow();
  const noCode = await get(`/auth/google/callback?state=${f.state}`, { cookie: f.cookie });
  assert.equal(noCode.location, `${FRONTEND}/login?google_error=failed`);
});

test('callback with a forged/tampered transaction cookie is rejected', async () => {
  const f = await beginFlow();
  const forged = `${f.cookie.slice(0, -3)}abc`;
  const res = await get(`/auth/google/callback?code=x&state=${f.state}`, { cookie: forged });
  assert.equal(res.location, `${FRONTEND}/login?google_error=failed`);
});

test('ID token with wrong nonce, unverified email, wrong issuer or wrong audience is rejected and creates no user', async () => {
  const bad = [
    (f) => claims({ nonce: 'not-the-nonce' }),
    (f) => claims({ nonce: f.nonce, email_verified: false }),
    (f) => claims({ nonce: f.nonce, iss: 'https://evil.example.com' }),
    (f) => claims({ nonce: f.nonce, aud: 'someone-elses-client-id' }),
  ];
  for (const make of bad) {
    const email = `${uniq()}@example.com`;
    const res = await completeFlow((f) => ({ ...make(f), email }));
    assert.equal(res.location, `${FRONTEND}/login?google_error=failed`);
    assert.equal(await prisma.user.count({ where: { email } }), 0);
  }
});

test('the real google-auth-library rejects a forged ID token (signature/format check)', async () => {
  restoreGoogle();
  const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  const forged = `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from('{"iss":"https://accounts.google.com"}').toString('base64url')}.c2ln`;
  await assert.rejects(() => client.verifyIdToken({ idToken: forged, audience: process.env.GOOGLE_CLIENT_ID }));
});

// ---------------------------------------------------- new user / existing user

let newUserEmail;
let newUserSub;

test('new Google user is created as LEARNER (never admin), with no password, and gets a normal session', async () => {
  newUserEmail = `${uniq()}@example.com`;
  newUserSub = `sub-${uniq()}`;
  const res = await completeFlow((f) => claims({ nonce: f.nonce, email: newUserEmail, sub: newUserSub, name: 'New Person' }));
  assert.equal(res.status, 302);
  assert.ok(res.location.startsWith(`${FRONTEND}/auth/callback#code=`));
  assert.ok(!res.location.includes('token='), 'session JWT must not be placed in the URL');

  const code = fragment(res.location).get('code');
  const ex = await request(base, 'POST', '/auth/google/exchange', { body: { code } });
  assert.equal(ex.status, 200);
  assert.equal(ex.data.user.role, 'LEARNER');
  assert.equal(ex.data.user.email, newUserEmail);

  const row = await prisma.user.findUnique({ where: { email: newUserEmail }, include: { profile: true } });
  assert.equal(row.role, 'LEARNER');
  assert.equal(row.password, null);
  assert.equal(row.authProvider, 'google');
  assert.equal(row.googleId, newUserSub);
  assert.ok(row.profile, 'learner profile is created');

  // Normal session works on protected routes.
  const token = ex.data.token;
  assert.equal((await request(base, 'GET', '/auth/me', { token })).status, 200);
  assert.equal((await request(base, 'GET', '/profile', { token })).status, 200);
  assert.equal((await request(base, 'GET', '/competencies/me', { token })).status, 200);
});

test('handoff code is single-use and garbage codes are rejected', async () => {
  const res = await completeFlow((f) => claims({ nonce: f.nonce, email: newUserEmail, sub: newUserSub }));
  const code = fragment(res.location).get('code');
  assert.equal((await request(base, 'POST', '/auth/google/exchange', { body: { code } })).status, 200);
  assert.equal((await request(base, 'POST', '/auth/google/exchange', { body: { code } })).status, 401);
  assert.equal((await request(base, 'POST', '/auth/google/exchange', { body: { code: 'x'.repeat(40) } })).status, 401);
  assert.equal((await request(base, 'POST', '/auth/google/exchange', { body: {} })).status, 400);
});

test('signing in again with the same Google account reuses the user (no duplicate)', async () => {
  const res = await completeFlow((f) => claims({ nonce: f.nonce, email: newUserEmail, sub: newUserSub }));
  assert.ok(res.location.includes('#code='));
  assert.equal(await prisma.user.count({ where: { email: newUserEmail } }), 1);
});

test('Google-created learner cannot access admin routes (403) and unauthenticated gets 401', async () => {
  const res = await completeFlow((f) => claims({ nonce: f.nonce, email: newUserEmail, sub: newUserSub }));
  const ex = await request(base, 'POST', '/auth/google/exchange', { body: { code: fragment(res.location).get('code') } });
  assert.equal((await request(base, 'GET', '/admin/dashboard', { token: ex.data.token })).status, 403);
  assert.equal((await request(base, 'GET', '/admin/dashboard')).status, 401);
});

test('Google-only account cannot use password login (same generic 401)', async () => {
  const res = await request(base, 'POST', '/auth/login', { body: { email: newUserEmail, password: 'Whatever@123' } });
  assert.equal(res.status, 401);
  assert.equal(res.data.message, 'Invalid email or password.');
});

// ----------------------------------------------------------------- account linking

test('verified Google email matching a demo/admin account does NOT sign in; it requires the password to link', async () => {
  for (const email of ['admin@demo.gov.in', LEARNER.email]) {
    const res = await completeFlow((f) => claims({ nonce: f.nonce, email, sub: `sub-${uniq()}` }));
    const frag = fragment(res.location);
    assert.ok(frag.get('link'), `link required for ${email}`);
    assert.equal(frag.get('code'), null, 'no session granted');
  }
  // and nothing was modified on those accounts
  assert.equal(await prisma.user.count({ where: { googleId: { not: null }, email: { in: ['admin@demo.gov.in', LEARNER.email] } } }), 0);
});

test('existing email/password account: link needs correct password; then Google sign-in works; password login still works', async () => {
  const email = `${uniq()}@example.com`;
  const password = 'Sturdy#Pass123';
  const reg = await request(base, 'POST', '/auth/register', { body: { email, password, name: 'Local User' } });
  assert.equal(reg.status, 201);
  const sub = `sub-${uniq()}`;

  const res = await completeFlow((f) => claims({ nonce: f.nonce, email, sub }));
  const linkToken = fragment(res.location).get('link');
  assert.ok(linkToken);
  assert.equal(await prisma.user.count({ where: { email } }), 1, 'no duplicate user');

  const wrong = await request(base, 'POST', '/auth/google/link', { body: { linkToken, password: 'not-the-password' } });
  assert.equal(wrong.status, 401);
  assert.equal((await prisma.user.findUnique({ where: { email } })).googleId, null);

  assert.equal((await request(base, 'POST', '/auth/google/link', { body: { linkToken: 'garbage'.repeat(5), password } })).status, 401);

  const ok = await request(base, 'POST', '/auth/google/link', { body: { linkToken, password } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.role, 'LEARNER');
  const row = await prisma.user.findUnique({ where: { email } });
  assert.equal(row.googleId, sub);
  assert.ok(row.password, 'existing password is kept');

  const again = await completeFlow((f) => claims({ nonce: f.nonce, email, sub }));
  assert.ok(again.location.includes('#code='), 'linked account signs in with Google directly');
  assert.equal((await request(base, 'POST', '/auth/login', { body: { email, password } })).status, 200);
});

test('same email but a DIFFERENT Google account than the linked one is refused', async () => {
  const res = await completeFlow((f) => claims({ nonce: f.nonce, email: newUserEmail, sub: `sub-${uniq()}` }));
  assert.equal(res.location, `${FRONTEND}/login?google_error=failed`);
});

test('repeated wrong passwords on the link endpoint are rate limited (429)', async () => {
  const email = `${uniq()}@example.com`;
  await request(base, 'POST', '/auth/register', { body: { email, password: 'Sturdy#Pass123', name: 'Local User' } });
  const res = await completeFlow((f) => claims({ nonce: f.nonce, email, sub: `sub-${uniq()}` }));
  const linkToken = fragment(res.location).get('link');
  const statuses = [];
  for (let i = 0; i < 7; i += 1) {
    statuses.push((await request(base, 'POST', '/auth/google/link', { body: { linkToken, password: `bad-${i}` } })).status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429, 429]);
});
