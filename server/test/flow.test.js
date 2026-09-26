// End-to-end demo flow through the API as the seeded demo learner:
// login -> profile -> competencies -> assessment -> PDF upload -> AI analysis ->
// MCQ generation -> adaptive quiz -> skill gap -> learning path -> iGOT -> progress.
//
// NOTE: this WRITES data (assessment attempt, material, quiz attempt, progress
// row) to the local database, so it is a separate script: `npm run test:flow`.
// The flow runs as the same seeded demo learner every time; keep repeated local runs from
// exhausting the (real, enforced) daily AI quotas. Quotas themselves are tested in quota*.test.js.
process.env.AI_DAILY_ANALYSES_PER_USER = '100000';
process.env.AI_DAILY_MCQ_GENERATIONS_PER_USER = '100000';
process.env.AI_DAILY_ASSISTANT_MESSAGES_PER_USER = '100000';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { LEARNER, startServer, request, stop } = require('./helpers');

let server;
let base;
let token;

// Builds a small but valid one-page PDF containing the given lines of text.
// It is padded with comment lines to >4KB: the bundled pdf-parse/pdf.js 1.10 intermittently
// rejects very small PDFs ("bad XRef entry") in this environment.
function buildPdf(lines) {
  const esc = (s) => s.replace(/([\\()])/g, '\\$1');
  const content = `BT /F1 11 Tf 40 780 Td 14 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = `%PDF-1.4\n${`%${'x'.repeat(78)}\n`.repeat(60)}`;
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

const PDF_LINES = [
  'Data governance and data quality in public administration.',
  'Python programming is used for data analysis and reporting of survey results.',
  'Policy analysis requires stakeholder consultation, evidence review and monitoring and evaluation.',
  'Data visualization and dashboards help officers communicate findings to decision makers.',
  'Cyber security awareness, data privacy and digital literacy are essential competencies.',
  'Project management, budgeting and public financial management support programme delivery.',
];

before(async () => {
  ({ server, base } = await startServer());
});
after(() => stop(server));

test('demo flow works end to end with the hardened auth', async () => {
  const login = await request(base, 'POST', '/auth/login', { body: LEARNER });
  assert.equal(login.status, 200);
  token = login.data.token;

  assert.equal((await request(base, 'GET', '/auth/me', { token })).status, 200);
  assert.equal((await request(base, 'GET', '/profile', { token })).status, 200);
  const comps = await request(base, 'GET', '/competencies/me', { token });
  assert.equal(comps.status, 200);

  // Assessment
  const start = await request(base, 'POST', '/assessment/start', { token });
  assert.equal(start.status, 201);
  const responses = start.data.questions.map((q) => ({ questionId: q.id, selectedAnswer: 0, responseTimeMs: 1200 }));
  const submit = await request(base, 'POST', '/assessment/submit', { token, body: { attemptId: start.data.attemptId, responses } });
  assert.equal(submit.status, 200);
  assert.equal(submit.data.totalQuestions, start.data.questions.length);

  // PDF upload
  const form = new FormData();
  form.append('file', new Blob([buildPdf(PDF_LINES)], { type: 'application/pdf' }), 'security-flow-test.pdf');
  const upload = await request(base, 'POST', '/materials/upload', { token, raw: form });
  assert.equal(upload.status, 201, JSON.stringify(upload.data));
  const materialId = upload.data.material.id;
  assert.equal(upload.data.material.status, 'UPLOADED');

  // AI analysis
  const analyze = await request(base, 'POST', `/materials/${materialId}/analyze`, { token });
  assert.equal(analyze.status, 200, JSON.stringify(analyze.data));
  assert.ok(analyze.data.analysis);

  // MCQ generation
  const gen = await request(base, 'POST', '/quizzes/generate', { token, body: { materialId, count: 5, difficulty: 'MIXED' } });
  assert.equal(gen.status, 201, JSON.stringify(gen.data));
  const quizId = gen.data.quiz.id;
  assert.ok(gen.data.questions.length > 0);

  // Adaptive quiz
  const qs = await request(base, 'POST', `/quizzes/${quizId}/start`, { token });
  assert.equal(qs.status, 201);
  let { question } = qs.data;
  let done = false;
  let guard = 0;
  while (!done && guard < 25) {
    guard += 1;
    const ans = await request(base, 'POST', `/quizzes/${quizId}/answer`, {
      token,
      body: { attemptId: qs.data.attemptId, questionId: question.id, selectedAnswer: 0, responseTimeMs: 900 },
    });
    assert.equal(ans.status, 200, JSON.stringify(ans.data));
    done = ans.data.done;
    question = ans.data.question;
  }
  assert.ok(done, 'quiz should complete');
  const finish = await request(base, 'POST', `/quizzes/${quizId}/submit`, { token, body: { attemptId: qs.data.attemptId } });
  assert.equal(finish.status, 200);

  // Skill gap -> learning path -> iGOT -> progress
  const gaps = await request(base, 'GET', '/skill-gaps', { token });
  assert.equal(gaps.status, 200);
  const path = await request(base, 'GET', '/learning-path', { token });
  assert.equal(path.status, 200);
  const courses = await request(base, 'GET', '/igot/courses', { token });
  assert.equal(courses.status, 200);
  assert.ok(courses.data.courses.length > 0);
  const search = await request(base, 'GET', '/igot/search?q=data', { token });
  assert.equal(search.status, 200);
  const prog = await request(base, 'GET', '/progress', { token });
  assert.equal(prog.status, 200);
  const perf = await request(base, 'GET', '/performance', { token });
  assert.equal(perf.status, 200);

  // Login again (the "logout -> login again" leg on the API side)
  const again = await request(base, 'POST', '/auth/login', { body: LEARNER });
  assert.equal(again.status, 200);
});
