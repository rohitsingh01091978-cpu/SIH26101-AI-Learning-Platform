/**
 * Lightweight, dependency-free extractive NLP used by DemoAIProvider. No
 * external API calls — everything here is computed straight from the
 * document text so the "AI" output stays honestly grounded in the source.
 */

const STOPWORDS = new Set(
  ('a an the and or but if while is are was were be been being have has had do does did ' +
    'will would shall should may might must can could of to in on at by for with about ' +
    'against between into through during before after above below from up down out off ' +
    'over under again further then once here there when where why how all any both each ' +
    'few more most other some such no nor not only own same so than too very s t just don ' +
    'now this that these those i you he she it we they them his her its our their as it\'s ' +
    'which who whom also within per etc e g i.e').split(/\s+/)
);

function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 6 && s.length <= 400);
}

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z][a-z0-9\-]{2,}/g) || []).filter((w) => !STOPWORDS.has(w));
}

function wordFrequencies(text) {
  const freq = {};
  for (const word of tokenize(text)) {
    freq[word] = (freq[word] || 0) + 1;
  }
  return freq;
}

function topKeywords(text, n = 10) {
  const freq = wordFrequencies(text);
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word]) => word);
}

/** Proper-noun-ish phrases: consecutive capitalized words, e.g. "National Accounts". */
function extractProperPhrases(text, n = 12) {
  const matches = text.match(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})\b/g) || [];
  const freq = {};
  for (const m of matches) {
    const trimmed = m.trim();
    if (trimmed.split(/\s+/).length === 1 && trimmed.length < 4) continue; // skip short acronyms noise like "A"
    freq[trimmed] = (freq[trimmed] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([phrase]) => phrase);
}

function extractNumbers(sentence) {
  return sentence.match(/\b\d[\d,.]*%?\b/g) || [];
}

/** Extractive summary: rank sentences by sum of top-keyword frequency, keep original order. */
function extractiveSummary(text, sentences, maxSentences = 4) {
  const freq = wordFrequencies(text);
  const scored = sentences.map((s, idx) => {
    const score = tokenize(s).reduce((sum, w) => sum + (freq[w] || 0), 0) / Math.sqrt(s.length);
    return { s, idx, score };
  });
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, maxSentences);
  top.sort((a, b) => a.idx - b.idx);
  return top.map((t) => t.s).join(' ');
}

function estimateDifficulty(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const longWordRatio = words.filter((w) => w.length >= 8).length / Math.max(1, words.length);
  const avgSentenceLen =
    words.length / Math.max(1, splitSentences(text).length || 1);
  const score = longWordRatio * 60 + Math.min(avgSentenceLen, 30) * 1.2;
  if (score < 20) return 'EASY';
  if (score < 40) return 'MEDIUM';
  return 'HARD';
}

module.exports = {
  STOPWORDS,
  splitSentences,
  tokenize,
  wordFrequencies,
  topKeywords,
  extractProperPhrases,
  extractNumbers,
  extractiveSummary,
  estimateDifficulty,
};
