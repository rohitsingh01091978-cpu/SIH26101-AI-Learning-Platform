class ApiError extends Error {
  constructor(statusCode, message, details = null, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code = code; // stable identifier for clients, e.g. AI_QUOTA_EXCEEDED
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
