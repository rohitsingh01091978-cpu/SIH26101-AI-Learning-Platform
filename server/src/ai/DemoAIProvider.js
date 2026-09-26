const AIProvider = require('./AIProvider');
const {
  splitSentences,
  topKeywords,
  extractProperPhrases,
  extractNumbers,
  extractiveSummary,
  estimateDifficulty,
  tokenize,
} = require('./textAnalysis');
const { detectCompetencies, detectCompetencyForSentence, detectCompetenciesWithEvidence } = require('./competencyKeywords');
const { pickFallbackQuestions } = require('./demoQuestionBank');

/**
 * Zero-dependency, offline "AI" provider. Every output is computed straight
 * from the extracted document text using extractive NLP (keyword frequency,
 * sentence ranking, cloze-style question generation) — no external network
 * call, no invented facts. This is what keeps the hackathon demo working
 * even with no internet access or API key.
 */
class DemoAIProvider extends AIProvider {
  name() {
    return 'demo';
  }

  async analyzeDocument(text) {
    const sentences = splitSentences(text);
    const keywords = topKeywords(text, 12);
    const properPhrases = extractProperPhrases(text, 10);
    const competencies = detectCompetencies(text);
    const competencyEvidence = detectCompetenciesWithEvidence(text, sentences).map(({ competency, evidence, relevance }) => ({
      competency,
      evidence,
      relevance,
    }));
    const difficulty = estimateDifficulty(text);
    const summary = sentences.length
      ? extractiveSummary(text, sentences, 4)
      : text.slice(0, 400);

    const concepts = properPhrases.length >= 4 ? properPhrases : [...properPhrases, ...keywords].slice(0, 10);

    const learningObjectives = concepts
      .slice(0, 5)
      .map((c) => `Understand and apply the concept of "${c}" as presented in the material.`);

    const relevantSections = [...sentences]
      .sort((a, b) => tokenize(b).length - tokenize(a).length)
      .slice(0, 5);

    return {
      summary: summary || 'Document contains insufficient text for a detailed summary.',
      topics: keywords,
      concepts,
      // No fallback here on purpose: if no competency keywords matched, the
      // honest answer is "none confidently detected", not a fabricated guess.
      competencies,
      difficulty,
      learningObjectives: learningObjectives.length
        ? learningObjectives
        : ['Review the uploaded material and identify its key statistical concepts.'],
      keyTerms: keywords,
      relevantSections: relevantSections.length ? relevantSections : sentences.slice(0, 3),
      competencyEvidence,
    };
  }

  async generateMCQs(text, options = {}) {
    const count = Math.min(Math.max(Number(options.count) || 5, 1), 20);
    const difficultyMode = options.difficulty || 'MIXED';
    const sentences = splitSentences(text);
    const globalKeywords = new Set(topKeywords(text, 30));
    const globalPhrases = extractProperPhrases(text, 30);

    const candidates = [];

    for (const sentence of sentences) {
      const numbers = extractNumbers(sentence);
      const words = tokenize(sentence);
      const sentenceKeyword = words.find((w) => globalKeywords.has(w));

      let answer = null;
      let answerType = null;

      if (numbers.length) {
        answer = numbers[0];
        answerType = 'number';
      } else {
        const phraseInSentence = globalPhrases.find((p) => sentence.includes(p));
        if (phraseInSentence) {
          answer = phraseInSentence;
          answerType = 'phrase';
        } else if (sentenceKeyword) {
          answer = sentenceKeyword;
          answerType = 'keyword';
        }
      }

      if (!answer) continue;

      const blanked = sentence.replace(answer, '_____');
      if (blanked === sentence) continue; // safety: replacement must have applied

      candidates.push({ sentence, blanked, answer, answerType });
    }

    const distractorPoolByType = {
      number: [...new Set(sentences.flatMap((s) => extractNumbers(s)))],
      phrase: globalPhrases,
      keyword: [...globalKeywords],
    };

    const usedSentences = new Set();
    const questions = [];

    for (const cand of candidates) {
      if (questions.length >= count) break;
      if (usedSentences.has(cand.sentence)) continue;

      const pool = distractorPoolByType[cand.answerType].filter(
        (v) => v.toLowerCase() !== String(cand.answer).toLowerCase()
      );
      const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
      const distractors = shuffledPool.slice(0, 3);
      if (distractors.length < 3) continue; // not enough plausible distractors, skip

      const options4 = [...distractors, cand.answer].sort(() => Math.random() - 0.5);
      const correctAnswer = options4.findIndex(
        (o) => o.toLowerCase() === String(cand.answer).toLowerCase()
      );

      const competency = detectCompetencyForSentence(cand.sentence) || 'Data Quality';
      const qDifficulty =
        cand.answerType === 'number' ? 'HARD' : cand.answerType === 'phrase' ? 'MEDIUM' : 'EASY';

      if (difficultyMode !== 'MIXED' && qDifficulty !== difficultyMode) {
        continue;
      }

      usedSentences.add(cand.sentence);
      questions.push({
        question: `Fill in the blank based on the material: "${cand.blanked}"`,
        options: options4,
        correctAnswer,
        explanation: `The source material states: "${cand.sentence}"`,
        topic: competency,
        competency,
        difficulty: qDifficulty,
        sourceReference: `Extracted from uploaded document (sentence match: "${cand.sentence.slice(0, 60)}${cand.sentence.length > 60 ? '…' : ''}")`,
      });
    }

    if (questions.length < count) {
      const fallback = pickFallbackQuestions(
        count - questions.length,
        questions.map((q) => q.question)
      );
      questions.push(...fallback);
    }

    return questions.slice(0, count);
  }
}

module.exports = DemoAIProvider;
