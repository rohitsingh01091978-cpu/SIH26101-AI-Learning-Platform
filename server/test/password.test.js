// Tests for POST /api/auth/password: letting a Google-created (password-less) user add an
// email/password login, and changing an existing password. Uses throwaway "google-test-" users.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { LEARNER, startServer, request, stop } = require('./helpers');
const prisma = require('../src/utils/prisma');
const { signToken } = require('../src/utils/jwt');

const PREFIX = 'pwsetting-test-';
let server;
let base;

const uniq = () => `${PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

// A user exactly as Google sign-up creates them: no password, googleId set, LEARNER.
async function googleOnlyUser() {
  const email = uniq();
  const user = await prisma.user.create({
    data: { email, name: 'Google Only', password: null, authProvider: 'google', googleId: `sub-${email}`, role: 'LEARNER' },
  });
  await prisma.learnerProfile.create({ data: { userId: user.id } });
  return user;
}

before(async () => {
  ({ server, base } = await startServer());
});
after(async () => {
  const users = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  for (const u of users) {
    await prisma.learnerProfile.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
  await stop(server);
});

test('/auth/me reports hasPassword/hasGoogle (booleans only, never the hash)', async () => {
  const user = await googleOnlyUser();
  const me = await request(base, 'GET', '/auth/me', { token: signToken(user) });
  assert.equal(me.data.user.hasPassword, false);
  assert.equal(me.data.user.hasGoogle, true);
  assert.ok(!JSON.stringify(me.data).includes('$2'), 'no bcrypt hash in response');
});

test('Google-only user cannot password-login until a password is set', async () => {
  const user = await googleOnlyUser();
  const res = await request(base, 'POST', '/auth/login', { body: { email: user.email, password: 'Sturdy#Pass123' } });
  assert.equal(res.status, 401);
  assert.equal(res.data.message, 'Invalid email or password.');
});

test('Google-only user with a fresh session can set a password, then password login works and Google link is kept', async () => {
  const user = await googleOnlyUser();
  const token = signToken(user);
  const password = 'Sturdy#Pass123';

  const set = await request(base, 'POST', '/auth/password', { token, body: { newPassword: password } });
  assert.equal(set.status, 200);
  assert.equal(set.data.hasPassword, true);
  assert.ok(!JSON.stringify(set.data).includes(password));

  const row = await prisma.user.findUnique({ where: { id: user.id } });
  assert.ok(row.password.startsWith('$2'), 'stored as a bcrypt hash');
  assert.notEqual(row.password, password, 'never plaintext');
  assert.equal(row.googleId, user.googleId, 'Google sign-in link untouched');
  assert.equal(row.role, 'LEARNER');

  const login = await request(base, 'POST', '/auth/login', { body: { email: user.email, password } });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.role, 'LEARNER');
  assert.equal((await request(base, 'POST', '/auth/login', { body: { email: user.email, password: 'wrong-password' } })).status, 401);
  assert.equal((await request(base, 'GET', '/admin/dashboard', { token: login.data.token })).status, 403);
});

test('stale session (token older than 15 min) cannot add a password to a password-less account', async () => {
  const user = await googleOnlyUser();
  const stale = jwt.sign({ sub: user.id, role: 'LEARNER', iat: Math.floor(Date.now() / 1000) - 3600 }, process.env.JWT_SECRET, { expiresIn: '7d' });
  const res = await request(base, 'POST', '/auth/password', { token: stale, body: { newPassword: 'Sturdy#Pass123' } });
  assert.equal(res.status, 403);
  assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).password, null);
});

test('changing an existing password requires the correct current password', async () => {
  const email = uniq();
  const first = 'First#Pass123';
  const reg = await request(base, 'POST', '/auth/register', { body: { email, password: first, name: 'Local' } });
  const token = reg.data.token;

  assert.equal((await request(base, 'POST', '/auth/password', { token, body: { newPassword: 'Second#Pass123' } })).status, 400);
  assert.equal((await request(base, 'POST', '/auth/password', { token, body: { currentPassword: 'nope-nope', newPassword: 'Second#Pass123' } })).status, 401);
  assert.equal((await request(base, 'POST', '/auth/login', { body: { email, password: first } })).status, 200, 'old password still valid after failed change');

  const ok = await request(base, 'POST', '/auth/password', { token, body: { currentPassword: first, newPassword: 'Second#Pass123' } });
  assert.equal(ok.status, 200);
  assert.equal((await request(base, 'POST', '/auth/login', { body: { email, password: first } })).status, 401);
  assert.equal((await request(base, 'POST', '/auth/login', { body: { email, password: 'Second#Pass123' } })).status, 200);
});

test('validation, authentication and demo-account protection', async () => {
  const user = await googleOnlyUser();
  const token = signToken(user);
  assert.equal((await request(base, 'POST', '/auth/password', { body: { newPassword: 'Sturdy#Pass123' } })).status, 401);
  assert.equal((await request(base, 'POST', '/auth/password', { token, body: { newPassword: 'short' } })).status, 400);
  assert.equal((await request(base, 'POST', '/auth/password', { token, body: { newPassword: 'x'.repeat(200) } })).status, 400);
  assert.equal((await request(base, 'POST', '/auth/password', { token, body: {} })).status, 400);
  assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).password, null);

  // The seeded demo learner cannot have its public password changed, and still logs in.
  const demo = await request(base, 'POST', '/auth/login', { body: LEARNER });
  assert.equal(demo.status, 200);
  const blocked = await request(base, 'POST', '/auth/password', {
    token: demo.data.token,
    body: { currentPassword: LEARNER.password, newPassword: 'Changed#Pass123' },
  });
  assert.equal(blocked.status, 403);
  assert.equal((await request(base, 'POST', '/auth/login', { body: LEARNER })).status, 200);
});

test('wrong current password is rate limited (429 after 5 failures)', async () => {
  const email = uniq();
  const reg = await request(base, 'POST', '/auth/register', { body: { email, password: 'First#Pass123', name: 'Local' } });
  const statuses = [];
  for (let i = 0; i < 7; i += 1) {
    statuses.push((await request(base, 'POST', '/auth/password', { token: reg.data.token, body: { currentPassword: `bad-${i}`, newPassword: 'Second#Pass123' } })).status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429, 429]);
});
