// Step 1 hardening: demo-account guard, input validation, file-path hiding, per-minute limits.
// Must be set before the app (and its limiters) load.
process.env.UPLOAD_RATE_LIMIT_PER_MINUTE = '3';
process.env.AI_JOB_RATE_LIMIT_PER_MINUTE = '3';

const fs = require('node:fs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { LEARNER, ADMIN, startServer, request, stop } = require('./helpers');
const prisma = require('../src/utils/prisma');
const { signToken } = require('../src/utils/jwt');
const oauth = require('../src/auth/googleOAuth');
const { demoAccountsEnabled } = require('../src/utils/demoAccounts');

const PREFIX = 'hardening-test-';
let server;
let base;
const { getStorage } = require('../src/storage');
const createdKeys = [];

const uniqEmail = (tag) => `${PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;

async function makeUser(tag) {
  const user = await prisma.user.create({
    data: { email: uniqEmail(tag), name: `Hardening ${tag}`, password: null, role: 'LEARNER', authProvider: 'google', googleId: `sub-${PREFIX}${tag}-${Date.now()}-${Math.random()}` },
  });
  await prisma.learnerProfile.create({ data: { userId: user.id } });
  return { user, token: signToken(user) };
}

before(async () => {
  ({ server, base } = await startServer());
});
after(async () => {
  process.env.DEMO_ACCOUNTS_ENABLED = 'true';
  for (const k of createdKeys) await getStorage().delete(k).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await stop(server);
});

// ------------------------------------------------------------------ demo-account guard

test('demoAccountsEnabled(): explicit flag wins; unset = on in dev/test, OFF in production', () => {
  const saved = { flag: process.env.DEMO_ACCOUNTS_ENABLED, env: process.env.NODE_ENV };
  try {
    delete process.env.DEMO_ACCOUNTS_ENABLED;
    process.env.NODE_ENV = 'production';
    assert.equal(demoAccountsEnabled(), false);
    process.env.NODE_ENV = 'test';
    assert.equal(demoAccountsEnabled(), true);
    process.env.NODE_ENV = 'production';
    process.env.DEMO_ACCOUNTS_ENABLED = 'true';
    assert.equal(demoAccountsEnabled(), true);
    process.env.DEMO_ACCOUNTS_ENABLED = 'false';
    process.env.NODE_ENV = 'test';
    assert.equal(demoAccountsEnabled(), false);
  } finally {
    process.env.NODE_ENV = saved.env;
    if (saved.flag === undefined) delete process.env.DEMO_ACCOUNTS_ENABLED; else process.env.DEMO_ACCOUNTS_ENABLED = saved.flag;
  }
});

test('with demo accounts disabled: demo logins get the generic 401, old demo sessions die, real users are unaffected', async () => {
  process.env.DEMO_ACCOUNTS_ENABLED = 'true';
  const before = await request(base, 'POST', '/auth/login', { body: LEARNER });
  assert.equal(before.status, 200, 'enabled: demo login works');
  const demoToken = before.data.token;

  const real = await request(base, 'POST', '/auth/register', { body: { email: uniqEmail('real'), password: 'Sturdy#Pass123', name: 'Real User' } });
  assert.equal(real.status, 201);
  const realEmail = real.data.user.email;

  const warn = console.warn;
  console.warn = () => {};
  try {
    process.env.DEMO_ACCOUNTS_ENABLED = 'false';

    for (const creds of [LEARNER, ADMIN]) {
      const res = await request(base, 'POST', '/auth/login', { body: creds });
      assert.equal(res.status, 401);
      assert.equal(res.data.message, 'Invalid email or password.');
    }
    // A session issued while demo accounts were enabled stops working immediately.
    assert.equal((await request(base, 'GET', '/auth/me', { token: demoToken })).status, 401);

    // Real accounts are not affected in any way.
    assert.equal((await request(base, 'POST', '/auth/login', { body: { email: realEmail, password: 'Sturdy#Pass123' } })).status, 200);
    assert.equal((await request(base, 'GET', '/auth/me', { token: real.data.token })).status, 200);

    // A Google handoff for a demo user is refused too.
    const demoUser = await prisma.user.findUnique({ where: { email: LEARNER.email } });
    const code = oauth.createHandoffCode(demoUser.id);
    assert.equal((await request(base, 'POST', '/auth/google/exchange', { body: { code } })).status, 401);
  } finally {
    console.warn = warn;
    process.env.DEMO_ACCOUNTS_ENABLED = 'true';
  }
  assert.equal((await request(base, 'POST', '/auth/login', { body: LEARNER })).status, 200, 're-enabled: works again');
  // No data was touched: the demo accounts still exist.
  assert.ok(await prisma.user.findUnique({ where: { email: ADMIN.email } }));
});

test('the demo domain cannot be registered by the public', async () => {
  const res = await request(base, 'POST', '/auth/register', { body: { email: 'attacker@demo.gov.in', password: 'Sturdy#Pass123', name: 'X' } });
  assert.equal(res.status, 400);
});

// ------------------------------------------------------------------------- validation

test('profile: the full profile object the React form sends is accepted; bad values -> 400', async () => {
  const { token } = await makeUser('profile');
  const current = await request(base, 'GET', '/profile', { token });
  assert.equal(current.status, 200);
  // exactly what Profile.jsx does: PUT the whole object back (nulls, ids, dates included)
  assert.equal((await request(base, 'PUT', '/profile', { token, body: current.data.profile })).status, 200);
  assert.equal((await request(base, 'PUT', '/profile', { token, body: { ...current.data.profile, experience: '5', department: 'Statistics' } })).status, 200);
  assert.equal((await request(base, 'PUT', '/profile', { token, body: { experience: '' } })).status, 200);

  for (const bad of [{ experience: 'abc' }, { experience: -1 }, { experience: 61 }, { experience: 2.5 }, { targetRole: { a: 1 } }, { name: 'x'.repeat(101) }, { learningGoals: 'y'.repeat(1001) }, { department: ['a'] }]) {
    const res = await request(base, 'PUT', '/profile', { token, body: bad });
    assert.equal(res.status, 400, JSON.stringify(bad).slice(0, 40));
    assert.ok(!JSON.stringify(res.data).includes('abc'), 'submitted values are not echoed');
  }
});

test('progress: unknown course -> 404, bad status/percent -> 400, foreign recommendation -> 400, valid flow works', async () => {
  const { token } = await makeUser('progress');
  assert.equal((await request(base, 'POST', '/progress', { token, body: { courseId: 'not-a-real-course' } })).status, 404);
  assert.equal((await request(base, 'POST', '/progress', { token, body: {} })).status, 400);

  const course = await prisma.course.findFirst();
  const started = await request(base, 'POST', '/progress', { token, body: { courseId: course.id } });
  assert.equal(started.status, 201);
  const id = started.data.progress.id;

  assert.equal((await request(base, 'PUT', `/progress/${id}`, { token, body: { status: 'BOGUS' } })).status, 400);
  assert.equal((await request(base, 'PUT', `/progress/${id}`, { token, body: { progressPercent: 150 } })).status, 400);
  assert.equal((await request(base, 'PUT', `/progress/${id}`, { token, body: { progressPercent: 'abc' } })).status, 400);
  assert.equal((await request(base, 'PUT', `/progress/${id}`, { token, body: { progressPercent: 40, status: 'IN_PROGRESS' } })).status, 200);

  // Another learner's recommendation cannot be attached to this learner's progress.
  const otherRec = await prisma.learningRecommendation.findFirst();
  if (otherRec) {
    const course2 = await prisma.course.findFirst({ where: { id: { not: course.id } } });
    const res = await request(base, 'POST', '/progress', { token, body: { courseId: course2.id, recommendationId: otherRec.id } });
    assert.equal(res.status, 400);
  }
});

test('assessment and quiz submissions: malformed payloads -> 400; -1 (unanswered) is still accepted', async () => {
  const { token } = await makeUser('assess');
  const start = await request(base, 'POST', '/assessment/start', { token });
  assert.equal(start.status, 201);
  const q = start.data.questions[0];
  const submit = (responses, attemptId = start.data.attemptId) => request(base, 'POST', '/assessment/submit', { token, body: { attemptId, responses } });

  assert.equal((await submit([])).status, 400);
  assert.equal((await submit('nope')).status, 400);
  assert.equal((await submit([{ questionId: q.id, selectedAnswer: 9 }])).status, 400);
  assert.equal((await submit([{ questionId: q.id, selectedAnswer: 'a' }])).status, 400);
  assert.equal((await submit([{ selectedAnswer: 1 }])).status, 400);
  assert.equal((await submit(Array.from({ length: 101 }, () => ({ questionId: q.id, selectedAnswer: 0 })))).status, 400);
  // The UI sends -1 for questions the learner skipped: must keep working.
  const ok = await submit(start.data.questions.map((x) => ({ questionId: x.id, selectedAnswer: -1, responseTimeMs: 500 })));
  assert.equal(ok.status, 200);

  const quiz = (path, body) => request(base, 'POST', path, { token, body });
  assert.equal((await quiz('/quizzes/generate', { materialId: 'x', count: 7 })).status, 400);
  assert.equal((await quiz('/quizzes/generate', { materialId: 'x', difficulty: 'INSANE' })).status, 400);
  assert.equal((await quiz('/quizzes/generate', {})).status, 400);
  assert.equal((await quiz('/quizzes/someid/answer', { attemptId: 'a', questionId: 'b', selectedAnswer: 'zzz' })).status, 400);
  assert.equal((await quiz('/quizzes/someid/answer', { attemptId: 'a' })).status, 400);
  assert.equal((await quiz('/quizzes/someid/submit', {})).status, 400);
});

// ---------------------------------------------------------------- file path never exposed

test('materials API never exposes stored file name/path, owner id or the full extracted text', async () => {
  const { user, token } = await makeUser('files');
  const material = await prisma.learningMaterial.create({
    data: { userId: user.id, fileName: 'stored-name-123.pdf', originalName: 'My Notes.pdf', fileType: 'PDF', fileSize: 1234, filePath: '/app/uploads/stored-name-123.pdf', status: 'UPLOADED', extractedText: 'Some extracted document text about sampling.' },
  });
  const list = await request(base, 'GET', '/materials', { token });
  const one = await request(base, 'GET', `/materials/${material.id}`, { token });
  for (const m of [list.data.materials[0], one.data.material]) {
    assert.deepEqual(Object.keys(m).sort(), ['fileSize', 'fileType', 'hasExtractedText', 'hasStoredFile', 'id', 'originalName', 'status', 'uploadedAt', ...(m.quizzes ? ['quizzes'] : []), ...(m.analysis !== undefined ? ['analysis'] : [])].sort());
    assert.equal(m.hasExtractedText, true);
  }
  const blob = JSON.stringify([list.data, one.data]);
  for (const secret of ['stored-name-123', '/app/uploads', 'filePath', 'Some extracted document text', user.id]) {
    assert.ok(!blob.includes(secret), `must not leak: ${secret}`);
  }

  // A real upload's response is sanitised the same way.
  const form = new FormData();
  form.append('file', new Blob(['Statistical sampling and data quality are essential competencies for officers.'], { type: 'text/plain' }), 'notes.txt');
  const up = await request(base, 'POST', '/materials/upload', { token, raw: form });
  assert.equal(up.status, 201);
  assert.ok(!('filePath' in up.data.material) && !('fileName' in up.data.material) && !('userId' in up.data.material));
  const row = await prisma.learningMaterial.findUnique({ where: { id: up.data.material.id } });
  createdKeys.push(row.storageKey);
  assert.ok(row.storageKey && row.storageKey.startsWith(`users/${user.id}/`), 'stored under the owner folder');
});

// --------------------------------------------------------------------- per-minute limits

test('upload is rate limited per learner (429 after the per-minute limit), other learners unaffected', async () => {
  const a = await makeUser('upl-a');
  const b = await makeUser('upl-b');
  const statuses = [];
  for (let i = 0; i < 5; i += 1) statuses.push((await request(base, 'POST', '/materials/upload', { token: a.token })).status);
  assert.deepEqual(statuses, [400, 400, 400, 429, 429]); // 400 = "no file", the limiter counts every attempt
  assert.equal((await request(base, 'POST', '/materials/upload', { token: b.token })).status, 400);
});

test('document analysis and MCQ generation share one per-learner AI-job limit', async () => {
  const { token } = await makeUser('aijob');
  const statuses = [];
  for (let i = 0; i < 4; i += 1) {
    statuses.push((await request(base, 'POST', '/materials/00000000-0000-0000-0000-000000000000/analyze', { token })).status);
  }
  assert.deepEqual(statuses, [404, 404, 404, 429]);
  // MCQ generation draws from the same counter, so it is now limited too.
  assert.equal((await request(base, 'POST', '/quizzes/generate', { token, body: { materialId: 'x', count: 5 } })).status, 429);

  const other = await makeUser('aijob-other');
  assert.equal((await request(base, 'POST', '/quizzes/generate', { token: other.token, body: { materialId: 'x', count: 5 } })).status, 404);
});
