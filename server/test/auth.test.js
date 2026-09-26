const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { LEARNER, ADMIN, startServer, request, stop } = require('./helpers');

const ORIGIN = process.env.FRONTEND_URL;
let server;
let base;
let learnerToken;
let adminToken;

before(async () => {
  ({ server, base } = await startServer());
});
after(() => stop(server));

test('valid learner login -> 200 with token and no password in body', async () => {
  const res = await request(base, 'POST', '/auth/login', { body: LEARNER });
  assert.equal(res.status, 200);
  assert.equal(res.data.user.role, 'LEARNER');
  assert.ok(res.data.token);
  assert.ok(!JSON.stringify(res.data).includes(LEARNER.password));
  learnerToken = res.data.token;
});

test('valid admin login -> 200', async () => {
  const res = await request(base, 'POST', '/auth/login', { body: ADMIN });
  assert.equal(res.status, 200);
  assert.equal(res.data.user.role, 'ADMIN');
  adminToken = res.data.token;
});

test('wrong password and unknown email return the same generic 401', async () => {
  const wrong = await request(base, 'POST', '/auth/login', { body: { email: LEARNER.email, password: 'nope-nope' } });
  const unknown = await request(base, 'POST', '/auth/login', { body: { email: 'nobody@demo.gov.in', password: 'nope-nope' } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.data.message, 'Invalid email or password.');
  assert.deepEqual(unknown.data, wrong.data);
});

test('missing email / missing password / wrong types -> 400', async () => {
  const noEmail = await request(base, 'POST', '/auth/login', { body: { password: 'x' } });
  const noPassword = await request(base, 'POST', '/auth/login', { body: { email: LEARNER.email } });
  const badEmail = await request(base, 'POST', '/auth/login', { body: { email: 'not-an-email', password: 'x' } });
  const objectEmail = await request(base, 'POST', '/auth/login', { body: { email: { $ne: null }, password: 'x' } });
  const huge = await request(base, 'POST', '/auth/login', { body: { email: LEARNER.email, password: 'a'.repeat(5000) } });
  for (const r of [noEmail, noPassword, badEmail, objectEmail, huge]) assert.equal(r.status, 400);
});

test('validation errors never echo submitted values (register with short password)', async () => {
  const res = await request(base, 'POST', '/auth/register', {
    body: { email: 'shortpw@example.com', password: 'abc', name: 'X' },
  });
  assert.equal(res.status, 400);
  assert.ok(!JSON.stringify(res.data).includes('"abc"'), 'password value must not be echoed');
  assert.ok(res.data.details.every((d) => !('value' in d)));
});

test('malformed JSON body -> clean 400', async () => {
  const res = await request(base, 'POST', '/auth/login', { raw: '{bad json', headers: { 'Content-Type': 'application/json' } });
  assert.equal(res.status, 400);
  assert.equal(res.data.success, false);
});

test('unauthenticated protected route -> 401', async () => {
  for (const path of ['/auth/me', '/profile', '/admin/dashboard', '/competencies/me']) {
    const res = await request(base, 'GET', path);
    assert.equal(res.status, 401, path);
  }
});

test('invalid / tampered / wrong-algorithm JWT -> 401', async () => {
  const garbage = await request(base, 'GET', '/auth/me', { token: 'not.a.jwt' });
  assert.equal(garbage.status, 401);

  const wrongSecret = jwt.sign({ sub: 'x', role: 'ADMIN' }, 'some-other-secret');
  assert.equal((await request(base, 'GET', '/admin/dashboard', { token: wrongSecret })).status, 401);

  const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
    JSON.stringify({ sub: 'x', role: 'ADMIN' })
  ).toString('base64url')}.`;
  assert.equal((await request(base, 'GET', '/admin/dashboard', { token: noneAlg })).status, 401);

  const hs512 = jwt.sign({ sub: 'x', role: 'ADMIN' }, process.env.JWT_SECRET, { algorithm: 'HS512' });
  assert.equal((await request(base, 'GET', '/admin/dashboard', { token: hs512 })).status, 401);
});

test('expired JWT -> 401', async () => {
  const me = await request(base, 'GET', '/auth/me', { token: learnerToken });
  const expired = jwt.sign({ sub: me.data.user.id, role: 'LEARNER' }, process.env.JWT_SECRET, { expiresIn: -10 });
  const res = await request(base, 'GET', '/auth/me', { token: expired });
  assert.equal(res.status, 401);
});

test('a token claiming ADMIN for a learner id does not grant admin (role comes from DB)', async () => {
  const me = await request(base, 'GET', '/auth/me', { token: learnerToken });
  const forged = jwt.sign({ sub: me.data.user.id, role: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  assert.equal((await request(base, 'GET', '/admin/dashboard', { token: forged })).status, 403);
});

test('learner on admin route -> 403; admin on admin route -> 200', async () => {
  assert.equal((await request(base, 'GET', '/admin/dashboard', { token: learnerToken })).status, 403);
  assert.equal((await request(base, 'GET', '/admin/dashboard', { token: adminToken })).status, 200);
});

test('profile and dashboard data still work for the learner', async () => {
  const paths = ['/auth/me', '/profile', '/competencies/me', '/performance', '/skill-gaps', '/learning-path', '/igot/courses', '/progress', '/materials'];
  for (const path of paths) {
    const res = await request(base, 'GET', path, { token: learnerToken });
    assert.equal(res.status, 200, path);
  }
});

test('CORS: configured production origin is allowed', async () => {
  const res = await request(base, 'GET', '/health', { headers: { Origin: ORIGIN } });
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  const pre = await request(base, 'OPTIONS', '/auth/login', {
    headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), ORIGIN);
});

test('CORS: unauthorised origins get no CORS headers', async () => {
  for (const origin of ['https://evil.example.com', 'https://sih-frontend.example.vercel.app.evil.com']) {
    const res = await request(base, 'GET', '/health', { headers: { Origin: origin } });
    assert.equal(res.headers.get('access-control-allow-origin'), null, origin);
  }
});

test('security headers are present and x-powered-by is hidden', async () => {
  const res = await request(base, 'GET', '/health');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('strict-transport-security'));
  assert.ok(res.headers.get('x-frame-options'));
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('unknown route returns a clean 404 without a stack trace', async () => {
  const res = await request(base, 'GET', '/definitely-not-a-route');
  assert.equal(res.status, 404);
  assert.ok(!('stack' in res.data));
});

test('successful logins do not consume the rate-limit budget', async () => {
  for (let i = 0; i < 8; i += 1) {
    const res = await request(base, 'POST', '/auth/login', { body: LEARNER });
    assert.equal(res.status, 200);
  }
});

test('repeated failed logins -> 429 after the limit, other accounts unaffected', async () => {
  const target = { email: 'ratelimit-target@example.com', password: 'wrong-password' };
  const statuses = [];
  for (let i = 0; i < 7; i += 1) {
    statuses.push((await request(base, 'POST', '/auth/login', { body: target })).status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429, 429]);

  const blocked = await request(base, 'POST', '/auth/login', { body: target });
  assert.equal(blocked.data.success, false);
  assert.ok(blocked.headers.get('retry-after'));

  // A different account (and the real demo learner) from the same IP still works.
  assert.equal((await request(base, 'POST', '/auth/login', { body: LEARNER })).status, 200);
});
