const DemoAIProvider = require('./DemoAIProvider');
const ExternalAIProvider = require('./ExternalAIProvider');

let cachedProvider = null;

/**
 * Single point of truth for "which AI provider is active". Controllers call
 * getAIProvider() and never import DemoAIProvider/ExternalAIProvider
 * directly. AI_PROVIDER=external that fails to construct (missing key) or
 * throws at call time transparently falls back to DemoAIProvider so the
 * demo never breaks mid-presentation.
 */
function getAIProvider() {
  if (cachedProvider) return cachedProvider;

  if (process.env.AI_PROVIDER === 'external') {
    try {
      cachedProvider = new ExternalAIProvider();
      console.log('[ai] Using ExternalAIProvider');
      return cachedProvider;
    } catch (err) {
      console.warn(`[ai] ExternalAIProvider unavailable (${err.message}). Falling back to DemoAIProvider.`);
    }
  }

  cachedProvider = new DemoAIProvider();
  console.log('[ai] Using DemoAIProvider');
  return cachedProvider;
}

/**
 * Wraps a provider call so that even if AI_PROVIDER=external was selected
 * and construction succeeded, a runtime failure (network error, bad
 * response) still degrades gracefully to the demo provider instead of
 * surfacing a 500 to the learner mid-demo.
 */
async function withAIFallback(methodName, ...args) {
  const provider = getAIProvider();
  try {
    return await provider[methodName](...args);
  } catch (err) {
    if (provider.name() === 'external') {
      console.warn(`[ai] External provider call failed (${err.message}). Falling back to DemoAIProvider for this call.`);
      const demo = new DemoAIProvider();
      return demo[methodName](...args);
    }
    throw err;
  }
}

/**
 * Same as withAIFallback, but also reports WHICH provider produced the result, so callers
 * (the assistant) can tell the learner honestly whether an external model or the offline
 * demo engine answered - including when an external call failed and demo took over.
 */
async function withAIFallbackMeta(methodName, ...args) {
  const provider = getAIProvider();
  try {
    return { result: await provider[methodName](...args), provider: provider.name(), fellBack: false };
  } catch (err) {
    if (provider.name() === 'external') {
      console.warn(`[ai] External provider call failed (${err.message}). Falling back to DemoAIProvider for this call.`);
      const demo = new DemoAIProvider();
      return { result: await demo[methodName](...args), provider: 'demo', fellBack: true };
    }
    throw err;
  }
}

module.exports = { getAIProvider, withAIFallback, withAIFallbackMeta };
