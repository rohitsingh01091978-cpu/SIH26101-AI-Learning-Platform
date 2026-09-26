// C1 defence in depth: only a limited number of document extractions may run at once (MAX_CONCURRENT_EXTRACTIONS).
// Extra uploads are refused immediately (503 + Retry-After) - never queued - and leave nothing behind.
process.env.UPLOAD_RATE_LIMIT_PER_MINUTE = '6';
process.env.AI_JOB_RATE_LIMIT_PER_MINUTE = '1000';
process.env.MAX_CONCURRENT_EXTRACTIONS = '2';

const fs = require('node:fs');
const path = require('node:path');
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mammoth = require('mammoth');
const { startServer, request, stop } = require('./helpers');
const prisma = require('../src/utils/prisma');
const { signToken } = require('../src/utils/jwt');
const { getStorage } = require('../src/storage');
const limits = require('../src/document/limits');
const { acquireExtractionSlot, withExtractionSlot, activeExtractions } = require('../src/document/extractionGate');
const { buildPdf, buildDocx, docxWith, SENTENCES } = require('./fixtures');

const PREFIX = 'c1conc-test-';
const ROOT = process.env.STORAGE_ROOT;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
let server;
let base;

async function makeUser(tag) {
  const user = await prisma.user.create({
    data: { email: `${PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`, name: `C1 ${tag}`, password: null, role: 'LEARNER', authProvider: 'google', googleId: `sub-${Math.random()}` },
  });
  await prisma.learnerProfile.create({ data: { userId: user.id } });
  return { user, token: signToken(user) };
}
const upload = (u, buffer, filename, type) => {
  const f = new FormData();
  f.append('file', new Blob([buffer], { type }), filename);
  return request(base, 'POST', '/materials/upload', { token: u.token, raw: f });
};
const uploadDocx = (u, text = 'a short but sufficiently long paragraph of ordinary text') => upload(u, docxWith(text), 'report.docx', DOCX_MIME);
const uploadTxt = (u, text = 'plain text that is long enough to be accepted as a document') => upload(u, Buffer.from(text), 'notes.txt', 'text/plain');
const rowCount = (u) => prisma.learningMaterial.count({ where: { userId: u.user.id } });

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full)); else out.push(full);
  }
  return out;
}

// Makes the DOCX parser (mammoth) block until the test lets it go, so extractions can be held "in progress".
const realExtract = mammoth.extractRawText;
let held = [];
function holdParser() {
  held = [];
  mammoth.extractRawText = (opts) => new Promise((resolve, reject) => {
    held.push({ resume: () => realExtract.call(mammoth, opts).then(resolve, reject), fail: (e) => reject(e) });
  });
}
async function until(cond, what) {
  for (let i = 0; i < 200; i += 1) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 15));
  }
  assert.fail(`timed out waiting for: ${what}`);
}
const originalMax = process.env.MAX_CONCURRENT_EXTRACTIONS;
afterEach(() => {
  mammoth.extractRawText = realExtract;
  held = [];
  process.env.MAX_CONCURRENT_EXTRACTIONS = originalMax;
});

before(async () => {
  ({ server, base } = await startServer());
});
after(async () => {
  const mats = await prisma.learningMaterial.findMany({ where: { user: { email: { startsWith: PREFIX } } }, select: { storageKey: true } });
  for (const m of mats) if (m.storageKey) await getStorage().delete(m.storageKey).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await stop(server);
});

// ============================================================================ configuration

test('MAX_CONCURRENT_EXTRACTIONS defaults to 2 and invalid values fall back to the default (never to "unlimited")', () => {
  const saved = process.env.MAX_CONCURRENT_EXTRACTIONS;
  try {
    delete process.env.MAX_CONCURRENT_EXTRACTIONS;
    assert.equal(limits.maxConcurrentExtractions(), 2);
    for (const bad of ['', '   ', 'abc', '0', '-3', '33', '999999', 'NaN', 'Infinity']) {
      process.env.MAX_CONCURRENT_EXTRACTIONS = bad;
      assert.equal(limits.maxConcurrentExtractions(), 2, `"${bad}" -> default`);
    }
    process.env.MAX_CONCURRENT_EXTRACTIONS = '1';
    assert.equal(limits.maxConcurrentExtractions(), 1);
    process.env.MAX_CONCURRENT_EXTRACTIONS = '4';
    assert.equal(limits.maxConcurrentExtractions(), 4);
  } finally {
    process.env.MAX_CONCURRENT_EXTRACTIONS = saved;
  }
});

// ============================================================================ the gate itself

test('gate: never allows more than the limit, refuses (not queues) the rest, and release is idempotent', () => {
  process.env.MAX_CONCURRENT_EXTRACTIONS = '2';
  assert.equal(activeExtractions(), 0);
  const a = acquireExtractionSlot();
  const b = acquireExtractionSlot();
  assert.equal(activeExtractions(), 2);
  assert.throws(() => acquireExtractionSlot(), (e) => e.statusCode === 503 && e.code === 'EXTRACTION_BUSY' && e.retryAfterSeconds > 0);
  assert.equal(activeExtractions(), 2, 'a refused request does not take a slot');
  a();
  a(); // releasing twice must not free somebody else's slot
  assert.equal(activeExtractions(), 1);
  const c = acquireExtractionSlot();
  assert.equal(activeExtractions(), 2);
  b();
  c();
  assert.equal(activeExtractions(), 0);
});

test('gate: the slot is released after success, a rejected promise, a synchronous throw and a non-Error throw', async () => {
  process.env.MAX_CONCURRENT_EXTRACTIONS = '1';
  assert.equal(await withExtractionSlot(async () => 'ok'), 'ok');
  assert.equal(activeExtractions(), 0);
  await assert.rejects(() => withExtractionSlot(async () => { throw new Error('parser blew up'); }), /parser blew up/);
  assert.equal(activeExtractions(), 0);
  await assert.rejects(() => withExtractionSlot(() => { throw new TypeError('sync failure'); }), /sync failure/);
  assert.equal(activeExtractions(), 0);
  await assert.rejects(() => withExtractionSlot(() => Promise.reject('a string, not an Error')));
  assert.equal(activeExtractions(), 0);
  assert.equal(await withExtractionSlot(async () => 'still works'), 'still works'); // limit of 1 never got stuck
});

// ============================================================================ through the API

test('concurrent limit: with every slot busy the next upload gets 503 + Retry-After and leaves no row or file; it works again once a slot frees up', async () => {
  process.env.MAX_CONCURRENT_EXTRACTIONS = '2';
  holdParser();
  const [u1, u2, u3] = [await makeUser('busy1'), await makeUser('busy2'), await makeUser('busy3')];
  const filesBefore = walk(ROOT).length;

  const first = uploadDocx(u1);
  const second = uploadDocx(u2);
  await until(() => held.length === 2 && activeExtractions() === 2, 'two extractions in progress');

  // limit reached: refused immediately (another user, and a cheap TXT too - the limit is global, not per user)
  for (const send of [() => uploadDocx(u3), () => uploadTxt(u3)]) {
    const res = await send();
    assert.equal(res.status, 503);
    assert.equal(res.data.code, 'EXTRACTION_BUSY');
    assert.equal(res.data.success, false);
    assert.ok(Number(res.headers.get('retry-after')) > 0, 'Retry-After header present');
    assert.ok(!/at .*\.js|node_modules|mammoth|C:\\|\/tmp/i.test(JSON.stringify(res.data)), 'no internals in the message');
  }
  assert.equal(await rowCount(u3), 0, 'rejected requests created no record');
  assert.equal(activeExtractions(), 2, 'rejected requests never took a slot');
  assert.equal(held.length, 2, 'rejected requests never reached the parser');
  assert.equal(walk(ROOT).length, filesBefore, 'nothing was stored while the extractions were in progress');

  // the two in-progress uploads are unaffected and complete normally
  held.forEach((h) => h.resume());
  const [r1, r2] = await Promise.all([first, second]);
  assert.equal(r1.status, 201);
  assert.equal(r2.status, 201);
  assert.equal(activeExtractions(), 0);
  assert.equal(walk(ROOT).length, filesBefore + 2);

  // capacity is back
  assert.equal((await uploadTxt(u3)).status, 201);
});

test('slot release after success: many sequential uploads (more than the limit) of every type all succeed', async () => {
  process.env.MAX_CONCURRENT_EXTRACTIONS = '1';
  const u = await makeUser('seq');
  const results = [
    await upload(u, buildPdf(SENTENCES), 'paper.pdf', 'application/pdf'),
    await upload(u, buildDocx(SENTENCES), 'report.docx', DOCX_MIME),
    await uploadTxt(u),
    await uploadDocx(u),
    await uploadTxt(u, 'another plain text document that is comfortably long enough'),
  ];
  assert.deepEqual(results.map((r) => r.status), [201, 201, 201, 201, 201]);
  assert.equal(activeExtractions(), 0);
  assert.equal(await rowCount(u), 5);
  const listed = await request(base, 'GET', '/materials', { token: u.token });
  assert.equal(listed.data.materials.length, 5);
  assert.ok(listed.data.materials.every((m) => m.hasExtractedText === true));
});

test('slot release after failure: validation failure, limit failure, parser failure and an unexpected error each free the slot', async () => {
  process.env.MAX_CONCURRENT_EXTRACTIONS = '1'; // one leaked slot would make everything after it a 503
  const u = await makeUser('fail');
  const filesBefore = walk(ROOT).length;

  // (a) validation failure: not really a DOCX (415)
  const notDocx = await upload(u, Buffer.from('this is plain text pretending to be a docx file'), 'fake.docx', DOCX_MIME);
  assert.equal(notDocx.status, 415);
  assert.equal(activeExtractions(), 0);

  // (b) extraction-limit failure inside the slot (text over the limit, 422)
  const saved = process.env.MAX_EXTRACTED_TEXT_CHARS;
  process.env.MAX_EXTRACTED_TEXT_CHARS = '100';
  try {
    const tooLong = await uploadTxt(u, 'x'.repeat(500));
    assert.equal(tooLong.status, 422);
    assert.equal(tooLong.data.code, 'TEXT_TOO_LONG');
  } finally {
    if (saved === undefined) delete process.env.MAX_EXTRACTED_TEXT_CHARS; else process.env.MAX_EXTRACTED_TEXT_CHARS = saved;
  }
  assert.equal(activeExtractions(), 0);

  // (c) parser failure (the real parser rejects)
  mammoth.extractRawText = () => Promise.reject(new Error('mammoth exploded at C:\\secret\\path.js'));
  const parserFail = await uploadDocx(u);
  assert.equal(parserFail.status, 422);
  assert.ok(!/exploded|secret|path\.js/.test(JSON.stringify(parserFail.data)), 'parser error text is not shown to the user');
  assert.equal(activeExtractions(), 0);

  // (d) unexpected non-Error thrown synchronously
  mammoth.extractRawText = () => { throw 'not even an Error object'; }; // eslint-disable-line no-throw-literal
  const unexpected = await uploadDocx(u);
  assert.ok(unexpected.status >= 400 && unexpected.status < 600);
  assert.equal(activeExtractions(), 0);
  mammoth.extractRawText = realExtract;

  assert.equal(await rowCount(u), 0, 'no record for any failed upload');
  assert.equal(walk(ROOT).length, filesBefore, 'no stored file for any failed upload');
  // the single slot is still usable
  assert.equal((await uploadTxt(u)).status, 201);
});

test('a client that disconnects while its extraction is running does not leak the slot', async () => {
  process.env.MAX_CONCURRENT_EXTRACTIONS = '1';
  holdParser();
  const u = await makeUser('abort');
  const f = new FormData();
  f.append('file', new Blob([docxWith('text long enough to be extracted properly')], { type: DOCX_MIME }), 'report.docx');
  const ac = new AbortController();
  const pending = fetch(`${base}/materials/upload`, { method: 'POST', headers: { Authorization: `Bearer ${u.token}` }, body: f, signal: ac.signal }).catch(() => null);
  await until(() => held.length === 1 && activeExtractions() === 1, 'extraction in progress');
  ac.abort();
  await pending;
  held.forEach((h) => h.resume()); // the server-side work still finishes...
  await until(() => activeExtractions() === 0, 'slot released after the abandoned request completed');
  mammoth.extractRawText = realExtract;
  assert.equal((await uploadTxt(u)).status, 201); // ...and capacity is intact
  await prisma.learningMaterial.deleteMany({ where: { userId: u.user.id } });
});

// ============================================================================ unchanged behaviour

test('existing upload rate limiting is unchanged: per-user 429 after the per-minute limit, other users unaffected', async () => {
  process.env.MAX_CONCURRENT_EXTRACTIONS = '2';
  const u = await makeUser('rate');
  const other = await makeUser('rate2');
  const statuses = [];
  for (let i = 0; i < 8; i += 1) statuses.push((await uploadTxt(u, `distinct plain text document number ${i} with enough characters`)).status);
  assert.deepEqual(statuses, [201, 201, 201, 201, 201, 201, 429, 429]); // UPLOAD_RATE_LIMIT_PER_MINUTE=6 for this file
  assert.equal(await rowCount(u), 6);
  assert.equal((await uploadTxt(other)).status, 201);
});

test('persistent storage cleanup is unchanged: a failed database write after a successful extraction removes the stored file and frees the slot', async () => {
  process.env.MAX_CONCURRENT_EXTRACTIONS = '1';
  const u = await makeUser('cleanup');
  const filesBefore = walk(ROOT).length;
  const realCreate = prisma.learningMaterial.create;
  prisma.learningMaterial.create = () => Promise.reject(new Error('database went away'));
  let res;
  try {
    res = await uploadTxt(u);
  } finally {
    prisma.learningMaterial.create = realCreate;
  }
  assert.equal(res.status, 500);
  assert.equal(walk(ROOT).length, filesBefore, 'the stored file was removed again');
  assert.equal(await rowCount(u), 0);
  assert.equal(activeExtractions(), 0);
  assert.equal((await uploadTxt(u)).status, 201);

  // storage failure (nothing can be stored): still no row, slot free
  const storage = getStorage();
  const realPut = storage.put;
  storage.put = () => Promise.reject(new Error('disk full'));
  let res2;
  try {
    res2 = await uploadTxt(u, 'a second document that is definitely long enough');
  } finally {
    storage.put = realPut;
  }
  assert.equal(res2.status, 503);
  assert.equal(activeExtractions(), 0);
  assert.equal(await rowCount(u), 1, 'only the earlier successful upload exists');
});
