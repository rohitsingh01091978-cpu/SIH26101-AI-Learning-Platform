const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

// Turns express-validator failures into a clean 400. Only the field name and our own message are
// returned - never the submitted value (it could be a password or another secret).
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  const details = errors.array().map((e) => ({ field: e.path, message: e.msg }));
  return next(new ApiError(400, 'Some fields are invalid.', details));
}

module.exports = { handleValidation };
