/**
 * Maps free-text keywords found inside uploaded material to the fixed
 * competency taxonomy (see prisma/seed.js COMPETENCIES list). Used by
 * DemoAIProvider to ground "competencies identified" in actual document
 * content instead of guessing.
 */
const COMPETENCY_KEYWORDS = {
  'Survey Design': ['survey', 'questionnaire', 'field survey', 'enumerat'],
  Sampling: ['sample', 'sampling', 'stratif', 'random selection', 'population frame'],
  'National Accounts': ['national accounts', 'gdp', 'gva', 'national income'],
  'Price Statistics': ['price index', 'inflation', 'cpi', 'wpi', 'price statistics'],
  'Labour Statistics': ['labour', 'labor', 'employment', 'unemployment', 'workforce'],
  'Agricultural Statistics': ['agricultur', 'crop', 'farm', 'yield'],
  'Industrial Statistics': ['industrial production', 'iip', 'manufactur'],
  'SDG Indicators': ['sdg', 'sustainable development goal', 'indicator framework'],
  'Metadata Standards': ['metadata', 'sdmx', 'data standard'],
  'Data Quality': ['data quality', 'accuracy', 'validation', 'data cleaning', 'consistency check'],
  Python: ['python', 'pandas', 'numpy', 'jupyter'],
  R: [' r programming', 'rstudio', 'tidyverse'],
  SQL: ['sql', 'query', 'database table', 'relational database'],
  Stata: ['stata'],
  SPSS: ['spss'],
  SAS: ['sas programming', ' sas '],
  GIS: ['gis', 'geospatial', 'geographic information system'],
  'Data Visualization': ['visualization', 'dashboard', 'chart', 'graph representation'],
  'AI/ML': ['machine learning', 'artificial intelligence', 'neural network', 'ai model', 'deep learning'],
  Cloud: ['cloud computing', 'aws', 'azure', 'gcp'],
  APIs: ['api', 'rest endpoint', 'web service'],
  'Open Data': ['open data', 'open government data', 'data portal'],
  Cybersecurity: ['cybersecurity', 'cyber security', 'information security', 'firewall'],
  'Data Privacy': ['data privacy', 'personal data', 'gdpr', 'data protection'],
  'Digital Signatures': ['digital signature', 'pki', 'certificate authority'],
  'Government Cloud': ['meghraj', 'government cloud', 'gi cloud'],
  'Digital Public Infrastructure': ['digital public infrastructure', 'dpi', 'aadhaar', 'digilocker'],
  Leadership: ['leadership', 'team lead', 'mentoring'],
  Communication: ['communication skills', 'stakeholder communication', 'report writing'],
  'Project Management': ['project management', 'project plan', 'milestone', 'gantt'],
  Ethics: ['ethics', 'ethical', 'code of conduct', 'confidentiality'],
  'Decision Making': ['decision making', 'evidence-based decision'],
  'Change Management': ['change management', 'organizational change'],
};

function detectCompetencies(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const [competency, keywords] of Object.entries(COMPETENCY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      found.push(competency);
    }
  }
  return found;
}

function detectCompetencyForSentence(sentence) {
  const lower = sentence.toLowerCase();
  for (const [competency, keywords] of Object.entries(COMPETENCY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return competency;
    }
  }
  return null;
}

function extractSnippetAroundKeyword(text, lowerText, keywords) {
  for (const kw of keywords) {
    const idx = lowerText.indexOf(kw);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 60);
    const end = Math.min(text.length, idx + kw.length + 60);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < text.length ? '…' : '';
    return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
  }
  return null;
}

/**
 * For every competency detected in the document, find the strongest
 * supporting sentence (evidence) and a relevance band based on how many
 * distinct keyword hits it has across the whole document. Used to answer
 * "why were these competencies identified?" without inventing anything —
 * every evidence string is a verbatim sentence from the source text.
 */
function detectCompetenciesWithEvidence(text, sentences) {
  const lower = text.toLowerCase();
  const results = [];

  for (const [competency, keywords] of Object.entries(COMPETENCY_KEYWORDS)) {
    const hitCount = keywords.reduce((sum, kw) => sum + (lower.split(kw).length - 1), 0);
    if (hitCount === 0) continue;

    // Prefer a clean sentence match; real PDF extractions often produce
    // run-on or list-like text that the sentence splitter's length/word
    // filters drop entirely, so fall back to a verbatim snippet lifted
    // straight from the raw text around the first keyword hit — still
    // grounded in the source, just not sentence-bounded.
    const evidenceSentence =
      sentences.find((s) => keywords.some((kw) => s.toLowerCase().includes(kw))) ||
      extractSnippetAroundKeyword(text, lower, keywords);

    const relevance = hitCount >= 4 ? 'HIGH' : hitCount >= 2 ? 'MEDIUM' : 'LOW';

    results.push({
      competency,
      evidence: evidenceSentence,
      relevance,
      hitCount,
    });
  }

  return results.sort((a, b) => b.hitCount - a.hitCount);
}

module.exports = {
  COMPETENCY_KEYWORDS,
  detectCompetencies,
  detectCompetencyForSentence,
  detectCompetenciesWithEvidence,
};
