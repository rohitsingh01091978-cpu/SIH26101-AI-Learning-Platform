const multer = require('multer');
const path = require('path');
const ApiError = require('../utils/ApiError');

// Uploads are received in memory (bounded by the size limit), validated, text-extracted, and only then
// handed to the storage provider (see controllers/materialController.js). Nothing is written to the
// application's own disk, and no client-supplied name or path is ever used for storage.

const ALLOWED_EXT = ['.pdf', '.docx', '.txt'];
const ALLOWED_MIME = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'text/plain': 'TXT',
};

// First, cheap gate on what the client CLAIMS. The real check (file signature) happens after receipt.
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_MIME[file.mimetype] || !ALLOWED_EXT.includes(ext)) {
    return cb(new ApiError(415, 'Unsupported file type. Only PDF, DOCX, and TXT are allowed.', null, 'UNSUPPORTED_FILE'));
  }
  cb(null, true);
};

const maxSizeMb = () => {
  const n = Number(process.env.MAX_UPLOAD_SIZE_MB);
  return Number.isFinite(n) && n > 0 ? n : 10;
};

// Built per request so MAX_UPLOAD_SIZE_MB changes (and tests) take effect without a restart.
const upload = {
  single: (field) => (req, res, next) =>
    multer({
      storage: multer.memoryStorage(),
      fileFilter,
      limits: { fileSize: Math.floor(maxSizeMb() * 1024 * 1024), files: 1, fields: 5, parts: 8 },
    }).single(field)(req, res, (err) => {
      // A malformed multipart body (e.g. a hostile filename with control characters) makes the parser throw a
      // plain Error. That is the client's fault: answer 400 instead of surfacing an internal error.
      if (err && !(err instanceof multer.MulterError) && !(err instanceof ApiError)) {
        return next(new ApiError(400, 'The upload could not be processed. Please send a single PDF, DOCX or TXT file.'));
      }
      return next(err);
    }),
};

module.exports = { upload, ALLOWED_MIME, maxSizeMb };
