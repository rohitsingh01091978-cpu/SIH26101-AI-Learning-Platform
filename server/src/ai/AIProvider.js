/**
 * Base interface every AI provider must implement. The rest of the app talks
 * only to this shape (via ai/index.js) and never imports a concrete provider
 * directly, so swapping DemoAIProvider <-> ExternalAIProvider is a one-line
 * env var change (AI_PROVIDER=demo|external).
 */
class AIProvider {
  /**
   * @param {string} text - extracted document text
   * @returns {Promise<{summary:string, topics:string[], concepts:string[],
   *   competencies:string[], difficulty:'EASY'|'MEDIUM'|'HARD',
   *   learningObjectives:string[], keyTerms:string[], relevantSections:string[]}>}
   */
  async analyzeDocument(text) {
    throw new Error('analyzeDocument() not implemented');
  }

  /**
   * @param {string} text - source document text the questions must be grounded in
   * @param {{count:number, difficulty:'EASY'|'MEDIUM'|'HARD'|'MIXED', topics:string[]}} options
   * @returns {Promise<Array<{question:string, options:string[], correctAnswer:number,
   *   explanation:string, topic:string, competency:string,
   *   difficulty:'EASY'|'MEDIUM'|'HARD', sourceReference:string}>>}
   */
  async generateMCQs(text, options) {
    throw new Error('generateMCQs() not implemented');
  }

  /**
   * Conversational answer for the Karmayogi AI Assistant.
   * @param {string} message - the learner's question
   * @param {object} context - the learner's REAL data (see assistant/learnerContext.js);
   *   the only facts the answer may use
   * @param {Array<{role:'user'|'assistant', text:string}>} history - recent turns, oldest first
   * @returns {Promise<{reply:string, intent?:string}>}
   */
  async answerLearnerQuestion(message, context, history) {
    throw new Error('answerLearnerQuestion() not implemented');
  }

  name() {
    return 'base';
  }
}

module.exports = AIProvider;
