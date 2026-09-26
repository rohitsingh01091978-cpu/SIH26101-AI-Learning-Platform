// Errors raised by the AI layer. Messages are deliberately generic and never contain provider
// response bodies, prompts, URLs or keys - they may end up in logs and (via the error handler)
// in responses.

class AIProviderError extends Error {
  constructor(message, { status = null, retryable = false } = {}) {
    super(message);
    this.name = 'AIProviderError';
    this.status = status;
    this.retryable = retryable;
  }
}

// The provider answered, but not with usable content (bad JSON, wrong shape, nothing valid).
class AIOutputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AIOutputError';
  }
}

// What callers (and the error handler) see when the real AI service can't serve a core request.
class AIUnavailableError extends Error {
  constructor(message = 'AI service unavailable.', { cause = null } = {}) {
    super(message);
    this.name = 'AIUnavailableError';
    this.reason = cause && cause.name ? cause.name : null;
  }
}

module.exports = { AIProviderError, AIOutputError, AIUnavailableError };
