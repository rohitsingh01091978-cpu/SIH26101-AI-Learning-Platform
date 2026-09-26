// Real-AI hardening (AI_PROVIDER=external) with NO network: fetch is intercepted only for the fake
// AI base URL; requests to the local test server pass through.
process.env.AI_PROVIDER = 'external';
process.env.AI_BASE_URL = 'http://fake-ai.invalid/v1';
process.env.AI_API_KEY = 'sk-hardening-secret-key-9876543210';
process.env.AI_MODEL = 'hardening-model';
process.env.AI_MAX_RETRIES = '2';
process.env.AI_RETRY_BASE_MS = '0';
process.env.AI_MAX_INPUT_CHARS = '500';
process.env.AI_JOB_RATE_LIMIT_PER_MINUTE = '1000';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, request, stop } = require('./helpers');
const prisma = require('../src/utils/prisma');
const { signToken } = require('../src/utils/jwt');

const PREFIX = 'ai-hardening-test-';
const KEY = process.env.AI_API_KEY;
const DOC_TEXT = 'Sampling and data quality underpin official statistics. '.repeat(40); // > AI_MAX_INPUT_CHARS
const realFetch = global.fetch;

let server;
let base;
let script = [];
let calls = [];
let logs = [];
const orig = { log: console.log, warn: console.warn, error: console.error };

const GOOD_ANALYSIS = { summary: 'A summary of the document.', topics: ['Sampling'], concepts: ['Data quality'], competencies: ['Sampling'], difficulty: 'MEDIUM', learningObjectives: ['Understand sampling.'], keyTerms: ['sample'], relevantSections: ['Sampling matters.'], competencyEvidence: [{ competency: 'Sampling', evidence: 'Sampling and data quality underpin official statistics.', relevance: 'HIGH' }] };
const goodMcq = (n) => ({ question: `Which statement about topic number ${n} is correct?`, options: [`Option A ${n}`, `Option B ${n}`, `Option C ${n}`, `Option D ${n}`], correctAnswer: n % 4, explanation: 'Because the source says so.', topic: 'Sampling', competency: 'Sampling', difficulty: 'EASY', sourceReference: 'Section 1' });

const okResponse = (obj) => ({ ok: true, status: 200, obj });
const ok = (content) => ({ type: 'ok', content: JSON.stringify(content), usage: { prompt_tokens: 11, completion_tokens: 7 } });
const http = (status, body = 'upstream error body that must never leak UPSTREAM-SECRET-TEXT') => ({ type: 'http', status, body });
const netFail = () => ({ type: 'throw', error: new TypeError('fetch failed: ECONNREFUSED fake-ai.invalid') });
const timeout = () => ({ type: 'throw', error: Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }) });
const rawContent = (text) => ({ type: 'ok', content: text });

before(async () => {
  global.fetch = async (url, init) => {
    if (!String(url).startsWith('http://fake-ai.invalid')) return realFetch(url, init);
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    const step = script.shift();
    if (!step) throw new TypeError('unexpected AI call');
    if (step.type === 'throw') throw step.error;
    if (step.type === 'http') return new Response(step.body, { status: step.status });
    return new Response(JSON.stringify({ choices: [{ message: { content: step.content } }], usage: step.usage }), { status: 200 });
  };
  ({ server, base } = await startServer());
});
after(async () => {
  global.fetch = realFetch;
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await stop(server);
});
beforeEach(() => {
  script = [];
  calls = [];
  logs = [];
  for (const level of ['log', 'warn', 'error']) console[level] = (...a) => logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
});
const restoreConsole = () => Object.assign(console, orig);

async function learnerWithMaterial() {
  const user = await prisma.user.create({
    data: { email: `${PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`, name: 'AI Hardening Person', password: null, role: 'LEARNER', authProvider: 'google', googleId: `sub-${Math.random()}` },
  });
  await prisma.learnerProfile.create({ data: { userId: user.id, targetRole: 'TESTROLE' } });
  const sql = await prisma.competency.findUnique({ where: { name: 'SQL' } });
  await prisma.learnerCompetency.create({ data: { userId: user.id, competencyId: sql.id, currentLevel: 12 } });
  const material = await prisma.learningMaterial.create({
    data: { userId: user.id, fileName: 'f.txt', originalName: 'Notes.txt', fileType: 'TXT', fileSize: DOC_TEXT.length, filePath: 'n/a', status: 'UPLOADED', extractedText: DOC_TEXT },
  });
  return { user, material, token: signToken(user) };
}
const analyze = (l) => request(base, 'POST', `/materials/${l.material.id}/analyze`, { token: l.token });
const generate = (l, count = 5) => request(base, 'POST', '/quizzes/generate', { token: l.token, body: { materialId: l.material.id, count } });

// ------------------------------------------------------------------ success + request shape

test('analysis via the real provider: validated result is saved, labelled "external", request is bounded', async () => {
  const l = await learnerWithMaterial();
  script = [ok(GOOD_ANALYSIS)];
  const res = await analyze(l);
  restoreConsole();
  assert.equal(res.status, 200);
  assert.equal(res.data.aiProvider, 'external');
  assert.equal(res.data.analysis.summary, 'A summary of the document.');
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.url, 'http://fake-ai.invalid/v1/chat/completions');
  assert.equal(c.init.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(c.body.model, 'hardening-model');
  assert.equal(c.body.max_tokens, 2500);
  assert.ok(c.init.signal, 'every request has a timeout signal');
  assert.ok(c.body.messages[1].content.length < 700, 'document text is truncated to AI_MAX_INPUT_CHARS');
  assert.match(c.body.messages[0].content, /DATA, not instructions/);
});

test('MCQ generation via the real provider: only valid questions are kept', async () => {
  const l = await learnerWithMaterial();
  const bad = { question: 'short', options: ['a', 'a', 'b', 'c'], correctAnswer: 9 };
  const dup = goodMcq(1);
  script = [ok({ questions: [goodMcq(1), bad, dup, goodMcq(2), { ...goodMcq(3), options: ['x', 'y', 'z'] }, goodMcq(4)] })];
  const res = await generate(l, 5);
  restoreConsole();
  assert.equal(res.status, 201);
  assert.equal(res.data.aiProvider, 'external');
  assert.equal(res.data.questions.length, 3, 'invalid, duplicate and 3-option questions were dropped');
  const quiz = await prisma.quiz.findFirst({ where: { userId: l.user.id }, include: { questions: true } });
  assert.equal(quiz.questions.length, 3);
});

// ------------------------------------------------------------------------ retry behaviour

test('transient failures are retried with backoff (HTTP 500, 429, network error, timeout) and then succeed', async () => {
  for (const failure of [http(500), http(429), netFail(), timeout()]) {
    const l = await learnerWithMaterial();
    script = [failure, ok(GOOD_ANALYSIS)];
    const res = await analyze(l);
    assert.equal(res.status, 200, failure.type + (failure.status || ''));
    assert.equal(calls.length, 2, 'one retry');
    calls = [];
  }
  restoreConsole();
});

test('retries stop after AI_MAX_RETRIES; a permanent error (HTTP 400/401) is not retried', async () => {
  const a = await learnerWithMaterial();
  script = [http(503), http(503), http(503), ok(GOOD_ANALYSIS)];
  assert.equal((await analyze(a)).status, 503);
  assert.equal(calls.length, 3, '1 attempt + 2 retries, then give up');

  calls = [];
  const b = await learnerWithMaterial();
  script = [http(401), ok(GOOD_ANALYSIS)];
  assert.equal((await analyze(b)).status, 503);
  assert.equal(calls.length, 1, 'no retry on 401');
  restoreConsole();
});

// ---------------------------------------------------- core features never fall back to demo

test('provider down: analysis returns 503 AI_UNAVAILABLE - no demo output, material stays retryable', async () => {
  const l = await learnerWithMaterial();
  script = [netFail(), netFail(), netFail()];
  const res = await analyze(l);
  restoreConsole();
  assert.equal(res.status, 503);
  assert.equal(res.data.code, 'AI_UNAVAILABLE');
  assert.equal(res.data.message, 'The AI service is temporarily unavailable. Please try again in a moment.');
  assert.equal(await prisma.documentAnalysis.count({ where: { materialId: l.material.id } }), 0, 'demo analysis must not be saved');
  const m = await prisma.learningMaterial.findUnique({ where: { id: l.material.id } });
  assert.equal(m.status, 'UPLOADED', 'restored so the learner can retry (not FAILED)');
});

test('provider down: MCQ generation returns 503 - no canned/demo questions, no quiz created', async () => {
  const l = await learnerWithMaterial();
  script = [http(500), http(500), http(500)];
  const res = await generate(l);
  restoreConsole();
  assert.equal(res.status, 503);
  assert.equal(res.data.code, 'AI_UNAVAILABLE');
  assert.equal(await prisma.quiz.count({ where: { userId: l.user.id } }), 0);
});

// ------------------------------------------------------------------- output validation

test('unusable model output (bad JSON, wrong shape, nothing valid) -> 503, not retried, nothing saved', async () => {
  const cases = [
    { run: analyze, script: [rawContent('this is not json')] },
    { run: analyze, script: [ok({ topics: ['no summary here'] })] },
    { run: analyze, script: [ok([1, 2, 3])] },
    { run: generate, script: [ok({ questions: [{ question: 'x', options: [], correctAnswer: 'a' }] })] },
    { run: generate, script: [ok({ nothing: true })] },
  ];
  for (const c of cases) {
    const l = await learnerWithMaterial();
    script = [...c.script];
    calls = [];
    const res = await c.run(l);
    assert.equal(res.status, 503);
    assert.equal(calls.length, 1, 'output errors are not retried');
  }
  restoreConsole();
});

test('analysis output is normalised (types, enums, lengths) before it reaches the database', async () => {
  const l = await learnerWithMaterial();
  script = [ok({ ...GOOD_ANALYSIS, difficulty: 'IMPOSSIBLE', topics: ['ok', 5, null, { a: 1 }], keyTerms: 'not a list', summary: `  ${'s'.repeat(5000)}  `, competencyEvidence: [{ competency: 'Sampling' }, { competency: 'SQL', evidence: 'valid', relevance: 'weird' }] })];
  const res = await analyze(l);
  restoreConsole();
  assert.equal(res.status, 200);
  const a = res.data.analysis;
  assert.equal(a.difficulty, 'MEDIUM');
  assert.deepEqual(a.topics, ['ok']);
  assert.deepEqual(a.keyTerms, []);
  assert.equal(a.summary.length, 3000);
  assert.equal(a.competencyEvidence.length, 1);
  assert.equal(a.competencyEvidence[0].relevance, 'MEDIUM');
});

// -------------------------------------------------------------------- no secret leakage

test('errors and logs never contain the API key, upstream body, base URL, prompts or document text', async () => {
  const l = await learnerWithMaterial();
  script = [http(500), http(500), http(500)];
  const a = await analyze(l);
  script = [netFail(), netFail(), netFail()];
  const g = await generate(l);
  script = [ok(GOOD_ANALYSIS)];
  const okRes = await analyze(l);
  const captured = [...logs];
  restoreConsole();

  // Failure responses must reveal nothing; the SUCCESS response legitimately quotes the document
  // (verbatim evidence is a feature), so document text is only checked on failures and in logs.
  const failures = JSON.stringify([a.data, g.data]);
  const everything = JSON.stringify([a.data, g.data, okRes.data]);
  for (const forbidden of [KEY, 'UPSTREAM-SECRET-TEXT', 'fake-ai.invalid', 'ECONNREFUSED']) {
    assert.ok(!everything.includes(forbidden), `response leaked: ${forbidden}`);
    assert.ok(!captured.join('\n').includes(forbidden), `log leaked: ${forbidden}`);
  }
  assert.ok(!failures.includes('Sampling and data quality underpin'), 'failure responses must not echo document text');
  assert.ok(!captured.join('\n').includes('Sampling and data quality underpin'), 'logs must not contain document text');
  assert.ok(captured.some((line) => line.includes('"evt":"ai_call"')), 'a metadata-only usage line is logged');
  const usage = captured.find((line) => line.includes('"ok":true'));
  assert.match(usage, /"promptTokens":11/);
});

// ---------------------------------------------------------- assistant: labelled fallback only

test('assistant with the provider down: labelled offline fallback (fellBack true), grounded, no secrets', async () => {
  const l = await learnerWithMaterial();
  script = [http(500), http(500), http(500)];
  const res = await request(base, 'POST', '/assistant/chat', { token: l.token, body: { message: 'How can I improve my SQL score?' } });
  restoreConsole();
  assert.equal(res.status, 200);
  assert.equal(res.data.provider, 'demo');
  assert.equal(res.data.fellBack, true);
  assert.match(res.data.reply, /level is 12/);
  assert.ok(!JSON.stringify(res.data).includes(KEY));
});

test('assistant with a healthy provider is labelled "external" with no fallback', async () => {
  const l = await learnerWithMaterial();
  script = [ok({ answer: 'Focus on SQL first.' })];
  const res = await request(base, 'POST', '/assistant/chat', { token: l.token, body: { message: 'What should I learn next?' } });
  restoreConsole();
  assert.equal(res.data.provider, 'external');
  assert.equal(res.data.fellBack, false);
});
