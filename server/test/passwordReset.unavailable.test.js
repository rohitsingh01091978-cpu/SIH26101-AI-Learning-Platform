// No email provider configured (the default): password recovery must report itself unavailable,
// identically for every request, and must never pretend to send anything or create tokens.
delete process.env.EMAIL_PROVIDER;
delete process.env.EMAIL_API_KEY;
process.env.PASSWORD_RESET_RATE_LIMIT_PER_HOUR = '1000';
process.env.PASSWORD_RESET_IP_LIMIT_PER_HOUR = '1000';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, request, stop } = require('./helpers');
const prisma = require('../src/utils/prisma');

const PREFIX = 'reset-unavail-test-';
let server;
let base;
let email;
let userId;

before(async () => {
  ({ server, base } = await startServer());
  email = `${PREFIX}${Date.now()}@example.com`;
  const res = await request(base, 'POST', '/auth/register', { body: { email, password: 'Original#Pass1', name: 'Unavail' } });
  userId = res.data.user.id;
});
after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await stop(server);
});

const forgot = (e) => request(base, 'POST', '/auth/forgot-password', { body: { email: e } });

test('capabilities reports password recovery as unavailable', async () => {
  const res = await request(base, 'GET', '/auth/capabilities');
  assert.equal(res.status, 200);
  assert.equal(res.data.passwordReset, false);
});

test('forgot-password is 503 "unavailable" for existing and non-existing emails alike - no token, no email', async () => {
  const a = await forgot(email);
  const b = await forgot(`nobody-${Date.now()}@example.com`);
  for (const r of [a, b]) {
    assert.equal(r.status, 503);
    assert.equal(r.data.code, 'PASSWORD_RESET_UNAVAILABLE');
    assert.equal(r.data.message, 'Password recovery is currently unavailable. Please contact the administrator.');
  }
  assert.deepEqual(a.data, b.data, 'no difference between an existing and a non-existing address');
  assert.equal(await prisma.passwordResetToken.count({ where: { userId } }), 0);
});

test('the intentional 503 message is shown as-is in PRODUCTION (not masked as an internal error)', async () => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const res = await forgot(email);
    assert.equal(res.status, 503);
    assert.equal(res.data.message, 'Password recovery is currently unavailable. Please contact the administrator.');
    assert.equal(res.data.code, 'PASSWORD_RESET_UNAVAILABLE');
  } finally {
    process.env.NODE_ENV = saved;
  }
});

test('redeeming a token still refuses junk when email is not configured', async () => {
  const res = await request(base, 'POST', '/auth/reset-password', { body: { token: 'z'.repeat(50), newPassword: 'Sturdy#Pass123' } });
  assert.equal(res.status, 400);
  assert.equal(res.data.code, 'INVALID_RESET_TOKEN');
});
