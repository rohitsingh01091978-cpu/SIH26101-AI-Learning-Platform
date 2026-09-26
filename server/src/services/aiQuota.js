const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const { intEnv } = require('../ai/config');
const { runWithUsageContext } = require('../ai/usage');

/**
 * Per-user DAILY quotas for AI-backed actions, enforced on the server (the frontend can't bypass it).
 *
 *   AI_DAILY_ANALYSES_PER_USER            default 20   document analyses
 *   AI_DAILY_MCQ_GENERATIONS_PER_USER     default 20   MCQ generations
 *   AI_DAILY_ASSISTANT_MESSAGES_PER_USER  default 100  assistant messages
 *   AI_QUOTAS_ENABLED=false               switches enforcement off (development)
 *
 * The window is a rolling 24 hours. Each action first RESERVES a slot (a PENDING ai_usage row) under a
 * per-user/feature advisory lock, so simultaneous requests can never exceed the limit. When the action
 * finishes the row becomes SUCCESS. Attempts that were not the learner's doing are refunded (not counted):
 * provider outages (UNAVAILABLE), offline assistant fallbacks (FALLBACK) and our own errors (ERROR).
 * A provider answer that was unusable (FAILED) still counts, because the provider was billed for it.
 * Only counts and timings are stored - never prompts, document text or answers.
 */

const FEATURES = {
  ANALYZE_DOCUMENT: { key: 'ANALYZE_DOCUMENT', env: 'AI_DAILY_ANALYSES_PER_USER', fallback: 20, label: 'document analyses' },
  GENERATE_MCQS: { key: 'GENERATE_MCQS', env: 'AI_DAILY_MCQ_GENERATIONS_PER_USER', fallback: 20, label: 'MCQ generations' },
  ASSISTANT_CHAT: { key: 'ASSISTANT_CHAT', env: 'AI_DAILY_ASSISTANT_MESSAGES_PER_USER', fallback: 100, label: 'AI Assistant messages' },
};

const WINDOW_MS = 24 * 60 * 60 * 1000;
const PENDING_TTL_MS = 15 * 60 * 1000; // a reservation older than this is a crashed request, not real usage
const COUNTED = ['SUCCESS', 'FAILED'];

const quotasEnabled = () => (process.env.AI_QUOTAS_ENABLED || '').trim().toLowerCase() !== 'false';
const limitFor = (feature) => intEnv(feature.env, feature.fallback, { min: 1, max: 1000000 });

// Rows that currently count against the learner's quota.
const countedWhere = (userId, featureKey, now = Date.now()) => ({
  userId,
  feature: featureKey,
  createdAt: { gte: new Date(now - WINDOW_MS) },
  OR: [{ status: { in: COUNTED } }, { status: 'PENDING', createdAt: { gte: new Date(now - PENDING_TTL_MS) } }],
});

class AiQuotaError extends ApiError {
  constructor(feature, limit, resetsAt) {
    const seconds = Math.max(1, Math.ceil((resetsAt.getTime() - Date.now()) / 1000));
    const hours = Math.ceil(seconds / 3600);
    const wait = seconds < 3600 ? `about ${Math.max(1, Math.ceil(seconds / 60))} minute${seconds < 120 ? '' : 's'}` : `about ${hours} hour${hours === 1 ? '' : 's'}`;
    super(429, `You've reached today's limit of ${limit} ${feature.label}. You can use this again in ${wait}.`, null, 'AI_QUOTA_EXCEEDED');
    this.retryAfterSeconds = seconds;
    this.extra = { limit, feature: feature.key, resetsAt: resetsAt.toISOString() };
  }
}

const noopHandle = () => ({
  id: null,
  run: (fn) => fn(),
  succeed: async () => {},
  fail: async () => {},
  refund: async () => {},
});

/**
 * Reserves one unit of `feature` for `userId`, or throws AiQuotaError (HTTP 429) if the daily limit is used up.
 * Returns a handle: run(fn) executes the AI work and captures token counts; then call exactly one of
 * succeed({provider}), fail(err) or refund('FALLBACK').
 */
async function reserveAiQuota(userId, feature) {
  if (!quotasEnabled()) return noopHandle();
  const limit = limitFor(feature);
  const started = Date.now();

  const row = await prisma.$transaction(async (tx) => {
    // Serialises concurrent requests from the same learner for the same feature.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${feature.key}`}))`;
    const where = countedWhere(userId, feature.key);
    const used = await tx.aiUsage.count({ where });
    if (used >= limit) {
      const oldest = await tx.aiUsage.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
      throw new AiQuotaError(feature, limit, new Date(oldest.createdAt.getTime() + WINDOW_MS));
    }
    return tx.aiUsage.create({ data: { userId, feature: feature.key, status: 'PENDING' }, select: { id: true } });
  });

  let usage = null;
  let settled = false;
  const settle = async (data) => {
    if (settled) return;
    settled = true;
    try {
      await prisma.aiUsage.update({
        where: { id: row.id },
        data: {
          ...data,
          durationMs: Date.now() - started,
          completedAt: new Date(),
          ...(usage && usage.model ? { model: usage.model } : {}),
          ...(usage && usage.sawTokens ? { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens } : {}),
        },
      });
    } catch (err) {
      // Bookkeeping must never break the learner's request. (A row left PENDING expires after 15 minutes.)
      console.warn('[ai-quota] could not finalise a usage record.');
    }
  };

  return {
    id: row.id,
    async run(fn) {
      const out = await runWithUsageContext(fn);
      usage = out.usage;
      return out.value;
    },
    succeed: ({ provider } = {}) => settle({ status: 'SUCCESS', provider: provider || null }),
    refund: (status = 'ERROR', provider = null) => settle({ status, provider }),
    // The action failed: an unusable provider answer still counts; outages and our own errors do not.
    fail(err) {
      const outputProblem = err && err.name === 'AIUnavailableError' && err.reason === 'AIOutputError';
      const outage = err && err.name === 'AIUnavailableError' && !outputProblem;
      return settle({ status: outputProblem ? 'FAILED' : outage ? 'UNAVAILABLE' : 'ERROR' });
    },
  };
}

/** Current limits and usage for the "how much AI have I used today" view. */
async function getUsageSummary(userId) {
  const summary = {};
  for (const feature of Object.values(FEATURES)) {
    const limit = limitFor(feature);
    const where = countedWhere(userId, feature.key);
    const [used, oldest] = await Promise.all([
      prisma.aiUsage.count({ where }),
      prisma.aiUsage.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);
    summary[feature.key] = {
      label: feature.label,
      limit,
      used,
      remaining: Math.max(0, limit - used),
      // When the oldest counted use ages out of the 24h window (frees one slot).
      nextSlotAt: oldest ? new Date(oldest.createdAt.getTime() + WINDOW_MS).toISOString() : null,
    };
  }
  return { enabled: quotasEnabled(), windowHours: 24, features: summary };
}

module.exports = { FEATURES, reserveAiQuota, getUsageSummary, AiQuotaError };
