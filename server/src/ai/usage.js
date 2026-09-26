const { AsyncLocalStorage } = require('node:async_hooks');

// One structured log line per AI call - metadata only. Prompts, document text, answers and keys
// are never logged. When the call runs inside a quota reservation (services/aiQuota.js), the token
// counts and model are also accumulated so they can be stored on the ai_usage row.

const usageContext = new AsyncLocalStorage();

// Runs fn with a fresh accumulator; returns { value, usage }.
async function runWithUsageContext(fn) {
  const store = { promptTokens: 0, completionTokens: 0, model: null, sawTokens: false };
  const value = await usageContext.run(store, fn);
  return { value, usage: store };
}

function recordAIUsage(evt) {
  const { feature, model, ms, attempts, ok, status, promptTokens, completionTokens } = evt;
  const store = usageContext.getStore();
  if (store) {
    store.model = model || store.model;
    if (ok && Number.isFinite(promptTokens)) {
      store.promptTokens += promptTokens;
      store.sawTokens = true;
    }
    if (ok && Number.isFinite(completionTokens)) {
      store.completionTokens += completionTokens;
      store.sawTokens = true;
    }
  }
  console.log(
    JSON.stringify({
      evt: 'ai_call',
      feature,
      model,
      ok,
      status: status ?? null,
      attempts,
      ms,
      promptTokens: promptTokens ?? null,
      completionTokens: completionTokens ?? null,
    })
  );
}

module.exports = { recordAIUsage, runWithUsageContext };
