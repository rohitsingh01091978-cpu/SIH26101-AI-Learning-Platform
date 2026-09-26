// Persistent file storage (Railway Volume implementation): ownership, deletion, path safety,
// file-type/size validation, failure handling, configuration and maintenance scripts.
process.env.MAX_UPLOAD_SIZE_MB = '1';
process.env.UPLOAD_RATE_LIMIT_PER_MINUTE = '1000';
process.env.FILE_ACCESS_RATE_LIMIT_PER_MINUTE = '40';
process.env.AI_JOB_RATE_LIMIT_PER_MINUTE = '1000';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, request, stop } = require('./helpers');
const prisma = require('../src/utils/prisma');
const { signToken } = require('../src/utils/jwt');
const { getStorage, describeStorage } = require('../src/storage');
const LocalVolumeStorage = require('../src/storage/LocalVolumeStorage');
const { buildKey, parseKey } = require('../src/storage/keys');
const { sanitizeOriginalName, validateUpload } = require('../src/storage/fileValidation');
const { buildPdf, buildDocx, SENTENCES } = require('./fixtures');

const PREFIX = 'storage-test-';
const ROOT = process.env.STORAGE_ROOT;
const SERVER_DIR = path.resolve(__dirname, '..');
const TEXT = `${SENTENCES.join(' ')}\n`;
let server;
let base;

const uuid = () => crypto.randomUUID();
const isWin = process.platform === 'win32';

async function makeUser(tag) {
  const user = await prisma.user.create({
    data: { email: `${PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`, name: `Storage ${tag}`, password: null, role: 'LEARNER', authProvider: 'google', googleId: `sub-${Math.random()}` },
  });
  await prisma.learnerProfile.create({ data: { userId: user.id } });
  return { user, token: signToken(user) };
}

function form(buffer, filename, type, extra = {}) {
  const f = new FormData();
  f.append('file', new Blob([buffer], { type }), filename);
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  return f;
}
const upload = (u, buffer, filename, type, extra) => request(base, 'POST', '/materials/upload', { token: u.token, raw: form(buffer, filename, type, extra) });
const uploadTxt = (u, name = 'notes.txt') => upload(u, Buffer.from(TEXT), name, 'text/plain');

async function rawGet(token, url) {
  const send = () => fetch(`${base}${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  let res;
  try {
    res = await send();
  } catch (err) {
    // A pooled keep-alive connection can be closed by the server (5 s idle timeout) just as it is reused - which
    // happens after the slow child-process tests on a loaded machine. Retry once on a fresh connection.
    if (err && err.cause && ['ECONNRESET', 'UND_ERR_SOCKET'].includes(err.cause.code)) res = await send();
    else throw err;
  }
  return { status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
}
const jsonOf = (r) => JSON.parse(r.buffer.toString('utf8'));

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full)); else out.push(full);
  }
  return out;
}
const rowOf = (id) => prisma.learningMaterial.findUnique({ where: { id } });
const filePathOf = (key) => path.join(ROOT, ...key.split('/'));

before(async () => {
  ({ server, base } = await startServer());
});
after(async () => {
  const mats = await prisma.learningMaterial.findMany({ where: { user: { email: { startsWith: PREFIX } } }, select: { storageKey: true } });
  for (const m of mats) if (m.storageKey) await getStorage().delete(m.storageKey).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await stop(server);
});

// ============================================================ upload: storage, metadata, no leakage

test('upload stores the file under the owner\'s folder with a generated name; the API exposes no path or key', async () => {
  const a = await makeUser('upload');
  const res = await uploadTxt(a, 'My Statistics Notes.txt');
  assert.equal(res.status, 201);
  const m = res.data.material;
  assert.equal(m.hasStoredFile, true);
  assert.equal(m.originalName, 'My Statistics Notes.txt');
  assert.deepEqual(Object.keys(m).sort(), ['fileSize', 'fileType', 'hasExtractedText', 'hasStoredFile', 'id', 'originalName', 'status', 'uploadedAt']);

  const row = await rowOf(m.id);
  assert.match(row.storageKey, new RegExp(`^users/${a.user.id}/[0-9a-f-]{36}\\.txt$`));
  assert.equal(row.storageProvider, 'volume');
  assert.equal(row.filePath, null, 'no absolute path is recorded for new uploads');
  assert.equal(row.fileName, row.storageKey.split('/').pop(), 'stored name is generated, not the client\'s');
  assert.equal(row.sha256, crypto.createHash('sha256').update(Buffer.from(TEXT)).digest('hex'));
  assert.equal(row.status, 'UPLOADED');
  assert.ok(row.extractedText.includes('Statistical sampling'));

  const onDisk = filePathOf(row.storageKey);
  assert.ok(fs.existsSync(onDisk), 'file exists in the storage root');
  assert.equal(fs.readFileSync(onDisk).toString(), TEXT);
  if (!isWin) assert.equal(fs.statSync(onDisk).mode & 0o111, 0, 'stored files are never executable');

  const blob = JSON.stringify(res.data);
  for (const secret of [ROOT, row.storageKey, row.fileName, row.sha256, a.user.id, 'storageKey', 'filePath']) {
    assert.ok(!blob.includes(secret), `response leaked: ${String(secret).slice(0, 20)}`);
  }
});

test('PDF and DOCX uploads are accepted, text extraction still works, and the analysis/MCQ flow runs on them', async () => {
  const a = await makeUser('formats');
  const pdf = await upload(a, buildPdf(SENTENCES), 'lecture.pdf', 'application/pdf');
  const docx = await upload(a, buildDocx(SENTENCES.join(' ')), 'lecture.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(pdf.status, 201);
  assert.equal(docx.status, 201);
  assert.equal(pdf.data.material.fileType, 'PDF');
  assert.equal(docx.data.material.fileType, 'DOCX');
  for (const m of [pdf.data.material, docx.data.material]) {
    assert.equal(m.hasExtractedText, true);
    const analyze = await request(base, 'POST', `/materials/${m.id}/analyze`, { token: a.token });
    assert.equal(analyze.status, 200);
    const quiz = await request(base, 'POST', '/quizzes/generate', { token: a.token, body: { materialId: m.id, count: 5 } });
    assert.equal(quiz.status, 201);
  }
});

test('client-supplied userId / path / key fields are ignored: ownership always comes from the login token', async () => {
  const a = await makeUser('forge-a');
  const b = await makeUser('forge-b');
  const res = await upload(a, Buffer.from(TEXT), 'x.txt', 'text/plain', { userId: b.user.id, storageKey: `users/${b.user.id}/${uuid()}.txt`, filePath: '/etc/passwd', fileName: '../../evil.txt' });
  assert.equal(res.status, 201);
  const row = await rowOf(res.data.material.id);
  assert.equal(row.userId, a.user.id);
  assert.ok(row.storageKey.startsWith(`users/${a.user.id}/`));
  assert.ok(!fs.existsSync(path.join(ROOT, 'users', b.user.id)), 'nothing was written into the other user\'s folder');
});

// =============================================================================== authentication

test('unauthenticated upload / download / delete -> 401', async () => {
  const a = await makeUser('anon');
  const m = (await uploadTxt(a)).data.material;
  assert.equal((await request(base, 'POST', '/materials/upload', { raw: form(Buffer.from(TEXT), 'x.txt', 'text/plain') })).status, 401);
  assert.equal((await rawGet(null, `/materials/${m.id}/file`)).status, 401);
  assert.equal((await request(base, 'DELETE', `/materials/${m.id}`)).status, 401);
  assert.equal((await rawGet('not.a.jwt', `/materials/${m.id}/file`)).status, 401);
  assert.ok(fs.existsSync(filePathOf((await rowOf(m.id)).storageKey)), 'file untouched');
});

// ================================================================================ download

test('the owner can download the exact original bytes with safe headers', async () => {
  const a = await makeUser('download');
  const pdfBytes = buildPdf(SENTENCES);
  const m = (await upload(a, pdfBytes, 'Ünïcode "quoted" report.pdf', 'application/pdf')).data.material;

  const res = await rawGet(a.token, `/materials/${m.id}/file`);
  assert.equal(res.status, 200);
  assert.ok(res.buffer.equals(pdfBytes), 'byte-for-byte identical');
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal(res.headers.get('content-length'), String(pdfBytes.length));
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="[^"]*"; filename\*=UTF-8''/);
  assert.ok(!res.headers.get('content-disposition').includes('"quoted"'), 'quotes cannot break out of the header');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('cache-control'), /private/);
  assert.ok(!JSON.stringify([...res.headers]).includes(ROOT), 'no filesystem path in headers');

  const txt = (await uploadTxt(a)).data.material;
  assert.equal((await rawGet(a.token, `/materials/${txt.id}/file`)).headers.get('content-type'), 'text/plain; charset=utf-8');
});

// ============================================================ another user: 404, indistinguishable

test('another user gets the same 404 for someone else\'s file as for a file that does not exist (no leak)', async () => {
  const a = await makeUser('owner');
  const b = await makeUser('intruder');
  const m = (await uploadTxt(a)).data.material;
  const key = (await rowOf(m.id)).storageKey;

  const ghostId = uuid();
  const real = await rawGet(b.token, `/materials/${m.id}/file`);
  const ghost = await rawGet(b.token, `/materials/${ghostId}/file`);
  assert.equal(real.status, 404);
  assert.equal(ghost.status, 404);
  assert.deepEqual(jsonOf(real), jsonOf(ghost), 'identical bodies');

  // Same for detail and delete; and the owner's data is untouched by the attempts.
  const detailReal = await request(base, 'GET', `/materials/${m.id}`, { token: b.token });
  const detailGhost = await request(base, 'GET', `/materials/${ghostId}`, { token: b.token });
  assert.equal(detailReal.status, 404);
  assert.deepEqual(detailReal.data, detailGhost.data);
  const delReal = await request(base, 'DELETE', `/materials/${m.id}`, { token: b.token });
  const delGhost = await request(base, 'DELETE', `/materials/${ghostId}`, { token: b.token });
  assert.equal(delReal.status, 404);
  assert.deepEqual(delReal.data, delGhost.data);

  assert.ok(fs.existsSync(filePathOf(key)), 'the owner\'s file survived the delete attempt');
  assert.ok(await rowOf(m.id), 'the owner\'s record survived');
  assert.equal((await rawGet(a.token, `/materials/${m.id}/file`)).status, 200, 'the owner still has access');
  // a query-string userId cannot switch identity
  assert.equal((await rawGet(b.token, `/materials/${m.id}/file?userId=${a.user.id}`)).status, 404);
});

// ================================================================================== delete

test('the owner can delete: file, record and analysis go; quizzes and results are kept; a second delete is 404', async () => {
  const a = await makeUser('delete');
  const m = (await uploadTxt(a)).data.material;
  const key = (await rowOf(m.id)).storageKey;
  assert.equal((await request(base, 'POST', `/materials/${m.id}/analyze`, { token: a.token })).status, 200);
  const quiz = await request(base, 'POST', '/quizzes/generate', { token: a.token, body: { materialId: m.id, count: 5 } });
  assert.equal(quiz.status, 201);
  const quizId = quiz.data.quiz.id;

  const res = await request(base, 'DELETE', `/materials/${m.id}`, { token: a.token });
  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);

  assert.ok(!fs.existsSync(filePathOf(key)), 'stored file removed');
  assert.equal(await rowOf(m.id), null, 'record removed');
  assert.equal(await prisma.documentAnalysis.count({ where: { materialId: m.id } }), 0, 'analysis removed');
  const keptQuiz = await prisma.quiz.findUnique({ where: { id: quizId }, include: { questions: true } });
  assert.ok(keptQuiz, 'the quiz survives');
  assert.equal(keptQuiz.materialId, null, 'only its link to the material is cleared');
  assert.ok(keptQuiz.questions.length > 0, 'its questions survive');
  assert.equal((await request(base, 'GET', `/quizzes/${quizId}`, { token: a.token })).status, 200, 'the quiz is still usable');

  assert.equal((await request(base, 'DELETE', `/materials/${m.id}`, { token: a.token })).status, 404);
  assert.equal((await rawGet(a.token, `/materials/${m.id}/file`)).status, 404);
  assert.equal((await request(base, 'GET', '/materials', { token: a.token })).data.materials.length, 0);
});

test('deleting one user\'s material never touches another user\'s files', async () => {
  const a = await makeUser('iso-a');
  const b = await makeUser('iso-b');
  const ma = (await uploadTxt(a)).data.material;
  const mb = (await uploadTxt(b)).data.material;
  const keyB = (await rowOf(mb.id)).storageKey;
  await request(base, 'DELETE', `/materials/${ma.id}`, { token: a.token });
  assert.ok(fs.existsSync(filePathOf(keyB)));
  assert.equal((await rawGet(b.token, `/materials/${mb.id}/file`)).status, 200);
});

// ============================================================================ path traversal

test('hostile filenames are neutralised: nothing is written outside the user folder and names are generated', async () => {
  const a = await makeUser('traversal');
  const before = new Set(walk(ROOT));
  const names = ['../../evil.txt', '..\\..\\windows\\evil.txt', '/etc/passwd.txt', 'C:\\Users\\x\\evil.txt', '....//....//x.txt', 'a/b/c.txt', 'line\nbreak.txt', '.hidden.txt', '   spaced   name  .txt'];
  for (const name of names) {
    const res = await upload(a, Buffer.from(TEXT), name, 'text/plain');
    assert.equal(res.status, 201, JSON.stringify(name));
    const shown = res.data.material.originalName;
    assert.ok(!/[\\/\u0000-\u001f]/.test(shown), `sanitised: ${JSON.stringify(shown)}`);
    assert.ok(!shown.startsWith('.'), 'no leading dot');
    const row = await rowOf(res.data.material.id);
    assert.match(row.storageKey, new RegExp(`^users/${a.user.id}/[0-9a-f-]{36}\\.txt$`));
  }
  const added = walk(ROOT).filter((f) => !before.has(f));
  assert.equal(added.length, names.length);
  for (const f of added) {
    assert.ok(path.relative(path.join(ROOT, 'users', a.user.id), f).match(/^[0-9a-f-]{36}\.txt$/), `only generated names inside the owner folder: ${path.basename(f)}`);
  }
  assert.ok(!fs.existsSync(path.join(ROOT, '..', 'evil.txt')));
});

test('a malformed multipart body (NUL byte in the filename) is a clean 400, not a server error, and stores nothing', async () => {
  const a = await makeUser('malformed');
  const before = walk(ROOT).length;
  const res = await upload(a, Buffer.from(TEXT), 'nul\u0000byte.txt', 'text/plain');
  assert.equal(res.status, 400);
  assert.equal(res.data.success, false);
  assert.equal(walk(ROOT).length, before);
  assert.equal(await prisma.learningMaterial.count({ where: { userId: a.user.id } }), 0);
});

test('sanitizeOriginalName: unit cases', () => {
  assert.equal(sanitizeOriginalName('../../secret.pdf'), 'secret.pdf');
  assert.equal(sanitizeOriginalName('..\\..\\x.docx'), 'x.docx');
  assert.equal(sanitizeOriginalName('  a   b .txt'), 'a b .txt');
  assert.equal(sanitizeOriginalName(''), 'document');
  assert.equal(sanitizeOriginalName('....'), 'document');
  assert.ok(sanitizeOriginalName(`${'x'.repeat(400)}.pdf`).length <= 150);
  assert.ok(sanitizeOriginalName(`${'x'.repeat(400)}.pdf`).endsWith('.pdf'));
});

test('storage keys: only the exact server-generated shape is accepted; traversal shapes are rejected', () => {
  const u = uuid();
  const f = uuid();
  assert.ok(parseKey(`users/${u}/${f}.pdf`));
  const bad = [
    `../${u}/${f}.pdf`, `users/../${f}.pdf`, `users/${u}/../${f}.pdf`, `/etc/passwd`, `users/${u}/${f}.exe`, `users/${u}/${f}.pdf/extra`,
    `users/${u}/${f}.PDF`, `users/${u.toUpperCase()}/${f}.pdf`, `users/${u}\\${f}.pdf`, `users/${u}/${f}.pdf\u0000`, `users/${u}/%2e%2e/${f}.pdf`,
    `users/nobody/${f}.pdf`, `users/${u}/..%2f${f}.pdf`, '', null, undefined, 42, 'users/', `users/${u}//${f}.pdf`,
  ];
  for (const k of bad) assert.equal(parseKey(k), null, `should reject ${JSON.stringify(k)}`);
  assert.throws(() => buildKey('not-a-uuid', 'PDF'));
  assert.throws(() => buildKey(u, 'EXE'));
});

test('LocalVolumeStorage refuses traversal keys: get/delete see nothing, put throws, an outside file is never touched', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sih-vol-'));
  const root = path.join(dir, 'root');
  fs.mkdirSync(root);
  const outside = path.join(dir, 'outside-secret.txt');
  fs.writeFileSync(outside, 'TOP SECRET');
  const s = new LocalVolumeStorage(root);
  const u = uuid();
  try {
    for (const k of ['../outside-secret.txt', `users/${u}/../../outside-secret.txt`, outside, `users/${u}/${uuid()}.txt/../../../../outside-secret.txt`]) {
      assert.equal(await s.get(k), null, `get ${k}`);
      assert.equal(await s.delete(k), false, `delete ${k}`);
      await assert.rejects(() => s.put(k, Buffer.from('x')), /Invalid storage key/);
    }
    assert.equal(fs.readFileSync(outside, 'utf8'), 'TOP SECRET');
    assert.deepEqual(walk(root), [], 'nothing was created under the root');

    // normal life cycle, and never overwrite
    const key = buildKey(u, 'TXT');
    await s.put(key, Buffer.from('hello'));
    await assert.rejects(() => s.put(key, Buffer.from('replaced')), /exists/i);
    const got = await s.get(key);
    const chunks = [];
    for await (const c of got.stream) chunks.push(c);
    assert.equal(Buffer.concat(chunks).toString(), 'hello');
    assert.equal((await s.list()).length, 1);
    assert.equal(await s.delete(key), true);
    assert.equal(await s.delete(key), false);
    assert.equal(await s.healthCheck(), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a symlink inside the storage root that points outside is never served', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sih-sym-'));
  const root = path.join(dir, 'root');
  const u = uuid();
  const key = `users/${u}/${uuid()}.txt`;
  fs.mkdirSync(path.join(root, 'users', u), { recursive: true });
  const outside = path.join(dir, 'outside.txt');
  fs.writeFileSync(outside, 'OUTSIDE');
  try {
    try {
      fs.symlinkSync(outside, path.join(root, ...key.split('/')));
    } catch {
      return t.skip('symlinks not permitted on this system');
    }
    assert.equal(await new LocalVolumeStorage(root).get(key), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a tampered storage key in the database cannot reach files outside the root (download 404, delete only removes the row)', async () => {
  const a = await makeUser('tamper');
  const outside = path.join(os.tmpdir(), `sih-outside-${uuid()}.txt`);
  fs.writeFileSync(outside, 'MUST SURVIVE');
  try {
    for (const evil of ['../../etc/passwd', outside, `users/${a.user.id}/../../../x.txt`]) {
      const m = await prisma.learningMaterial.create({
        data: { userId: a.user.id, fileName: 'x.txt', originalName: 'x.txt', fileType: 'TXT', fileSize: 1, storageKey: evil, storageProvider: 'volume', status: 'UPLOADED', extractedText: 'text' },
      });
      const dl = await rawGet(a.token, `/materials/${m.id}/file`);
      assert.equal(dl.status, 404);
      assert.equal(jsonOf(dl).code, 'FILE_NOT_AVAILABLE');
      assert.equal((await request(base, 'DELETE', `/materials/${m.id}`, { token: a.token })).status, 200);
    }
    assert.equal(fs.readFileSync(outside, 'utf8'), 'MUST SURVIVE');
  } finally {
    fs.rmSync(outside, { force: true });
  }
});

// ==================================================================== type and size validation

test('invalid file types are rejected with 415 and nothing is stored or recorded', async () => {
  const a = await makeUser('types');
  const before = walk(ROOT).length;
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0)]);
  const cases = [
    ['malware.exe', 'application/octet-stream', exe],
    ['malware.exe', 'text/plain', exe],
    ['fake.txt', 'text/plain', exe], // executable bytes pretending to be text
    ['binary.txt', 'text/plain', Buffer.from([0x50, 0x00, 0x01, 0x02, 0xff, 0xfe])],
    ['latin1.txt', 'text/plain', Buffer.from([0xe9, 0xe8, 0xe0, 0x20, 0xc0])], // not valid UTF-8
    ['fake.pdf', 'application/pdf', Buffer.from('this is not a pdf at all, just words')],
    ['fake.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from('plain text pretending to be a docx')],
    ['zip.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100, 1)])], // a zip that is not a docx
    ['page.html', 'text/html', Buffer.from('<script>alert(1)</script>')],
    ['image.svg', 'image/svg+xml', Buffer.from('<svg onload=alert(1)/>')],
    ['double.pdf.exe', 'application/pdf', buildPdf(SENTENCES)],
    ['noext', 'text/plain', Buffer.from(TEXT)],
    ['empty.txt', 'text/plain', Buffer.alloc(0)],
  ];
  for (const [name, type, buf] of cases) {
    const res = await upload(a, buf, name, type);
    assert.ok([400, 415].includes(res.status), `${name} (${type}) -> ${res.status}`);
    assert.equal(res.data.success, false);
  }
  assert.equal(walk(ROOT).length, before, 'no file was stored for any rejected upload');
  assert.equal(await prisma.learningMaterial.count({ where: { userId: a.user.id } }), 0, 'no record was created either');
  assert.equal((await request(base, 'POST', '/materials/upload', { token: a.token })).status, 400, 'no file at all');
});

test('a genuine-looking PDF whose text cannot be extracted is refused (422) and its file is NOT stored', async () => {
  const a = await makeUser('junkpdf');
  const before = walk(ROOT).length;
  const junk = Buffer.from(`%PDF-1.4\n${'garbage that is not a real pdf structure '.repeat(200)}`);
  const res = await upload(a, junk, 'junk.pdf', 'application/pdf');
  assert.equal(res.status, 422);
  assert.equal(walk(ROOT).length, before, 'unreadable documents never reach storage');
  const rows = await prisma.learningMaterial.findMany({ where: { userId: a.user.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'FAILED');
  assert.equal(rows[0].storageKey, null);
});

test('oversized files are rejected with 413 and a clear message (limit MAX_UPLOAD_SIZE_MB)', async () => {
  const a = await makeUser('big');
  const before = walk(ROOT).length;
  const tooBig = Buffer.alloc(1024 * 1024 + 2048, 0x61); // > 1 MB
  const res = await upload(a, tooBig, 'huge.txt', 'text/plain');
  assert.equal(res.status, 413);
  assert.equal(res.data.code, 'FILE_TOO_LARGE');
  assert.match(res.data.message, /maximum size is 1 MB/);
  assert.equal(walk(ROOT).length, before);
  assert.equal(await prisma.learningMaterial.count({ where: { userId: a.user.id } }), 0);
  const okSize = Buffer.from(`${TEXT}${'a '.repeat(200000)}`); // ~400 KB, under the limit
  assert.equal((await upload(a, okSize, 'ok.txt', 'text/plain')).status, 201);
});

test('validateUpload: unit cases', () => {
  assert.equal(validateUpload({ originalname: 'a.txt', buffer: Buffer.from('hello') }).fileType, 'TXT');
  assert.equal(validateUpload({ originalname: 'a.pdf', buffer: buildPdf(SENTENCES) }).contentType, 'application/pdf');
  assert.throws(() => validateUpload({ originalname: 'a.pdf', buffer: Buffer.from('nope') }), /Unsupported/);
  assert.throws(() => validateUpload({ originalname: 'a.txt', buffer: Buffer.alloc(0) }), /Unsupported/);
});

// ======================================================================== failure handling

test('when the storage write fails: 503, no record left behind, no file, and nothing sensitive logged', async () => {
  const a = await makeUser('putfail');
  const original = LocalVolumeStorage.prototype.put;
  LocalVolumeStorage.prototype.put = async () => { throw Object.assign(new Error(`EACCES: permission denied, open '${ROOT}/secret-path'`), { code: 'EACCES' }); };
  const logs = [];
  const saved = { log: console.log, warn: console.warn, error: console.error };
  for (const l of ['log', 'warn', 'error']) console[l] = (...x) => logs.push(x.join(' '));
  let res;
  try {
    res = await uploadTxt(a, 'private-notes.txt');
  } finally {
    LocalVolumeStorage.prototype.put = original;
    Object.assign(console, saved);
  }
  assert.equal(res.status, 503);
  assert.equal(res.data.code, 'STORAGE_UNAVAILABLE');
  assert.equal(await prisma.learningMaterial.count({ where: { userId: a.user.id } }), 0);
  const joined = `${logs.join('\n')}\n${JSON.stringify(res.data)}`;
  for (const secret of [ROOT, 'secret-path', 'EACCES', 'private-notes', 'Statistical sampling']) assert.ok(!joined.includes(secret), `leaked: ${secret}`);
  assert.ok(logs.some((l) => l.includes('[storage]')), 'a generic storage error is logged');
});

test('if saving the record fails after the file was stored, the file is removed (no orphan)', async () => {
  const a = await makeUser('dbfail');
  const before = walk(ROOT).length;
  const realUpdate = prisma.learningMaterial.update.bind(prisma.learningMaterial);
  prisma.learningMaterial.update = async (args) => {
    if (args && args.data && args.data.storageKey) throw new Error('simulated database failure');
    return realUpdate(args);
  };
  const errSpy = console.error;
  console.error = () => {};
  let res;
  try {
    res = await uploadTxt(a);
  } finally {
    prisma.learningMaterial.update = realUpdate;
    console.error = errSpy;
  }
  assert.equal(res.status, 500);
  assert.equal(walk(ROOT).length, before, 'the stored file was cleaned up');
});

// ============================================================================ legacy records

test('materials uploaded before persistent storage: no download offered, delete still works and only removes files inside the legacy folder', async () => {
  const a = await makeUser('legacy');
  const legacyDir = path.join(SERVER_DIR, 'uploads');
  fs.mkdirSync(legacyDir, { recursive: true });
  const inside = path.join(legacyDir, `legacy-test-${uuid()}.txt`);
  const outside = path.join(os.tmpdir(), `legacy-outside-${uuid()}.txt`);
  fs.writeFileSync(inside, 'legacy inside');
  fs.writeFileSync(outside, 'legacy outside');
  try {
    const mk = (filePath) => prisma.learningMaterial.create({ data: { userId: a.user.id, fileName: 'old.txt', originalName: 'old.txt', fileType: 'TXT', fileSize: 5, filePath, status: 'UPLOADED', extractedText: 'legacy text body' } });
    const m1 = await mk(inside);
    const m2 = await mk(outside);

    const detail = await request(base, 'GET', `/materials/${m1.id}`, { token: a.token });
    assert.equal(detail.data.material.hasStoredFile, false);
    assert.ok(!JSON.stringify(detail.data).includes(inside));
    assert.equal(jsonOf(await rawGet(a.token, `/materials/${m1.id}/file`)).code, 'FILE_NOT_AVAILABLE');

    assert.equal((await request(base, 'DELETE', `/materials/${m1.id}`, { token: a.token })).status, 200);
    assert.equal((await request(base, 'DELETE', `/materials/${m2.id}`, { token: a.token })).status, 200);
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(!fs.existsSync(inside), 'the legacy file inside the upload folder was removed');
    assert.ok(fs.existsSync(outside), 'a path outside the legacy folder is never deleted');
  } finally {
    fs.rmSync(inside, { force: true });
    fs.rmSync(outside, { force: true });
  }
});

// ===================================================================== rate limiting / health

test('file downloads/deletes are rate limited per user', async () => {
  const a = await makeUser('rate');
  const statuses = [];
  for (let i = 0; i < 43; i += 1) statuses.push((await rawGet(a.token, `/materials/${uuid()}/file`)).status);
  assert.equal(statuses.filter((s) => s === 404).length, 40);
  assert.equal(statuses.filter((s) => s === 429).length, 3);
});

test('/api/health reports storage as a status word only - never a path', async () => {
  const res = await request(base, 'GET', '/health');
  assert.equal(res.data.storage, 'configured');
  assert.ok(!JSON.stringify(res.data).includes(ROOT));
});

// ============================================================ configuration (Railway Volume)

test('storage configuration: explicit root, Railway volume mount, production refusal, ephemeral opt-in', async () => {
  const keys = ['NODE_ENV', 'STORAGE_ROOT', 'RAILWAY_VOLUME_MOUNT_PATH', 'STORAGE_ALLOW_EPHEMERAL', 'STORAGE_PROVIDER'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const restore = () => keys.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));
  const errSpy = console.error;
  console.error = () => {};
  try {
    // A Railway Volume: RAILWAY_VOLUME_MOUNT_PATH is set automatically -> <mount>/uploads, persistent
    delete process.env.STORAGE_ROOT;
    process.env.NODE_ENV = 'production';
    process.env.RAILWAY_VOLUME_MOUNT_PATH = path.join(os.tmpdir(), 'railway-vol-test');
    let info = describeStorage();
    assert.equal(info.configured, true);
    assert.equal(info.persistent, true);
    assert.equal(info.source, 'RAILWAY_VOLUME_MOUNT_PATH');
    assert.equal(info.root, path.resolve(os.tmpdir(), 'railway-vol-test', 'uploads'));

    // An explicit STORAGE_ROOT wins over the volume variable
    process.env.STORAGE_ROOT = path.join(os.tmpdir(), 'explicit-root');
    assert.equal(describeStorage().source, 'STORAGE_ROOT');
    delete process.env.STORAGE_ROOT;

    // Production with NO volume: refuses instead of using the ephemeral disk
    delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
    assert.equal(describeStorage().configured, false);
    assert.throws(() => getStorage(), (e) => e.statusCode === 503 && e.code === 'STORAGE_UNAVAILABLE');
    const a = await makeUser('nostorage');
    const res = await uploadTxt(a);
    assert.equal(res.status, 503);
    assert.equal(res.data.code, 'STORAGE_UNAVAILABLE');
    assert.match(res.data.message, /File storage is temporarily unavailable/, 'message is shown as-is in production');
    assert.equal(await prisma.learningMaterial.count({ where: { userId: a.user.id } }), 0);
    assert.equal((await request(base, 'GET', '/health')).data.storage, 'not-configured');

    // Explicit, non-recommended opt-out is reported as NOT persistent
    process.env.STORAGE_ALLOW_EPHEMERAL = 'true';
    info = describeStorage();
    assert.equal(info.configured, true);
    assert.equal(info.persistent, false);

    // Development default is not persistent either
    delete process.env.STORAGE_ALLOW_EPHEMERAL;
    process.env.NODE_ENV = 'development';
    assert.equal(describeStorage().persistent, false);

    // Unknown provider
    process.env.NODE_ENV = 'test';
    process.env.STORAGE_PROVIDER = 's3';
    assert.throws(() => getStorage(), (e) => e.code === 'STORAGE_UNAVAILABLE');
  } finally {
    console.error = errSpy;
    restore();
  }
});

// ======================================================================= maintenance scripts

function runScript(script, args = [], env = {}) {
  try {
    const stdout = execFileSync('node', [path.join('scripts', script), ...args], { cwd: SERVER_DIR, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status, stdout: String(err.stdout || '') };
  }
}

test('storage:check verifies the location with a write/read/delete probe, and exits 2 when nothing is configured in production', () => {
  const ok = runScript('storageCheck.js');
  assert.equal(ok.code, 0);
  assert.match(ok.stdout, /configured : true/);
  assert.match(ok.stdout, /write\/read\/delete probe: OK/);
  const none = runScript('storageCheck.js', [], { NODE_ENV: 'production', STORAGE_ROOT: '', RAILWAY_VOLUME_MOUNT_PATH: '', STORAGE_ALLOW_EPHEMERAL: '' });
  assert.equal(none.code, 2);
  assert.match(none.stdout, /No persistent location configured/);
});

test('storage:cleanup finds orphaned files (dry run by default), deletes them only with --apply, and keeps referenced files', async () => {
  const a = await makeUser('cleanup');
  const kept = (await uploadTxt(a)).data.material;
  const keptKey = (await rowOf(kept.id)).storageKey;
  const orphanKey = buildKey(a.user.id, 'TXT');
  await getStorage().put(orphanKey, Buffer.from('orphan data'));

  const dry = runScript('storageCleanup.js', ['--min-age-hours', '0']);
  assert.equal(dry.code, 0);
  assert.match(dry.stdout, /Dry run - nothing deleted/);
  assert.ok(fs.existsSync(filePathOf(orphanKey)), 'dry run deletes nothing');

  const young = runScript('storageCleanup.js', ['--apply']); // default 24h minimum age protects fresh files
  assert.equal(young.code, 0);
  assert.ok(fs.existsSync(filePathOf(orphanKey)), 'a fresh file is never treated as abandoned');

  const applied = runScript('storageCleanup.js', ['--apply', '--min-age-hours', '0']);
  assert.equal(applied.code, 0);
  assert.ok(!fs.existsSync(filePathOf(orphanKey)), 'the orphan was deleted');
  assert.ok(fs.existsSync(filePathOf(keptKey)), 'the referenced file was kept');
  assert.equal((await rawGet(a.token, `/materials/${kept.id}/file`)).status, 200);
});
