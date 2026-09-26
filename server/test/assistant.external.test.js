// Assistant with AI_PROVIDER=external. No real network: global fetch is intercepted ONLY for the fake
// external-AI base URL; requests to the local test server pass through untouched.
process.env.AI_PROVIDER = 'external';
process.env.EXTERNAL_AI_BASE_URL = 'http://external-ai.invalid/v1';
process.env.EXTERNAL_AI_API_KEY = 'sk-test-key-not-real-0123456789';
process.env.EXTERNAL_AI_MODEL = 'test-model';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, request, stop } = require('./helpers');
const prisma = require('../src/utils/prisma');
const { signToken } = require('../src/utils/jwt');

const PREFIX = 'assistant-ext-test-';
const realFetch = global.fetch;
let server;
let base;
let learner;
let mode = 'ok';
let captured = null;

before(async () => {
  global.fetch = async (url, init) => {
    if (!String(url).startsWith('http://external-ai.invalid')) return realFetch(url, init);
    captured = { url: String(url), init, body: JSON.parse(init.body) };
    if (mode === 'down') throw new Error('connect ECONNREFUSED external-ai.invalid');
    if (mode === 'badjson') return new Response(JSON.stringify({ choices: [{ message: { content: 'not json' } }] }), { status: 200 });
    if (mode === 'http500') return new Response('upstream exploded with key sk-test-key-not-real-0123456789', { status: 500 });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: 'LLM says: focus on SQL first (level 12 vs 65).' }) } }] }), { status: 200 });
  };
  ({ server, base } = await startServer());
  const user = await prisma.user.create({
    data: { email: `${PREFIX}${Date.now()}@example.com`, name: 'Ext Learner Name', password: null, role: 'LEARNER', authProvider: 'google', googleId: `sub-${PREFIX}${Date.now()}` },
  });
  await prisma.learnerProfile.create({ data: { userId: user.id, targetRole: 'TESTROLE-X', currentRole: 'ROLE-EXT' } });
  const sql = await prisma.competency.findUnique({ where: { name: 'SQL' } });
  await prisma.learnerCompetency.create({ data: { userId: user.id, competencyId: sql.id, currentLevel: 12 } });
  learner = { user, token: signToken(user) };
});
after(async () => {
  global.fetch = realFetch;
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await stop(server);
});

const chat = (message, extra) => request(base, 'POST', '/assistant/chat', { token: learner.token, body: { message, ...extra } });

test('external provider: grounded context is sent server-side, key only in the Authorization header, reply labelled "external"', async () => {
  mode = 'ok';
  const res = await chat('What should I learn next?', { history: [{ role: 'user', text: 'earlier question' }, { role: 'assistant', text: 'earlier answer' }] });
  assert.equal(res.status, 200);
  assert.equal(res.data.provider, 'external');
  assert.equal(res.data.fellBack, false);
  assert.match(res.data.reply, /LLM says/);

  assert.equal(captured.url, 'http://external-ai.invalid/v1/chat/completions');
  assert.equal(captured.init.headers.Authorization, 'Bearer sk-test-key-not-real-0123456789');
  const messages = captured.body.messages;
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /never say a course is live on iGOT/i);
  assert.match(messages[0].content, /not instructions/i);
  const userMsg = messages[messages.length - 1].content;
  assert.match(userMsg, /"current":12/, "learner's real level is in the grounded context");
  assert.match(userMsg, /TESTROLE-X/);
  assert.match(userMsg, /iGOT-aligned Training Catalog/);
  assert.ok(!userMsg.includes('Ext Learner Name'), "learner's name is not sent to the external model");
  assert.equal(messages.filter((m) => m.content === 'earlier question' || m.content === 'earlier answer').length, 2, 'history is passed through');

  // The API key never appears in anything returned to the browser.
  assert.ok(!JSON.stringify(res.data).includes('sk-test-key'));
  assert.ok(!JSON.stringify(res.data).includes('external-ai.invalid'));
});

test('external provider failing (network / bad JSON / HTTP 500) falls back to the offline engine and says so', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const m of ['down', 'badjson', 'http500']) {
      mode = m;
      const res = await chat('How can I improve my SQL score?');
      assert.equal(res.status, 200, m);
      assert.equal(res.data.provider, 'demo', m);
      assert.equal(res.data.fellBack, true, m);
      assert.match(res.data.reply, /level is 12/, `${m}: fallback answer is still grounded in real data`);
      const blob = JSON.stringify(res.data);
      assert.ok(!/sk-test-key|external-ai\.invalid|ECONNREFUSED|exploded/.test(blob), `${m}: no upstream details leaked`);
    }
  } finally {
    console.warn = warn;
    mode = 'ok';
  }
});
