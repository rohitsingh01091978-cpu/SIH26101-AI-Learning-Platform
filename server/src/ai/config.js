// AI provider settings, read from the server environment (Railway variables) at call time.
// Preferred names: AI_API_KEY, AI_BASE_URL, AI_MODEL. The original EXTERNAL_AI_* names keep working.
// Nothing here is ever sent to the browser.

const pick = (...names) => {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return '';
};

// Non-negative integer from env, with a default when unset/invalid.
const intEnv = (name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

function aiConfig() {
  return {
    baseUrl: pick('AI_BASE_URL', 'EXTERNAL_AI_BASE_URL'),
    apiKey: pick('AI_API_KEY', 'EXTERNAL_AI_API_KEY'),
    model: pick('AI_MODEL', 'EXTERNAL_AI_MODEL') || 'gpt-4o-mini',
    timeoutMs: intEnv('AI_TIMEOUT_MS', 30000, { min: 1000, max: 300000 }),
    maxRetries: intEnv('AI_MAX_RETRIES', 2, { min: 0, max: 5 }),
    maxOutputTokens: intEnv('AI_MAX_OUTPUT_TOKENS', 2500, { min: 100, max: 32000 }),
    maxInputChars: intEnv('AI_MAX_INPUT_CHARS', 12000, { min: 500, max: 200000 }),
    retryBaseMs: intEnv('AI_RETRY_BASE_MS', 400, { min: 0, max: 10000 }),
  };
}

module.exports = { aiConfig, intEnv };
