// Password reset flow with the in-memory TEST email provider (nothing is ever sent anywhere).
process.env.EMAIL_PROVIDER = 'test';
process.env.PASSWORD_RESET_RATE_LIMIT_PER_HOUR = '1000';
process.env.PASSWORD_RESET_IP_LIMIT_PER_HOUR = '1000';
process.env.PASSWORD_RESET_ATTEMPT_LIMIT = '1000';
process.env.PASSWORD_RESET_MAX_PER_HOUR = '50';
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-value-not-real';
process.env.GOOGLE_CALLBACK_URL = 'http://localhost:5000/api/auth/google/callback';

const crypto = require('node:crypto');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { LEARNER, startServer, request, stop } = require('./helpers');
const prisma = require('../src/utils/prisma');
const { getEmailProvider } = require('../src/email');

const PREFIX = 'reset-test-';
const ORIGINAL = 'Original#Pass1';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
let server;
let base;

const uniqEmail = (tag) => `${PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
const outbox = () => getEmailProvider().outbox;
const mailsTo = (email) => outbox().filter((m) => m.to === email);
const tokenFrom = (mail) => (/#token=([A-Za-z0-9_-]+)/.exec(mail.text) || [])[1];
const forgot = (email) => request(base, 'POST', '/auth/forgot-password', { body: { email } });
const reset = (token, newPassword) => request(base, 'POST', '/auth/reset-password', { body: { token, newPassword } });
const login = (email, password) => request(base, 'POST', '/auth/login', { body: { email, password } });

async function newUser(tag) {
  const email = uniqEmail(tag);
  const res = await request(base, 'POST', '/auth/register', { body: { email, password: ORIGINAL, name: 'Reset Tester' } });
  assert.equal(res.status, 201);
  return { email, token: res.data.token, id: res.data.user.id };
}
// Requests a reset and returns the raw token that was "emailed".
async function issue(email) {
  const before = mailsTo(email).length;
  assert.equal((await forgot(email)).status, 200);
  const mails = mailsTo(email);
  assert.equal(mails.length, before + 1, 'exactly one new email');
  return tokenFrom(mails[mails.length - 1]);
}

before(async () => {
  ({ server, base } = await startServer());
});
after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } }); // cascades to reset tokens
  await stop(server);
});

test('capabilities: password recovery is reported available when an email provider is configured', async () => {
  const res = await request(base, 'GET', '/auth/capabilities');
  assert.equal(res.status, 200);
  assert.equal(res.data.passwordReset, true);
});

test('existing password login still works', async () => {
  const u = await newUser('login');
  const res = await login(u.email, ORIGINAL);
  assert.equal(res.status, 200);
  assert.equal((await login(u.email, 'wrong-password')).status, 401);
  assert.equal((await login(LEARNER.email, LEARNER.password)).status, 200, 'demo learner (enabled in test env) unaffected');
});

test('forgot-password for an existing email: generic 200, one email with a one-time link, only a HASH is stored', async () => {
  const u = await newUser('exists');
  const res = await forgot(u.email);
  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);
  assert.match(res.data.message, /If an account exists/);

  const [mail] = mailsTo(u.email);
  assert.ok(mail, 'an email was handed to the provider');
  assert.match(mail.text, /https:\/\/sih-frontend\.example\.vercel\.app\/reset-password#token=/);
  assert.match(mail.html, /reset-password#token=/);
  const token = tokenFrom(mail);
  assert.ok(token && token.length >= 40, 'token is long and random');

  const rows = await prisma.passwordResetToken.findMany({ where: { userId: u.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tokenHash, sha256(token), 'stored value is the SHA-256 of the token');
  assert.equal(rows[0].tokenHash.length, 64);
  assert.ok(!JSON.stringify(rows).includes(token), 'the raw token is not stored anywhere in the row');
  assert.equal(rows[0].usedAt, null);
  const minutes = (rows[0].expiresAt.getTime() - Date.now()) / 60000;
  assert.ok(minutes > 29 && minutes <= 30.1, `expires in ~30 minutes (got ${minutes.toFixed(1)})`);
  // The response never contains the token.
  assert.ok(!JSON.stringify(res.data).includes(token));
});

test('forgot-password for a NON-existing email: identical response, no email, no token - existence is not revealed', async () => {
  const real = await newUser('same-a');
  const ghost = uniqEmail('ghost');
  const a = await forgot(real.email);
  const b = await forgot(ghost);
  assert.equal(b.status, a.status);
  assert.deepEqual(b.data, a.data, 'byte-for-byte the same JSON body');
  assert.equal(b.headers.get('content-type'), a.headers.get('content-type'));
  assert.equal(mailsTo(ghost).length, 0);
  assert.equal(await prisma.passwordResetToken.count({ where: { user: { email: ghost } } }), 0);
  // Case differences do not matter either.
  assert.deepEqual((await forgot(real.email.toUpperCase())).data, a.data);
});

test('demo accounts never receive reset tokens (generic response, no email)', async () => {
  const res = await forgot(LEARNER.email);
  assert.equal(res.status, 200);
  assert.match(res.data.message, /If an account exists/);
  assert.equal(mailsTo(LEARNER.email).length, 0);
  const demo = await prisma.user.findUnique({ where: { email: LEARNER.email } });
  assert.equal(await prisma.passwordResetToken.count({ where: { userId: demo.id } }), 0);

  // Even a hand-made token for a demo account is refused, and the demo password is untouched.
  const raw = crypto.randomBytes(32).toString('base64url');
  await prisma.passwordResetToken.create({ data: { userId: demo.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 600000) } });
  try {
    assert.equal((await reset(raw, 'Changed#Pass123')).status, 400);
    assert.equal((await login(LEARNER.email, LEARNER.password)).status, 200);
  } finally {
    await prisma.passwordResetToken.deleteMany({ where: { userId: demo.id } });
  }
});

test('malformed requests are rejected with 400', async () => {
  assert.equal((await request(base, 'POST', '/auth/forgot-password', { body: {} })).status, 400);
  assert.equal((await forgot('not-an-email')).status, 400);
  assert.equal((await request(base, 'POST', '/auth/forgot-password', { body: { email: { $ne: 1 } } })).status, 400);
  assert.equal((await request(base, 'POST', '/auth/reset-password', { body: { newPassword: 'Sturdy#Pass1' } })).status, 400);
  assert.equal((await request(base, 'POST', '/auth/reset-password', { body: { token: 'x'.repeat(300), newPassword: 'Sturdy#Pass1' } })).status, 400);
});

test('invalid tokens (random, short, tampered, wrong type) all get the same generic 400', async () => {
  const u = await newUser('invalid');
  const real = await issue(u.email);
  const cases = [crypto.randomBytes(32).toString('base64url'), 'short-token-value-12345', `${real.slice(0, -2)}xx`, real.toUpperCase(), 'a'.repeat(60), ' '.repeat(40)];
  for (const token of cases) {
    const res = await reset(token, 'Sturdy#Pass123');
    assert.equal(res.status, 400, token.slice(0, 10));
    assert.equal(res.data.code, 'INVALID_RESET_TOKEN');
    assert.equal(res.data.message, 'This reset link is invalid or has expired. Please request a new one.');
  }
  assert.equal((await login(u.email, ORIGINAL)).status, 200, 'password unchanged by failed attempts');
});

test('an EXPIRED token is rejected and changes nothing', async () => {
  const u = await newUser('expired');
  const token = await issue(u.email);
  await prisma.passwordResetToken.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const res = await reset(token, 'Sturdy#Pass123');
  assert.equal(res.status, 400);
  assert.equal(res.data.code, 'INVALID_RESET_TOKEN');
  assert.equal((await login(u.email, ORIGINAL)).status, 200);
  assert.equal((await login(u.email, 'Sturdy#Pass123')).status, 401);
});

test('a too-short new password is a 400 and does NOT burn the token', async () => {
  const u = await newUser('weak');
  const token = await issue(u.email);
  assert.equal((await reset(token, 'short')).status, 400);
  assert.equal((await reset(token, 'x'.repeat(73))).status, 400);
  assert.equal((await reset(token, 'Sturdy#Pass123')).status, 200, 'token still valid afterwards');
});

test('successful reset: new password works, old password does not, hash is bcrypt, token is consumed', async () => {
  const u = await newUser('success');
  const token = await issue(u.email);
  const newPassword = 'Brand#New#Pass9';

  const res = await reset(token, newPassword);
  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);
  assert.ok(!JSON.stringify(res.data).includes(newPassword));

  assert.equal((await login(u.email, ORIGINAL)).status, 401, 'old password no longer works');
  const fresh = await login(u.email, newPassword);
  assert.equal(fresh.status, 200, 'new password works');

  const row = await prisma.user.findUnique({ where: { id: u.id } });
  assert.ok(row.password.startsWith('$2'), 'stored as a bcrypt hash');
  assert.notEqual(row.password, newPassword);
  assert.ok(await bcrypt.compare(newPassword, row.password));
  assert.ok(row.passwordChangedAt, 'passwordChangedAt recorded');
  const tokenRow = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  assert.ok(tokenRow.usedAt, 'token marked as used');
});

test('a token cannot be reused after a successful reset', async () => {
  const u = await newUser('reuse');
  const token = await issue(u.email);
  assert.equal((await reset(token, 'First#New#Pass1')).status, 200);

  const again = await reset(token, 'Second#New#Pass2');
  assert.equal(again.status, 400);
  assert.equal(again.data.code, 'INVALID_RESET_TOKEN');
  assert.equal((await login(u.email, 'Second#New#Pass2')).status, 401, 'the reuse attempt changed nothing');
  assert.equal((await login(u.email, 'First#New#Pass1')).status, 200);
});

test('requesting a new link invalidates the previous one', async () => {
  const u = await newUser('supersede');
  const first = await issue(u.email);
  const second = await issue(u.email);
  assert.notEqual(first, second);
  assert.equal((await reset(first, 'Sturdy#Pass123')).status, 400, 'older link is dead');
  assert.equal((await reset(second, 'Sturdy#Pass123')).status, 200);
});

test('two simultaneous redemptions of one token: exactly one wins', async () => {
  const u = await newUser('race');
  const token = await issue(u.email);
  const results = await Promise.all([reset(token, 'Winner#Pass#A1'), reset(token, 'Winner#Pass#B2'), reset(token, 'Winner#Pass#C3')]);
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 400, 400]);
  const wins = ['Winner#Pass#A1', 'Winner#Pass#B2', 'Winner#Pass#C3'];
  let working = 0;
  for (const p of wins) if ((await login(u.email, p)).status === 200) working += 1;
  assert.equal(working, 1, 'only one of the passwords was applied');
});

test('a reset ends sessions issued before it; signing in again works immediately', async () => {
  const u = await newUser('sessions');
  const oldSession = (await login(u.email, ORIGINAL)).data.token;
  assert.equal((await request(base, 'GET', '/auth/me', { token: oldSession })).status, 200);

  const token = await issue(u.email);
  assert.equal((await reset(token, 'Sessions#New#Pass1')).status, 200);

  assert.equal((await request(base, 'GET', '/auth/me', { token: oldSession })).status, 401, 'old session is rejected');
  assert.equal((await request(base, 'GET', '/auth/me', { token: u.token })).status, 401, 'registration session too');
  const fresh = (await login(u.email, 'Sessions#New#Pass1')).data.token;
  assert.equal((await request(base, 'GET', '/auth/me', { token: fresh })).status, 200, 'new sign-in works right away');
});

test('a Google-only account can set a password by reset; its Google link is untouched; Google sign-in still starts', async () => {
  const email = uniqEmail('google');
  const user = await prisma.user.create({ data: { email, name: 'Google Person', password: null, authProvider: 'google', googleId: `sub-${Math.random()}`, role: 'LEARNER' } });
  await prisma.learnerProfile.create({ data: { userId: user.id } });

  const token = await issue(email);
  assert.equal((await reset(token, 'Google#User#Pass1')).status, 200);
  assert.equal((await login(email, 'Google#User#Pass1')).status, 200);
  const row = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(row.googleId, user.googleId);
  assert.equal(row.role, 'LEARNER');

  const start = await fetch(`${base}/auth/google`, { redirect: 'manual' });
  assert.equal(start.status, 302);
  assert.ok(start.headers.get('location').startsWith('https://accounts.google.com/'));
});

test('per-account hourly cap: extra requests are silently not honoured (still the same generic 200)', async () => {
  const u = await newUser('cap');
  process.env.PASSWORD_RESET_MAX_PER_HOUR = '2';
  try {
    const bodies = [];
    for (let i = 0; i < 4; i += 1) {
      const r = await forgot(u.email);
      assert.equal(r.status, 200);
      bodies.push(r.data);
    }
    assert.equal(mailsTo(u.email).length, 2, 'only 2 emails were issued');
    assert.ok(bodies.every((b) => JSON.stringify(b) === JSON.stringify(bodies[0])), 'responses do not reveal the cap');
  } finally {
    process.env.PASSWORD_RESET_MAX_PER_HOUR = '50';
  }
});

test('email delivery failure is invisible to the caller and logs nothing sensitive', async () => {
  const u = await newUser('deliveryfail');
  const provider = getEmailProvider();
  const original = provider.send;
  provider.send = async () => { throw new Error(`smtp exploded for ${u.email} with secret-token-abc123`); };
  const captured = [];
  const errSpy = console.error;
  console.error = (...a) => captured.push(a.join(' '));
  try {
    const res = await forgot(u.email);
    assert.equal(res.status, 200);
    assert.match(res.data.message, /If an account exists/);
    await new Promise((r) => setTimeout(r, 50));
  } finally {
    provider.send = original;
    console.error = errSpy;
  }
  assert.ok(captured.some((l) => l.includes('email delivery failed')), 'the failure is logged');
  assert.ok(!captured.join('\n').match(/exploded|secret-token|@example\.com/), 'no address, token or provider detail in the log');
});

test('no reset token, password or hash is ever written to the logs or returned in responses', async () => {
  const u = await newUser('logs');
  const logs = [];
  const saved = { log: console.log, warn: console.warn, error: console.error };
  for (const level of ['log', 'warn', 'error']) console[level] = (...a) => logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  let token;
  const newPassword = 'Logs#Check#Pass77';
  const bodies = [];
  try {
    const f = await forgot(u.email);
    token = tokenFrom(mailsTo(u.email).pop());
    const r = await reset(token, newPassword);
    const bad = await reset(token, newPassword);
    bodies.push(f.data, r.data, bad.data);
  } finally {
    Object.assign(console, saved);
  }
  const row = await prisma.user.findUnique({ where: { id: u.id } });
  const everything = `${logs.join('\n')}\n${JSON.stringify(bodies)}`;
  for (const secret of [token, sha256(token), newPassword, row.password, u.email]) {
    assert.ok(!everything.includes(secret), `leaked: ${String(secret).slice(0, 8)}...`);
  }
});
