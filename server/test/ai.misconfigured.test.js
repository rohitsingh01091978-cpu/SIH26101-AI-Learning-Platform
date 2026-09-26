// AI_PROVIDER=external but no key/base URL configured: must NOT silently become the demo provider.
process.env.AI_PROVIDER = 'external';
delete process.env.AI_API_KEY;
delete process.env.AI_BASE_URL;
delete process.env.EXTERNAL_AI_API_KEY;
delete process.env.EXTERNAL_AI_BASE_URL;
process.env.AI_JOB_RATE_LIMIT_PER_MINUTE = '1000';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, request, stop } = require('./helpers');
const prisma = require('../src/utils/prisma');
const { signToken } = require('../src/utils/jwt');

const PREFIX = 'ai-misconfig-test-';
let server;
let base;
let user;
let material;
let token;

before(async () => {
  ({ server, base } = await startServer());
  user = await prisma.user.create({
    data: { email: `${PREFIX}${Date.now()}@example.com`, name: 'Misconfig', password: null, role: 'LEARNER', authProvider: 'google', googleId: `sub-${Date.now()}` },
  });
  await prisma.learnerProfile.create({ data: { userId: user.id, targetRole: 'TESTROLE' } });
  const sql = await prisma.competency.findUnique({ where: { name: 'SQL' } });
  await prisma.learnerCompetency.create({ data: { userId: user.id, competencyId: sql.id, currentLevel: 12 } });
  material = await prisma.learningMaterial.create({
    data: { userId: user.id, fileName: 'f.txt', originalName: 'Notes.txt', fileType: 'TXT', fileSize: 10, filePath: 'n/a', status: 'UPLOADED', extractedText: 'Sampling and data quality matter for official statistics.' },
  });
  token = signToken(user);
});
after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await stop(server);
});

test('misconfigured external provider: core AI features are unavailable (503), never demo output', async () => {
  const errSpy = console.error;
  console.error = () => {};
  try {
    const analyze = await request(base, 'POST', `/materials/${material.id}/analyze`, { token });
    assert.equal(analyze.status, 503);
    assert.equal(analyze.data.code, 'AI_UNAVAILABLE');
    const gen = await request(base, 'POST', '/quizzes/generate', { token, body: { materialId: material.id, count: 5 } });
    assert.equal(gen.status, 503);
    assert.equal(await prisma.documentAnalysis.count({ where: { materialId: material.id } }), 0);
    assert.equal(await prisma.quiz.count({ where: { userId: user.id } }), 0);
  } finally {
    console.error = errSpy;
  }
});

test('misconfigured external provider: the assistant gives a LABELLED fallback, not a pretend AI answer', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const res = await request(base, 'POST', '/assistant/chat', { token, body: { message: 'How can I improve my SQL score?' } });
    assert.equal(res.status, 200);
    assert.equal(res.data.provider, 'demo');
    assert.equal(res.data.fellBack, true);
    assert.match(res.data.reply, /level is 12/);
  } finally {
    console.warn = warn;
  }
});
