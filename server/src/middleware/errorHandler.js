const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { AIUnavailableError } = require('../ai/errors');
const { maxSizeMb } = require('./upload');

// Internal error text is only shown when NODE_ENV is explicitly development or
// test. Anything else (including an unset NODE_ENV) gets the generic message.
const exposeInternals = () => ['development', 'test'].includes(process.env.NODE_ENV);

function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, code: 'FILE_TOO_LARGE', message: `That file is too large. The maximum size is ${maxSizeMb()} MB.` });
    }
    return res.status(400).json({ success: false, message: 'The upload could not be processed. Please send a single PDF, DOCX or TXT file.' });
  }

  // The real AI service could not serve a core request (never answered with demo output).
  if (err instanceof AIUnavailableError) {
    return res.status(503).json({
      success: false,
      code: 'AI_UNAVAILABLE',
      message: 'The AI service is temporarily unavailable. Please try again in a moment.',
    });
  }

  // body-parser failures (malformed JSON, oversized body)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Malformed request body.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body is too large.' });
  }

  const statusCode = err.statusCode || err.status || 500;
  const isServerError = statusCode >= 500;

  // Only errors we raised ourselves (ApiError) carry messages meant for clients. A deliberate 503
  // ("service unavailable": assistant, password recovery) is one of them, not an internal crash.
  const safeToShow = err instanceof ApiError && (!isServerError || statusCode === 503);

  if (isServerError && !safeToShow) {
    console.error(err);
  }

  if (safeToShow && err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));

  res.status(statusCode).json({
    success: false,
    code: safeToShow && typeof err.code === 'string' ? err.code : undefined,
    quota: safeToShow && err.extra ? err.extra : undefined,
    message: safeToShow || (isServerError && exposeInternals())
      ? err.message || 'Something went wrong.'
      : isServerError
        ? 'Internal server error. Please try again later.'
        : 'Request could not be processed.',
    details: safeToShow ? err.details || undefined : undefined,
  });
}

module.exports = { errorHandler, notFoundHandler };
