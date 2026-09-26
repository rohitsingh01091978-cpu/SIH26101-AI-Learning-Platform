// Validation/normalisation of what a real AI model returns, so malformed output is caught here
// (a clear AIOutputError) instead of reaching the database as a 500.
const { AIOutputError } = require('./errors');

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
const RELEVANCE = ['HIGH', 'MEDIUM', 'LOW'];

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v, maxItems, maxLen) =>
  (Array.isArray(v) ? v : [])
    .map((x) => str(x, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);

function validateAnalysis(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AIOutputError('Analysis was not an object.');
  const summary = str(raw.summary, 3000);
  if (!summary) throw new AIOutputError('Analysis had no summary.');

  const evidence = (Array.isArray(raw.competencyEvidence) ? raw.competencyEvidence : [])
    .map((e) => ({
      competency: str(e && e.competency, 100),
      evidence: str(e && e.evidence, 600),
      relevance: RELEVANCE.includes(e && e.relevance) ? e.relevance : 'MEDIUM',
    }))
    .filter((e) => e.competency && e.evidence)
    .slice(0, 20);

  return {
    summary,
    topics: strList(raw.topics, 20, 100),
    concepts: strList(raw.concepts, 30, 100),
    competencies: strList(raw.competencies, 20, 100),
    difficulty: DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : 'MEDIUM',
    learningObjectives: strList(raw.learningObjectives, 10, 300),
    keyTerms: strList(raw.keyTerms, 30, 100),
    relevantSections: strList(raw.relevantSections, 10, 500),
    competencyEvidence: evidence,
  };
}

function validateMcqs(raw, count) {
  const list = raw && Array.isArray(raw.questions) ? raw.questions : [];
  const seen = new Set();
  const valid = [];

  for (const q of list) {
    const question = str(q && q.question, 500);
    const options = Array.isArray(q && q.options) ? q.options.map((o) => str(o, 200)) : [];
    const distinct = new Set(options.map((o) => o.toLowerCase()));
    const ok =
      question.length >= 10 &&
      options.length === 4 &&
      options.every(Boolean) &&
      distinct.size === 4 &&
      Number.isInteger(q.correctAnswer) &&
      q.correctAnswer >= 0 &&
      q.correctAnswer <= 3;
    if (!ok || seen.has(question.toLowerCase())) continue;
    seen.add(question.toLowerCase());
    valid.push({
      question,
      options,
      correctAnswer: q.correctAnswer,
      explanation: str(q.explanation, 800),
      topic: str(q.topic, 100),
      competency: str(q.competency, 100),
      difficulty: DIFFICULTIES.includes(q.difficulty) ? q.difficulty : 'MEDIUM',
      sourceReference: str(q.sourceReference, 300),
    });
    if (valid.length >= count) break;
  }

  if (valid.length === 0) throw new AIOutputError('No valid questions were returned.');
  return valid;
}

module.exports = { validateAnalysis, validateMcqs };
