// Daily AI quotas (demo provider, small limits so they can be exhausted quickly).
// Must be set before the app loads.
process.env.AI_DAILY_ANALYSES_PER_USER = '3';
process.env.AI_DAILY_MCQ_GENERATIONS_PER_USER = '2';
process.env.AI_DAILY_ASSISTANT_MESSAGES_PER_USER = '4';
process.env.AI_JOB_RATE_LIMIT_PER_MINUTE = '1000';
process.env.ASSISTANT_RATE_LIMIT_PER_MINUTE = '1000';
delete process.env.AI_QUOTAS_ENABLED;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, request, stop } = require('./helpers');
const prisma = require('../src/utils/prisma');
const { signToken } = require('../src/utils/jwt');
const { getUsageSummary } = require('../src/services/aiQuota');

const PREFIX = 'quota-test-';
const HOUR = 60 * 60 * 1000;
const DOC = [
  'Statistical sampling is the process of selecting a subset of a population to estimate population parameters.',
  'Data quality has several dimensions including accuracy, timeliness, coherence and accessibility of official statistics.',
  'The Consumer Price Index measures the average change in prices paid by households over 12 months.',
  'National accounts record the production, income and expenditure of an economy in a consistent framework.',
  'Survey design requires a clear sampling frame, a questionnaire pilot and a plan for non-response follow up.',
  'Metadata standards make statistical datasets easier to discover, understand and reuse across agencies.',
  'Python and SQL are widely used by analysts to clean, join and summarise administrative data sources.',
  'Disaggregated indicators support monitoring of the sustainable development goals at district level.',
].join(' ');

let server;
let base;

async function makeLearner(tag) {
  const user = await prisma.user.create({
    data: { email: `${PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`, name: `Quota ${tag}`, password: null, role: 'LEARNER', authProvider: 'google', googleId: `sub-${Math.random()}` },
  });
  await prisma.learnerProfile.create({ data: { userId: user.id, targetRole: 'TESTROLE' } });
  const sql = await prisma.competency.findUnique({ where: { name: 'SQL' } });
  await prisma.learnerCompetency.create({ data: { userId: user.id, competencyId: sql.id, currentLevel: 12 } });
  const material = await prisma.learningMaterial.create({
    data: { userId: user.id, fileName: 'f.txt', originalName: 'Notes.txt', fileType: 'TXT', fileSize: DOC.length, filePath: 'n/a', status: 'UPLOADED', extractedText: DOC },
  });
  return { user, material, token: signToken(user) };
}
const analyze = (l) => request(base, 'POST', `/materials/${l.material.id}/analyze`, { token: l.token });
const generate = (l) => request(base, 'POST', '/quizzes/generate', { token: l.token, body: { materialId: l.material.id, count: 5 } });
const chat = (l, message = 'What should I learn next?') => request(base, 'POST', '/assistant/chat', { token: l.token, body: { message } });
const usageRows = (l, feature) => prisma.aiUsage.findMany({ where: { userId: l.user.id, ...(feature ? { feature } : {}) }, orderBy: { createdAt: 'asc' } });

before(async () => {
  ({ server, base } = await startServer());
});
after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } }); // cascades to ai_usage
  await stop(server);
});

test('document analyses: the 4th in a day is refused with a clear 429 (limit 3)', async () => {
  const l = await makeLearner('analyses');
  for (let i = 0; i < 3; i += 1) assert.equal((await analyze(l)).status, 200);

  const res = await analyze(l);
  assert.equal(res.status, 429);
  assert.equal(res.data.success, false);
  assert.equal(res.data.code, 'AI_QUOTA_EXCEEDED');
  assert.match(res.data.message, /today's limit of 3 document analyses/);
  assert.match(res.data.message, /try again|use this again/i);
  assert.equal(res.data.quota.limit, 3);
  assert.equal(res.data.quota.feature, 'ANALYZE_DOCUMENT');
  assert.ok(new Date(res.data.quota.resetsAt) > new Date());
  assert.ok(Number(res.headers.get('retry-after')) > 0, 'Retry-After header is set');

  const rows = await usageRows(l, 'ANALYZE_DOCUMENT');
  assert.equal(rows.length, 3, 'the refused request did not create a usage row');
  assert.ok(rows.every((r) => r.status === 'SUCCESS' && r.provider === 'demo' && r.completedAt && r.durationMs >= 0));
  const m = await prisma.learningMaterial.findUnique({ where: { id: l.material.id } });
  assert.equal(m.status, 'COMPLETED', 'a refused request leaves the material untouched');
});

test('MCQ generations: the 3rd in a day is refused (limit 2) and creates no quiz', async () => {
  const l = await makeLearner('mcq');
  assert.equal((await generate(l)).status, 201);
  assert.equal((await generate(l)).status, 201);
  const res = await generate(l);
  assert.equal(res.status, 429);
  assert.equal(res.data.code, 'AI_QUOTA_EXCEEDED');
  assert.match(res.data.message, /limit of 2 MCQ generations/);
  assert.equal(await prisma.quiz.count({ where: { userId: l.user.id } }), 2);
});

test('assistant messages: the 5th in a day is refused (limit 4) with a friendly message', async () => {
  const l = await makeLearner('chat');
  for (let i = 0; i < 4; i += 1) assert.equal((await chat(l)).status, 200);
  const res = await chat(l);
  assert.equal(res.status, 429);
  assert.equal(res.data.code, 'AI_QUOTA_EXCEEDED');
  assert.match(res.data.message, /limit of 4 AI Assistant messages/);
  assert.ok(!/key|token|secret|stack/i.test(JSON.stringify(res.data)));
});

test('quotas are per user and per feature', async () => {
  const a = await makeLearner('iso-a');
  const b = await makeLearner('iso-b');
  for (let i = 0; i < 3; i += 1) await analyze(a);
  assert.equal((await analyze(a)).status, 429);
  // another learner is unaffected
  assert.equal((await analyze(b)).status, 200);
  // the exhausted learner can still use the other AI features
  assert.equal((await chat(a)).status, 200);
  assert.equal((await generate(a)).status, 201);
});

test('requests that fail validation or ownership do not consume quota', async () => {
  const l = await makeLearner('noconsume');
  for (let i = 0; i < 6; i += 1) {
    assert.equal((await request(base, 'POST', '/materials/00000000-0000-0000-0000-000000000000/analyze', { token: l.token })).status, 404);
    assert.equal((await request(base, 'POST', '/quizzes/generate', { token: l.token, body: { materialId: 'x', count: 7 } })).status, 400);
    assert.equal((await request(base, 'POST', '/assistant/chat', { token: l.token, body: { message: '' } })).status, 400);
  }
  assert.equal(await prisma.aiUsage.count({ where: { userId: l.user.id } }), 0);
  assert.equal((await analyze(l)).status, 200, 'full quota still available');
});

test('the window is rolling 24 hours: old usage ages out, recent usage counts, reset time is reported', async () => {
  const old = await makeLearner('old');
  await prisma.aiUsage.createMany({ data: [1, 2, 3].map(() => ({ userId: old.user.id, feature: 'ANALYZE_DOCUMENT', status: 'SUCCESS', createdAt: new Date(Date.now() - 25 * HOUR) })) });
  assert.equal((await analyze(old)).status, 200, 'usage older than 24h does not count');

  const recent = await makeLearner('recent');
  await prisma.aiUsage.createMany({ data: [1, 2, 3].map(() => ({ userId: recent.user.id, feature: 'ANALYZE_DOCUMENT', status: 'SUCCESS', createdAt: new Date(Date.now() - 23 * HOUR) })) });
  const res = await analyze(recent);
  assert.equal(res.status, 429);
  const wait = new Date(res.data.quota.resetsAt).getTime() - Date.now();
  assert.ok(wait > 50 * 60 * 1000 && wait < 70 * 60 * 1000, 'about one hour until a slot frees');
  assert.match(res.data.message, /about (1 hour|\d+ minutes)/);
});

test('an abandoned (stale) reservation is ignored; a fresh in-flight one counts', async () => {
  const stale = await makeLearner('stale');
  await prisma.aiUsage.createMany({ data: [1, 2, 3].map(() => ({ userId: stale.user.id, feature: 'ANALYZE_DOCUMENT', status: 'PENDING', createdAt: new Date(Date.now() - 20 * 60 * 1000) })) });
  assert.equal((await analyze(stale)).status, 200);

  const fresh = await makeLearner('fresh');
  await prisma.aiUsage.createMany({ data: [1, 2, 3].map(() => ({ userId: fresh.user.id, feature: 'ANALYZE_DOCUMENT', status: 'PENDING' })) });
  assert.equal((await analyze(fresh)).status, 429);
});

test('simultaneous requests cannot exceed the limit (10 parallel, limit 3 -> exactly 3 succeed)', async () => {
  const l = await makeLearner('parallel');
  const results = await Promise.all(Array.from({ length: 10 }, () => analyze(l)));
  const statuses = results.map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 200).length, 3);
  assert.equal(statuses.filter((s) => s === 429).length, 7);
  assert.equal((await usageRows(l, 'ANALYZE_DOCUMENT')).filter((r) => r.status === 'SUCCESS').length, 3);
});

test('GET /api/ai/usage shows the caller\'s own limits and remaining quota (auth required, counts only)', async () => {
  assert.equal((await request(base, 'GET', '/ai/usage')).status, 401);
  const l = await makeLearner('summary');
  await analyze(l);
  await analyze(l);
  await chat(l);
  const res = await request(base, 'GET', '/ai/usage', { token: l.token });
  assert.equal(res.status, 200);
  assert.equal(res.data.enabled, true);
  const f = res.data.features;
  assert.equal(f.ANALYZE_DOCUMENT.limit, 3);
  assert.equal(f.ANALYZE_DOCUMENT.used, 2);
  assert.equal(f.ANALYZE_DOCUMENT.remaining, 1);
  assert.equal(f.GENERATE_MCQS.limit, 2);
  assert.equal(f.ASSISTANT_CHAT.used, 1);
  assert.equal(f.ASSISTANT_CHAT.remaining, 3);
  assert.ok(f.ANALYZE_DOCUMENT.nextSlotAt);
});

test('limits come from environment variables; invalid values fall back to the defaults 20 / 20 / 100', async () => {
  const l = await makeLearner('env');
  const saved = { a: process.env.AI_DAILY_ANALYSES_PER_USER, m: process.env.AI_DAILY_MCQ_GENERATIONS_PER_USER, c: process.env.AI_DAILY_ASSISTANT_MESSAGES_PER_USER, e: process.env.AI_QUOTAS_ENABLED };
  try {
    process.env.AI_DAILY_ANALYSES_PER_USER = '7';
    assert.equal((await getUsageSummary(l.user.id)).features.ANALYZE_DOCUMENT.limit, 7);

    for (const bad of ['abc', '0', '-5', '2.5', '']) {
      process.env.AI_DAILY_ANALYSES_PER_USER = bad;
      assert.equal((await getUsageSummary(l.user.id)).features.ANALYZE_DOCUMENT.limit, 20, `"${bad}" -> default`);
    }
    delete process.env.AI_DAILY_ANALYSES_PER_USER;
    delete process.env.AI_DAILY_MCQ_GENERATIONS_PER_USER;
    delete process.env.AI_DAILY_ASSISTANT_MESSAGES_PER_USER;
    const d = (await getUsageSummary(l.user.id)).features;
    assert.deepEqual([d.ANALYZE_DOCUMENT.limit, d.GENERATE_MCQS.limit, d.ASSISTANT_CHAT.limit], [20, 20, 100]);

    // AI_QUOTAS_ENABLED=false switches enforcement off (development convenience)
    process.env.AI_DAILY_ANALYSES_PER_USER = '1';
    process.env.AI_QUOTAS_ENABLED = 'false';
    assert.equal((await analyze(l)).status, 200);
    assert.equal((await analyze(l)).status, 200);
    assert.equal((await getUsageSummary(l.user.id)).enabled, false);
    assert.equal(await prisma.aiUsage.count({ where: { userId: l.user.id } }), 0, 'nothing recorded while disabled');
  } finally {
    for (const [k, v] of [['AI_DAILY_ANALYSES_PER_USER', saved.a], ['AI_DAILY_MCQ_GENERATIONS_PER_USER', saved.m], ['AI_DAILY_ASSISTANT_MESSAGES_PER_USER', saved.c], ['AI_QUOTAS_ENABLED', saved.e]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('ai_usage stores counts and timings only - no columns that could hold prompts, text or answers', async () => {
  const cols = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_usage' ORDER BY column_name`;
  assert.deepEqual(
    cols.map((c) => c.column_name).sort(),
    ['completedAt', 'completionTokens', 'createdAt', 'durationMs', 'feature', 'id', 'model', 'promptTokens', 'provider', 'status', 'userId']
  );
});
