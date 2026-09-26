// C1 regression tests: document extraction must stay within bounded memory/CPU.
//   - DOCX archives are inspected with hard limits before the real parser runs
//   - one extracted-text limit applies to PDF, DOCX and TXT
//   - rejected uploads leave no database row and no stored file
//   - list/detail queries never load the extracted-text column
//
// The limits are lowered through environment variables so every fixture here stays around 1-2 MB or less.
process.env.UPLOAD_RATE_LIMIT_PER_MINUTE = '1000';
process.env.AI_JOB_RATE_LIMIT_PER_MINUTE = '1000';
process.env.DOCX_MAX_XML_MB = '1'; //  per XML part
process.env.DOCX_MAX_TOTAL_MB = '2'; // all parts together
process.env.DOCX_MAX_COMPRESSION_RATIO = '20';

const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, request, stop } = require('./helpers');
const prisma = require('../src/utils/prisma');
const { signToken } = require('../src/utils/jwt');
const { getStorage } = require('../src/storage');
const { inspectDocx } = require('../src/document/docxGuard');
const { extractTextFromBuffer } = require('../src/document/textExtractor');
const limits = require('../src/document/limits');
const { buildPdf, buildDocx, buildZip, docxWith, documentXml, fillerText, SENTENCES } = require('./fixtures');

const PREFIX = 'c1-test-';
const ROOT = process.env.STORAGE_ROOT;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MB = 1024 * 1024;
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
const uploadDocx = (u, buf) => upload(u, buf, 'report.docx', DOCX_MIME);
const uploadTxt = (u, text) => upload(u, Buffer.from(text), 'notes.txt', 'text/plain');
const uploadPdf = (u, buf) => upload(u, buf, 'paper.pdf', 'application/pdf');

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full)); else out.push(full);
  }
  return out;
}

// A rejected upload must return a clean 4xx and leave NOTHING behind: no row, no stored file.
async function assertRejected(u, upload, expected) {
  const filesBefore = walk(ROOT).length;
  const res = await upload();
  assert.equal(res.status, expected.status, `status (got ${res.status}: ${JSON.stringify(res.data)})`);
  if (expected.code) assert.equal(res.data.code, expected.code);
  assert.equal(res.data.success, false);
  // user-safe: no stack, no paths, no parser internals
  const body = JSON.stringify(res.data);
  assert.ok(!/at .*\.js|node_modules|zlib|mammoth|jszip|pdf\.js|ERR_|C:\\|\/tmp|\.tmp/i.test(body), `error leaks internals: ${body}`);
  assert.equal(await prisma.learningMaterial.count({ where: { userId: u.user.id } }), 0, 'no material row was left behind');
  assert.equal(walk(ROOT).length, filesBefore, 'no file was stored');
  return res;
}

before(async () => {
  ({ server, base } = await startServer());
});
after(async () => {
  const mats = await prisma.learningMaterial.findMany({ where: { user: { email: { startsWith: PREFIX } } }, select: { storageKey: true } });
  for (const m of mats) if (m.storageKey) await getStorage().delete(m.storageKey).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await stop(server);
});

const TOO_LARGE = { status: 422, code: 'DOCUMENT_TOO_LARGE' };
const UNSUPPORTED = { status: 415, code: 'UNSUPPORTED_FILE' };

// ============================================================================ DOCX archive limits

test('DOCX per-part limit: an XML part that expands beyond DOCX_MAX_XML_MB is rejected (422), nothing stored', async () => {
  const u = await makeUser('entry');
  const overCap = docxWith(fillerText(Math.floor(1.5 * MB))); // 1.5 MB of XML text > 1 MB cap, ratio ~2 so only this limit applies
  await assertRejected(u, () => uploadDocx(u, overCap), TOO_LARGE);
});

test('DOCX total limit: several parts that are each fine but together exceed DOCX_MAX_TOTAL_MB are rejected', async () => {
  const u = await makeUser('total');
  const media = (n) => ({ name: `word/media/image${n}.bin`, data: require('node:crypto').randomBytes(Math.floor(0.8 * MB)) }); // incompressible, no per-part cap for non-XML
  const overTotal = docxWith('short body text', [media(1), media(2), media(3)]); // ~2.4 MB > 2 MB
  await assertRejected(u, () => uploadDocx(u, overTotal), TOO_LARGE);
  // and the same parts within the total are accepted (proves the limit, not the shape, is what rejected it)
  const withinTotal = docxWith('short body text that is long enough', [media(1), media(2)]); // ~1.6 MB
  const ok = await uploadDocx(u, withinTotal);
  assert.equal(ok.status, 201);
});

test('DOCX compression-ratio limit: a highly repetitive sizeable part is rejected even though it is under the size caps', async () => {
  const u = await makeUser('ratio');
  const repetitive = docxWith('a'.repeat(600 * 1024)); // 600 KB expanded (< 1 MB cap) but compresses ~1000:1
  await assertRejected(u, () => uploadDocx(u, repetitive), TOO_LARGE);
});

test('DOCX guard does not trust header sizes: an oversized part whose headers claim a tiny size is still rejected', async () => {
  const u = await makeUser('forged1');
  const big = documentXml(fillerText(Math.floor(1.5 * MB)));
  const forged = docxWith('', [], { documentData: big, document: { declaredUncompressed: 100 } });
  await assertRejected(u, () => uploadDocx(u, forged), TOO_LARGE);
  // the same at unit level, independent of the HTTP layer
  await assert.rejects(() => inspectDocx(forged), (e) => e.statusCode === 422 && e.code === 'DOCUMENT_TOO_LARGE');
});

test('forged metadata in the other direction (huge claimed size, small real part) or a lying compressed size never causes a server error', async () => {
  const u = await makeUser('forged2');
  const claimsHuge = docxWith('a perfectly ordinary short paragraph of text', [], { document: { declaredUncompressed: 0xfffffff0 } });
  const r1 = await uploadDocx(u, claimsHuge);
  assert.ok(r1.status < 500, `no 5xx (got ${r1.status})`);
  assert.equal(r1.data.success === false || r1.status === 201, true);

  const lyingCompressed = docxWith('ordinary text that is long enough to count', [], { document: { declaredCompressed: 0x7ffffff0 } });
  await assertRejected(u, () => uploadDocx(u, lyingCompressed), UNSUPPORTED);
  await prisma.learningMaterial.deleteMany({ where: { userId: u.user.id } }); // r1 may legitimately have been accepted
});

test('corrupt DOCX files are rejected cleanly (truncated archive, garbage after the signature, damaged compressed data)', async () => {
  const u = await makeUser('corrupt');
  const good = docxWith('a normal document with enough words in it');
  await assertRejected(u, () => uploadDocx(u, good.subarray(0, good.length - 40)), UNSUPPORTED); // central directory cut off
  await assertRejected(u, () => uploadDocx(u, Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('word/document.xml'), Buffer.alloc(200, 7)])), UNSUPPORTED);
  const damaged = buildZip([
    { name: '[Content_Types].xml', data: 'x' },
    { name: 'word/document.xml', data: Buffer.alloc(300, 0xab), raw: true, method: 8 }, // bytes that are not valid deflate data
  ]);
  await assertRejected(u, () => uploadDocx(u, damaged), UNSUPPORTED);
});

test('a ZIP without a real word/document.xml entry is rejected even if that text appears inside another part', async () => {
  const u = await makeUser('missing');
  const decoy = buildZip([
    { name: '[Content_Types].xml', data: 'x' },
    { name: 'notes/readme.txt', data: 'this archive mentions word/document.xml only as text' },
  ]);
  await assertRejected(u, () => uploadDocx(u, decoy), UNSUPPORTED);
});

test('structurally suspicious archives are rejected: encrypted parts, unsupported compression, path tricks', async () => {
  const u = await makeUser('suspicious');
  const entry = (extra) => buildZip([{ name: '[Content_Types].xml', data: 'x' }, { name: 'word/document.xml', data: documentXml('some ordinary text here for the test'), ...extra }]);
  await assertRejected(u, () => uploadDocx(u, entry({ flags: 1 })), UNSUPPORTED); // encrypted flag
  await assertRejected(u, () => uploadDocx(u, entry({ method: 12, raw: true })), UNSUPPORTED); // bzip2 etc.
  const traversal = buildZip([
    { name: '[Content_Types].xml', data: 'x' },
    { name: 'word/document.xml', data: documentXml('some ordinary text here for the test') },
    { name: '../../evil.xml', data: '<x/>' },
  ]);
  await assertRejected(u, () => uploadDocx(u, traversal), UNSUPPORTED);
});

test('normal DOCX files pass the guard and are extracted (realistic sizes, default-like behaviour)', async () => {
  const u = await makeUser('normal-docx');
  const small = buildDocx(SENTENCES.join(' '));
  assert.equal((await uploadDocx(u, small)).status, 201);
  const larger = docxWith(fillerText(Math.floor(0.8 * MB))); // 0.8 MB of text, under every limit
  const res = await uploadDocx(u, larger);
  assert.equal(res.status, 201);
  assert.equal(res.data.material.hasExtractedText, true);
});

// ============================================================================ extracted-text limit

const textOfLength = (n) => `${'lorem ipsum '.repeat(Math.ceil(n / 12)).slice(0, n - 1)}x`; // exactly n chars, no trailing/leading whitespace

test('TXT: extracted text over MAX_EXTRACTED_TEXT_CHARS is rejected; exactly at the limit is accepted', async () => {
  process.env.MAX_EXTRACTED_TEXT_CHARS = '5000';
  try {
    const u = await makeUser('txt-limit');
    await assertRejected(u, () => uploadTxt(u, textOfLength(5001)), { status: 422, code: 'TEXT_TOO_LONG' });
    const ok = await uploadTxt(u, textOfLength(5000));
    assert.equal(ok.status, 201, 'exactly at the limit is accepted');
  } finally {
    delete process.env.MAX_EXTRACTED_TEXT_CHARS;
  }
});

test('PDF and DOCX: the same limit applies, and exactly-at-the-limit is accepted', async () => {
  const pdf = buildPdf(SENTENCES);
  const docx = buildDocx(SENTENCES.join(' '));
  const pdfLen = (await extractTextFromBuffer(pdf, 'PDF')).length;
  const docxLen = (await extractTextFromBuffer(docx, 'DOCX')).length;
  assert.ok(pdfLen > 100 && docxLen > 100);
  const u = await makeUser('pdfdocx-limit');
  try {
    process.env.MAX_EXTRACTED_TEXT_CHARS = String(pdfLen - 1);
    await assertRejected(u, () => uploadPdf(u, pdf), { status: 422, code: 'TEXT_TOO_LONG' });
    process.env.MAX_EXTRACTED_TEXT_CHARS = String(pdfLen);
    assert.equal((await uploadPdf(u, pdf)).status, 201, 'PDF exactly at the limit');

    await prisma.learningMaterial.deleteMany({ where: { userId: u.user.id } });
    process.env.MAX_EXTRACTED_TEXT_CHARS = String(docxLen - 1);
    await assertRejected(u, () => uploadDocx(u, docx), { status: 422, code: 'TEXT_TOO_LONG' });
    process.env.MAX_EXTRACTED_TEXT_CHARS = String(docxLen);
    assert.equal((await uploadDocx(u, docx)).status, 201, 'DOCX exactly at the limit');
  } finally {
    delete process.env.MAX_EXTRACTED_TEXT_CHARS;
  }
});

test('extractor level: a PDF that passes the text limit raises TEXT_TOO_LONG with a user-safe message', async () => {
  const many = buildPdf(Array.from({ length: 200 }, (_, i) => `${SENTENCES[i % SENTENCES.length]} ${i}`)); // one page, ~20k chars
  process.env.MAX_EXTRACTED_TEXT_CHARS = '2000';
  try {
    await assert.rejects(() => extractTextFromBuffer(many, 'PDF'), (e) => e.statusCode === 422 && e.code === 'TEXT_TOO_LONG' && /characters/.test(e.message));
  } finally {
    delete process.env.MAX_EXTRACTED_TEXT_CHARS;
  }
});

test('invalid limit configuration falls back to the documented defaults (never to "no limit")', () => {
  const saved = { c: process.env.MAX_EXTRACTED_TEXT_CHARS, x: process.env.DOCX_MAX_XML_MB, t: process.env.DOCX_MAX_TOTAL_MB, r: process.env.DOCX_MAX_COMPRESSION_RATIO };
  try {
    for (const bad of ['abc', '', ' ', '-5', '0', '99', '1.5', 'Infinity', 'NaN', '99999999999', null]) {
      if (bad === null) delete process.env.MAX_EXTRACTED_TEXT_CHARS; else process.env.MAX_EXTRACTED_TEXT_CHARS = bad;
      assert.equal(limits.maxTextChars(), 2_000_000, `MAX_EXTRACTED_TEXT_CHARS=${JSON.stringify(bad)} -> default`);
    }
    process.env.MAX_EXTRACTED_TEXT_CHARS = '250000';
    assert.equal(limits.maxTextChars(), 250000, 'a valid value is honoured');

    for (const [name, key, def] of [['DOCX_MAX_XML_MB', 'maxXmlBytes', 8 * MB], ['DOCX_MAX_TOTAL_MB', 'maxTotalBytes', 40 * MB], ['DOCX_MAX_COMPRESSION_RATIO', 'maxRatio', 100]]) {
      for (const bad of ['abc', '', '-1', '0', '1e9', 'Infinity']) {
        process.env[name] = bad;
        assert.equal(limits.docxLimits()[key], def, `${name}=${JSON.stringify(bad)} -> default`);
      }
    }
    delete process.env.DOCX_MAX_XML_MB;
    delete process.env.DOCX_MAX_TOTAL_MB;
    delete process.env.DOCX_MAX_COMPRESSION_RATIO;
    assert.deepEqual(limits.docxLimits(), { maxXmlBytes: 8 * MB, maxTotalBytes: 40 * MB, maxRatio: 100 }, 'documented defaults');
  } finally {
    for (const [k, v] of [['MAX_EXTRACTED_TEXT_CHARS', saved.c], ['DOCX_MAX_XML_MB', saved.x], ['DOCX_MAX_TOTAL_MB', saved.t], ['DOCX_MAX_COMPRESSION_RATIO', saved.r]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('with the documented default limits a realistic large-but-legitimate DOCX is still accepted', async () => {
  const saved = { x: process.env.DOCX_MAX_XML_MB, t: process.env.DOCX_MAX_TOTAL_MB, r: process.env.DOCX_MAX_COMPRESSION_RATIO };
  delete process.env.DOCX_MAX_XML_MB;
  delete process.env.DOCX_MAX_TOTAL_MB;
  delete process.env.DOCX_MAX_COMPRESSION_RATIO;
  try {
    const u = await makeUser('defaults');
    const media = { name: 'word/media/photo.jpg', data: require('node:crypto').randomBytes(3 * MB) }; // a 3 MB embedded image
    const res = await uploadDocx(u, docxWith(fillerText(1_200_000), [media])); // ~1.2 M characters of text (under the 2 M default)
    assert.equal(res.status, 201);
  } finally {
    for (const [k, v] of [['DOCX_MAX_XML_MB', saved.x], ['DOCX_MAX_TOTAL_MB', saved.t], ['DOCX_MAX_COMPRESSION_RATIO', saved.r]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

// ================================================================= list / detail do not load the text

test('list and detail queries never load the extracted-text column, and hasExtractedText is preserved', async () => {
  const u = await makeUser('no-text-load');
  const withText = await prisma.learningMaterial.create({
    data: { userId: u.user.id, fileName: 'a.txt', originalName: 'with-text.txt', fileType: 'TXT', fileSize: 10, status: 'UPLOADED', extractedText: 'x'.repeat(50_000) },
  });
  const noText = await prisma.learningMaterial.create({
    data: { userId: u.user.id, fileName: 'b.txt', originalName: 'no-text.txt', fileType: 'TXT', fileSize: 10, status: 'UPLOADED' },
  });

  // record what the material queries actually return while the two endpoints run
  const returned = [];
  const realMany = prisma.learningMaterial.findMany.bind(prisma.learningMaterial);
  const realFirst = prisma.learningMaterial.findFirst.bind(prisma.learningMaterial);
  prisma.learningMaterial.findMany = async (args) => { const r = await realMany(args); returned.push(...r); return r; };
  prisma.learningMaterial.findFirst = async (args) => { const r = await realFirst(args); if (r) returned.push(r); return r; };
  let list;
  let detailWith;
  let detailNo;
  try {
    list = await request(base, 'GET', '/materials', { token: u.token });
    detailWith = await request(base, 'GET', `/materials/${withText.id}`, { token: u.token });
    detailNo = await request(base, 'GET', `/materials/${noText.id}`, { token: u.token });
  } finally {
    prisma.learningMaterial.findMany = realMany;
    prisma.learningMaterial.findFirst = realFirst;
  }

  assert.ok(returned.length >= 4, 'the material queries did run');
  for (const row of returned) assert.ok(!('extractedText' in row), 'a row returned by a list/detail query contained the extractedText column');

  assert.equal(list.status, 200);
  const byName = Object.fromEntries(list.data.materials.map((m) => [m.originalName, m]));
  assert.equal(byName['with-text.txt'].hasExtractedText, true);
  assert.equal(byName['no-text.txt'].hasExtractedText, false);
  assert.equal(detailWith.data.material.hasExtractedText, true);
  assert.equal(detailNo.data.material.hasExtractedText, false);
  assert.ok(!JSON.stringify([list.data, detailWith.data]).includes('xxxxxxxxxx'), 'the text itself is never returned');
});

test('analysis and quiz generation still load and use the text when they genuinely need it', async () => {
  const u = await makeUser('needs-text');
  const up = await uploadTxt(u, SENTENCES.join(' '));
  assert.equal(up.status, 201);
  const id = up.data.material.id;
  assert.equal((await request(base, 'POST', `/materials/${id}/analyze`, { token: u.token })).status, 200);
  assert.equal((await request(base, 'POST', '/quizzes/generate', { token: u.token, body: { materialId: id, count: 5 } })).status, 201);
  // ownership is still enforced (another user cannot analyse or generate from it)
  const other = await makeUser('other');
  assert.equal((await request(base, 'POST', `/materials/${id}/analyze`, { token: other.token })).status, 404);
  assert.equal((await request(base, 'POST', '/quizzes/generate', { token: other.token, body: { materialId: id, count: 5 } })).status, 404);
});

// ============================================================================ regression: normal flow

test('normal PDF / DOCX / TXT uploads still work end to end and are stored under the owner', async () => {
  const u = await makeUser('normal');
  const results = [
    await uploadPdf(u, buildPdf(SENTENCES)),
    await uploadDocx(u, buildDocx(SENTENCES.join(' '))),
    await uploadTxt(u, SENTENCES.join(' ')),
  ];
  assert.deepEqual(results.map((r) => r.status), [201, 201, 201]);
  const rows = await prisma.learningMaterial.findMany({ where: { userId: u.user.id } });
  assert.equal(rows.length, 3);
  for (const r of rows) {
    assert.equal(r.status, 'UPLOADED');
    assert.ok(r.storageKey.startsWith(`users/${u.user.id}/`));
    assert.ok(r.extractedText.length >= 20);
    assert.ok(fs.existsSync(path.join(ROOT, ...r.storageKey.split('/'))), 'the stored file exists');
  }
});

test('a failure while storing the file leaves no record (extraction happens first, the row is written last)', async () => {
  const u = await makeUser('put-fail');
  const LocalVolumeStorage = require('../src/storage/LocalVolumeStorage');
  const realPut = LocalVolumeStorage.prototype.put;
  LocalVolumeStorage.prototype.put = async () => { throw new Error('disk full'); };
  const errSpy = console.error;
  console.error = () => {};
  let res;
  try {
    res = await uploadTxt(u, SENTENCES.join(' '));
  } finally {
    LocalVolumeStorage.prototype.put = realPut;
    console.error = errSpy;
  }
  assert.equal(res.status, 503);
  assert.equal(res.data.code, 'STORAGE_UNAVAILABLE');
  assert.equal(await prisma.learningMaterial.count({ where: { userId: u.user.id } }), 0);
});

test('an over-limit PDF is rejected through the API with the specific TEXT_TOO_LONG error (not the generic "empty" one) and leaves nothing behind', async () => {
  // Regression: pdf-parse swallows exceptions thrown inside its page renderer, so the overrun has to be
  // recorded and raised after parsing; otherwise the upload would fail with the wrong message.
  const pdf = buildPdf(Array.from({ length: 200 }, (_, i) => `${SENTENCES[i % SENTENCES.length]} ${i}`));
  process.env.MAX_EXTRACTED_TEXT_CHARS = '1500';
  try {
    const u = await makeUser('pdf-early');
    await assertRejected(u, () => uploadPdf(u, pdf), { status: 422, code: 'TEXT_TOO_LONG' });
  } finally {
    delete process.env.MAX_EXTRACTED_TEXT_CHARS;
  }
});
