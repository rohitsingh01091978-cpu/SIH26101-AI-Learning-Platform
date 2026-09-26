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

  name() {
    return 'base';
  }
}

module.exports = AIProvider;
