const AIProvider = require('./AIProvider');
const DemoAIProvider = require('./DemoAIProvider');
const ExternalAIProvider = require('./ExternalAIProvider');
const { AIUnavailableError } = require('./errors');

/**
 * Single point of truth for "which AI provider is active". Controllers never import a concrete
 * provider directly.
 *
 *   AI_PROVIDER unset / "demo"  -> DemoAIProvider (development, or the current deployment until keys exist)
 *   AI_PROVIDER=external        -> ExternalAIProvider (OpenAI-compatible; AI_API_KEY / AI_BASE_URL / AI_MODEL)
 *
 * Fallback policy when AI_PROVIDER=external:
 *   - CORE features (document analysis, MCQ generation, competency analysis): NEVER fall back to the
 *     demo engine. If the real provider is unavailable or misconfigured they fail with a clear
 *     "service unavailable" error (runCoreAI). Demo output is never presented as real AI output.
 *   - The learner-facing ASSISTANT may fall back to the offline engine, but the response is labelled
 *     (provider "demo", fellBack true) and the UI says so (withAIFallbackMeta).
 */

// A provider that is selected but cannot work (e.g. AI_PROVIDER=external with no key).
class UnavailableProvider extends AIProvider {
  name() {
    return 'unavailable';
  }
}
for (const method of ['analyzeDocument', 'generateMCQs', 'answerLearnerQuestion']) {
  UnavailableProvider.prototype[method] = async function unavailable() {
    throw new AIUnavailableError('AI provider is not configured.');
  };
}

let cachedProvider = null;

function getAIProvider() {
  if (cachedProvider) return cachedProvider;

  if (process.env.AI_PROVIDER === 'external') {
    try {
      cachedProvider = new ExternalAIProvider();
      console.log('[ai] Using ExternalAIProvider');
    } catch (err) {
      // Deliberately NOT the demo provider: silently substituting canned output would misrepresent real AI.
      console.error(`[ai] AI_PROVIDER=external but the provider cannot start (${err.message}). Core AI features will be unavailable.`);
      cachedProvider = new UnavailableProvider();
    }
    return cachedProvider;
  }

  cachedProvider = new DemoAIProvider();
  console.log('[ai] Using DemoAIProvider');
  return cachedProvider;
}

/**
 * Core AI processing (analysis, MCQs, ...). Runs on the configured provider only.
 * Returns { result, provider }. Any failure of a non-demo provider becomes AIUnavailableError.
 */
async function runCoreAI(methodName, ...args) {
  const provider = getAIProvider();
  try {
    return { result: await provider[methodName](...args), provider: provider.name() };
  } catch (err) {
    if (provider.name() === 'demo') throw err; // a genuine bug in the offline engine, not an outage
    if (err instanceof AIUnavailableError) throw err;
    console.warn(`[ai] ${methodName} failed on the ${provider.name()} provider (${err.name || 'error'}).`);
    throw new AIUnavailableError('AI provider request failed.', { cause: err });
  }
}

/**
 * ASSISTANT only. Like runCoreAI, but if a real/misconfigured provider fails, the offline engine
 * answers and the result says so: { result, provider: 'demo', fellBack: true }.
 */
async function withAIFallbackMeta(methodName, ...args) {
  const provider = getAIProvider();
  try {
    return { result: await provider[methodName](...args), provider: provider.name(), fellBack: false };
  } catch (err) {
    if (provider.name() !== 'demo') {
      console.warn(`[ai] ${methodName} failed on the ${provider.name()} provider (${err.name || 'error'}); using the labelled offline fallback.`);
      const demo = new DemoAIProvider();
      return { result: await demo[methodName](...args), provider: 'demo', fellBack: true };
    }
    throw err;
  }
}

module.exports = { getAIProvider, runCoreAI, withAIFallbackMeta };
