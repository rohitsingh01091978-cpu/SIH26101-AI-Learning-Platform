// Quota accounting with the REAL provider (mocked, no network): what counts, what is refunded.
process.env.AI_PROVIDER = 'external';
process.env.AI_BASE_URL = 'http://fake-ai.invalid/v1';
process.env.AI_API_KEY = 'sk-quota-secret-key-1234567890';
process.env.AI_MODEL = 'quota-model';
process.env.AI_MAX_RETRIES = '0';
process.env.AI_RETRY_BASE_MS = '0';
process.env.AI_DAILY_ANALYSES_PER_USER = '2';
process.env.AI_DAILY_MCQ_GENERATIONS_PER_USER = '2';
process.env.AI_DAILY_ASSISTANT_MESSAGES_PER_USER = '2';
process.env.AI_JOB_RATE_LIMIT_PER_MINUTE = '1000';
process.env.ASSISTANT_RATE_LIMIT_PER_MINUTE = '1000';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, request, stop } = require('./helpers');
const prisma = require('../src/utils/prisma');
const { signToken } = require('../src/utils/jwt');

const PREFIX = 'quota-refund-test-';
const realFetch = global.fetch;
const orig = { log: console.log, warn: console.warn, error: console.error };
let server;
let base;
let script = [];

const GOOD_ANALYSIS = { summary: 'A summary.', topics: ['Sampling'], concepts: [], competencies: [], difficulty: 'EASY', learningObjectives: [], keyTerms: [], relevantSections: [], competencyEvidence: [] };
const ok = (content, usage = { prompt_tokens: 120, completion_tokens: 45 }) => ({ type: 'ok', content: JSON.stringify(content), usage });
const raw = (text) => ({ type: 'ok', content: text });
const http500 = () => ({ type: 'http', status: 500 });

before(async () => {
  global.fetch = async (url, init) => {
    if (!String(url).startsWith('http://fake-ai.invalid')) return realFetch(url, init);
    const step = script.shift();
    if (!step) throw new TypeError('unexpected AI call');
    if (step.type === 'http') return new Response('boom', { status: step.status });
    return new Response(JSON.stringify({ choices: [{ message: { content: step.content } }], usage: step.usage }), { status: 200 });
  };
  ({ server, base } = await startServer());
});
after(async () => {
  global.fetch = realFetch;
  Object.assign(console, orig);
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await stop(server);
});
beforeEach(() => {
  script = [];
  for (const level of ['log', 'warn', 'error']) console[level] = () => {};
});

async function makeLearner(tag) {
  const user = await prisma.user.create({
    data: { email: `${PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`, name: 'Refund', password: null, role: 'LEARNER', authProvider: 'google', googleId: `sub-${Math.random()}` },
  });
  await prisma.learnerProfile.create({ data: { userId: user.id, targetRole: 'TESTROLE' } });
  const sql = await prisma.competency.findUnique({ where: { name: 'SQL' } });
  await prisma.learnerCompetency.create({ data: { userId: user.id, competencyId: sql.id, currentLevel: 12 } });
  const material = await prisma.learningMaterial.create({
    data: { userId: user.id, fileName: 'f.txt', originalName: 'Notes.txt', fileType: 'TXT', fileSize: 60, filePath: 'n/a', status: 'UPLOADED', extractedText: 'Sampling and data quality matter for official statistics.' },
  });
  return { user, material, token: signToken(user) };
}
const analyze = (l) => request(base, 'POST', `/materials/${l.material.id}/analyze`, { token: l.token });
const chat = (l) => request(base, 'POST', '/assistant/chat', { token: l.token, body: { message: 'How can I improve my SQL score?' } });
const rows = (l, feature) => prisma.aiUsage.findMany({ where: { userId: l.user.id, feature }, orderBy: { createdAt: 'asc' } });

test('a successful real-AI call records provider, model, tokens and timing on the usage row', async () => {
  const l = await makeLearner('tokens');
  script = [ok(GOOD_ANALYSIS, { prompt_tokens: 321, completion_tokens: 87 })];
  assert.equal((await analyze(l)).status, 200);
  const [row] = await rows(l, 'ANALYZE_DOCUMENT');
  assert.equal(row.status, 'SUCCESS');
  assert.equal(row.provider, 'external');
  assert.equal(row.model, 'quota-model');
  assert.equal(row.promptTokens, 321);
  assert.equal(row.completionTokens, 87);
  assert.ok(row.durationMs >= 0 && row.completedAt);
});

test('a provider OUTAGE does not use up the learner\'s quota (refunded as UNAVAILABLE)', async () => {
  const l = await makeLearner('outage');
  for (let i = 0; i < 3; i += 1) {
    script = [http500()];
    const res = await analyze(l);
    assert.equal(res.status, 503);
    assert.equal(res.data.code, 'AI_UNAVAILABLE');
  }
  const r = await rows(l, 'ANALYZE_DOCUMENT');
  assert.equal(r.length, 3);
  assert.ok(r.every((x) => x.status === 'UNAVAILABLE'));
  // full quota (2) is still available
  script = [ok(GOOD_ANALYSIS)];
  assert.equal((await analyze(l)).status, 200);
  script = [ok(GOOD_ANALYSIS)];
  assert.equal((await analyze(l)).status, 200);
  script = [ok(GOOD_ANALYSIS)];
  assert.equal((await analyze(l)).status, 429);
});

test('an UNUSABLE provider answer still counts (the provider was billed), and is recorded as FAILED', async () => {
  const l = await makeLearner('unusable');
  script = [raw('not json at all')];
  assert.equal((await analyze(l)).status, 503);
  script = [raw('{"topics": []}')];
  assert.equal((await analyze(l)).status, 503);
  assert.deepEqual((await rows(l, 'ANALYZE_DOCUMENT')).map((x) => x.status), ['FAILED', 'FAILED']);
  script = [ok(GOOD_ANALYSIS)];
  const res = await analyze(l);
  assert.equal(res.status, 429, 'two unusable answers used the two daily slots');
  assert.equal(res.data.code, 'AI_QUOTA_EXCEEDED');
});

test('assistant: offline fallback answers are refunded (FALLBACK) and do not use the quota', async () => {
  const l = await makeLearner('fallback');
  for (let i = 0; i < 4; i += 1) {
    script = [http500()];
    const res = await chat(l);
    assert.equal(res.status, 200);
    assert.equal(res.data.fellBack, true);
  }
  assert.ok((await rows(l, 'ASSISTANT_CHAT')).every((x) => x.status === 'FALLBACK'));
  // real AI answers now count, up to the limit of 2
  for (let i = 0; i < 2; i += 1) {
    script = [ok({ answer: 'Focus on SQL.' })];
    const res = await chat(l);
    assert.equal(res.status, 200);
    assert.equal(res.data.provider, 'external');
  }
  script = [ok({ answer: 'never reached' })];
  assert.equal((await chat(l)).status, 429);
});

test('a quota refusal never calls the AI provider and never leaks keys', async () => {
  const l = await makeLearner('nocall');
  await prisma.aiUsage.createMany({ data: [1, 2].map(() => ({ userId: l.user.id, feature: 'ANALYZE_DOCUMENT', status: 'SUCCESS' })) });
  script = [ok(GOOD_ANALYSIS)];
  const res = await analyze(l);
  assert.equal(res.status, 429);
  assert.equal(script.length, 1, 'the provider was not contacted');
  assert.ok(!JSON.stringify(res.data).includes('sk-quota-secret'));
});
