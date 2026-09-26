// Rate limits on the password-reset endpoints.
process.env.EMAIL_PROVIDER = 'test';
process.env.PASSWORD_RESET_RATE_LIMIT_PER_HOUR = '3'; // per IP + email
process.env.PASSWORD_RESET_IP_LIMIT_PER_HOUR = '1000';
process.env.PASSWORD_RESET_ATTEMPT_LIMIT = '5';
process.env.PASSWORD_RESET_MAX_PER_HOUR = '50';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, request, stop } = require('./helpers');
const prisma = require('../src/utils/prisma');

const PREFIX = 'reset-limit-test-';
let server;
let base;

before(async () => {
  ({ server, base } = await startServer());
});
after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await stop(server);
});

const forgot = (email) => request(base, 'POST', '/auth/forgot-password', { body: { email } });

test('forgot-password is limited per email address, identically whether or not the account exists', async () => {
  const real = `${PREFIX}real-${Date.now()}@example.com`;
  await request(base, 'POST', '/auth/register', { body: { email: real, password: 'Original#Pass1', name: 'Limit' } });
  const ghost = `${PREFIX}ghost-${Date.now()}@example.com`;

  const realStatuses = [];
  const ghostStatuses = [];
  for (let i = 0; i < 5; i += 1) {
    realStatuses.push((await forgot(real)).status);
    ghostStatuses.push((await forgot(ghost)).status);
  }
  assert.deepEqual(realStatuses, [200, 200, 200, 429, 429]);
  assert.deepEqual(ghostStatuses, realStatuses, 'the limit pattern does not reveal which address is registered');

  const blocked = await forgot(real);
  assert.equal(blocked.data.success, false);
  assert.match(blocked.data.message, /Too many password reset requests/);
  assert.ok(blocked.headers.get('retry-after'));

  // another address from the same client is not blocked
  assert.equal((await forgot(`${PREFIX}other-${Date.now()}@example.com`)).status, 200);
});

test('reset-password: repeated failed attempts are limited (429), so the endpoint cannot be hammered', async () => {
  const statuses = [];
  for (let i = 0; i < 7; i += 1) {
    statuses.push((await request(base, 'POST', '/auth/reset-password', { body: { token: `${'a'.repeat(50)}${i}`, newPassword: 'Sturdy#Pass123' } })).status);
  }
  assert.deepEqual(statuses, [400, 400, 400, 400, 400, 429, 429]);
});
