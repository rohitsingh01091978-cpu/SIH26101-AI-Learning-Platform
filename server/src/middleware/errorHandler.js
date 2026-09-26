const multer = require('multer');
const ApiError = require('../utils/ApiError');

function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: `File upload error: ${err.message}` });
  }

  const statusCode = err.statusCode || err.status || 500;
  const isServerError = statusCode >= 500;

  if (isServerError) {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message: isServerError && process.env.NODE_ENV === 'production'
      ? 'Internal server error. Please try again later.'
      : err.message || 'Something went wrong.',
    details: err.details || undefined,
  });
}

module.exports = { errorHandler, notFoundHandler };
