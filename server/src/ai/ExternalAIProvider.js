const AIProvider = require('./AIProvider');

/**
 * Calls an OpenAI-chat-completions-compatible endpoint (works with OpenAI,
 * Azure OpenAI, OpenRouter, Groq, Together, etc. — anything speaking the
 * same /chat/completions JSON shape). Configured entirely via env vars so no
 * vendor SDK is hard-wired into the app:
 *
 *   EXTERNAL_AI_BASE_URL  e.g. https://api.openai.com/v1
 *   EXTERNAL_AI_API_KEY   never sent to the frontend — server-side only
 *   EXTERNAL_AI_MODEL     e.g. gpt-4o-mini
 *
 * Never imported directly by controllers — always obtained through
 * ai/index.js, which falls back to DemoAIProvider if this throws or is
 * unconfigured.
 */
class ExternalAIProvider extends AIProvider {
  constructor() {
    super();
    this.baseUrl = process.env.EXTERNAL_AI_BASE_URL;
    this.apiKey = process.env.EXTERNAL_AI_API_KEY;
    this.model = process.env.EXTERNAL_AI_MODEL || 'gpt-4o-mini';

    if (!this.baseUrl || !this.apiKey) {
      throw new Error('ExternalAIProvider is not configured (EXTERNAL_AI_BASE_URL / EXTERNAL_AI_API_KEY missing).');
    }
  }

  name() {
    return 'external';
  }

  async _chatJSON(systemPrompt, userPrompt) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`External AI provider request failed (${response.status}): ${errText.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('External AI provider returned no content.');
    }

    try {
      return JSON.parse(content);
    } catch (err) {
      throw new Error('External AI provider returned invalid JSON.');
    }
  }

  async analyzeDocument(text) {
    const truncated = text.slice(0, 12000);
    const systemPrompt =
      'You are a document analysis engine for a statistical-capacity-building learning platform. ' +
      'You must ground every field STRICTLY in the provided text. Never invent facts not present in the text. ' +
      'Respond with strict JSON only, matching this shape: { "summary": string, "topics": string[], ' +
      '"concepts": string[], "competencies": string[], "difficulty": "EASY"|"MEDIUM"|"HARD", ' +
      '"learningObjectives": string[], "keyTerms": string[], "relevantSections": string[], ' +
      '"competencyEvidence": [{ "competency": string, "evidence": string (a verbatim sentence from the source text), ' +
      '"relevance": "HIGH"|"MEDIUM"|"LOW" }] }. Every "evidence" string MUST be copied verbatim from the source text.';

    const result = await this._chatJSON(systemPrompt, `Analyze this document:\n\n${truncated}`);
    return {
      summary: result.summary || '',
      topics: result.topics || [],
      concepts: result.concepts || [],
      competencies: result.competencies || [],
      difficulty: result.difficulty || 'MEDIUM',
      learningObjectives: result.learningObjectives || [],
      keyTerms: result.keyTerms || [],
      relevantSections: result.relevantSections || [],
      competencyEvidence: Array.isArray(result.competencyEvidence) ? result.competencyEvidence : [],
    };
  }

  async generateMCQs(text, options = {}) {
    const truncated = text.slice(0, 12000);
    const count = Math.min(Math.max(Number(options.count) || 5, 1), 20);
    const difficulty = options.difficulty || 'MIXED';

    const systemPrompt =
      'You are an MCQ generation engine for a statistical-capacity-building learning platform. ' +
      'Generate multiple-choice questions STRICTLY grounded in the provided source text — never invent facts. ' +
      'Each question must have exactly one correct answer, plausible distractors, and an explanation citing the source. ' +
      'Respond with strict JSON only: { "questions": [ { "question": string, "options": string[4], ' +
      '"correctAnswer": number (0-3 index), "explanation": string, "topic": string, "competency": string, ' +
      '"difficulty": "EASY"|"MEDIUM"|"HARD", "sourceReference": string } ] }. No duplicate questions.';

    const userPrompt =
      `Generate exactly ${count} questions at difficulty "${difficulty}" from this source text:\n\n${truncated}`;

    const result = await this._chatJSON(systemPrompt, userPrompt);
    const questions = Array.isArray(result.questions) ? result.questions : [];

    return questions
      .filter(
        (q) =>
          q.question &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          Number.isInteger(q.correctAnswer) &&
          q.correctAnswer >= 0 &&
          q.correctAnswer <= 3
      )
      .slice(0, count);
  }
}

module.exports = ExternalAIProvider;
