const multer = require('multer');
const ApiError = require('../utils/ApiError');

// Internal error text is only shown when NODE_ENV is explicitly development or
// test. Anything else (including an unset NODE_ENV) gets the generic message.
const exposeInternals = ['development', 'test'].includes(process.env.NODE_ENV);

function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: `File upload error: ${err.message}` });
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

  if (isServerError) {
    console.error(err);
  }

  // Only errors we raised ourselves (ApiError) carry messages meant for clients.
  const safeToShow = err instanceof ApiError && !isServerError;

  res.status(statusCode).json({
    success: false,
    message: safeToShow || (isServerError && exposeInternals)
      ? err.message || 'Something went wrong.'
      : isServerError
        ? 'Internal server error. Please try again later.'
        : 'Request could not be processed.',
    details: safeToShow ? err.details || undefined : undefined,
  });
}

module.exports = { errorHandler, notFoundHandler };
