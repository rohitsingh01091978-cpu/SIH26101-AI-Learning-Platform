const { body, validationResult } = require('express-validator');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { buildLearnerContext } = require('../assistant/learnerContext');
const { withAIFallbackMeta } = require('../ai');
const { reserveAiQuota, FEATURES } = require('../services/aiQuota');

const MAX_HISTORY = 6;

const chatValidators = [
  body('message')
    .isString().withMessage('Message is required.').bail()
    .trim()
    .notEmpty().withMessage('Message is required.').bail()
    .isLength({ max: 1000 }).withMessage('Message is too long (1000 characters maximum).'),
  body('history').optional().isArray({ max: 20 }).withMessage('Invalid history.'),
];

// Client-supplied history is untrusted: keep only well-formed recent turns, capped in size.
function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string' && h.text.trim())
    .slice(-MAX_HISTORY)
    .map((h) => ({ role: h.role, text: h.text.trim().slice(0, 1500) }));
}

// POST /api/assistant/chat
// The learner is ALWAYS the authenticated user (req.user.id from the verified JWT). Nothing in
// the request body can select whose data is used.
const chat = asyncHandler(async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    throw new ApiError(400, 'Please type a question (up to 1000 characters).');
  }

  const message = req.body.message; // already trimmed by the validator
  const history = cleanHistory(req.body.history);

  // Daily quota (100 messages by default) - clear 429 when used up.
  const usage = await reserveAiQuota(req.user.id, FEATURES.ASSISTANT_CHAT);

  let context;
  try {
    context = await buildLearnerContext(req.user.id);
  } catch (err) {
    await usage.fail(err);
    throw err;
  }

  let outcome;
  try {
    outcome = await usage.run(() => withAIFallbackMeta('answerLearnerQuestion', message, context, history));
  } catch (err) {
    await usage.fail(err);
    // Log the reason server-side only; the learner gets a friendly, generic message.
    console.error('[assistant] answer failed:', err && err.message ? err.message : 'unknown error');
    throw new ApiError(503, 'The assistant is temporarily unavailable. Please try again in a moment.');
  }

  const { result, provider, fellBack } = outcome;
  // An offline fallback answer costs nothing and is not the AI model, so it does not use up the quota.
  if (fellBack) await usage.refund('FALLBACK', provider);
  else await usage.succeed({ provider });
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    success: true,
    reply: result.reply,
    // Honest labelling: "demo" = offline rule-based engine over the learner's own data (no LLM);
    // "external" = an external language model was sent the learner's data.
    provider,
    fellBack,
    courseSource: context.igot.label,
    liveIgot: context.igot.live,
  });
});

module.exports = { chat, chatValidators };
