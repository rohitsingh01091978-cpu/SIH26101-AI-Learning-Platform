const path = require('node:path');
const ApiError = require('../utils/ApiError');

// What a client says a file is (name, MIME type) is never trusted on its own. The extension must be
// on the allow-list AND the bytes must actually look like that format. Only the validated type decides
// the stored extension and the Content-Type used on download.

const ALLOWED = {
  '.pdf': { fileType: 'PDF', mime: 'application/pdf' },
  '.docx': { fileType: 'DOCX', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  '.txt': { fileType: 'TXT', mime: 'text/plain; charset=utf-8' },
};
const CONTENT_TYPES = Object.fromEntries(Object.values(ALLOWED).map((v) => [v.fileType, v.mime]));

const unsupported = () => new ApiError(415, 'Unsupported or unreadable file. Only genuine PDF, DOCX and TXT files are accepted.', null, 'UNSUPPORTED_FILE');

// multer decodes multipart filenames as latin1; recover the UTF-8 the browser actually sent.
const fixEncoding = (name) => {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
};

/**
 * A display-safe original filename: no directories, no control characters, bounded length.
 * It is only ever shown to the owner and used in the download header - never as a path.
 */
function sanitizeOriginalName(raw) {
  let name = fixEncoding(String(raw || ''));
  name = name.replace(/\\/g, '/').split('/').pop(); // drop any directory part, either separator style
  name = name.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim();
  name = name.replace(/^\.+/, ''); // no leading dots (hidden files, "..")
  if (name.length > 150) {
    const ext = path.extname(name).slice(0, 10);
    name = `${name.slice(0, 150 - ext.length)}${ext}`;
  }
  return name || 'document';
}

const looksLikePdf = (buf) => buf.subarray(0, 1024).includes('%PDF-');

// A DOCX is a ZIP archive containing word/document.xml (entry names are stored uncompressed).
const looksLikeDocx = (buf) =>
  buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04 && buf.includes('word/document.xml');

// Plain text: valid UTF-8 and no NUL bytes (which appear in every executable/binary format).
function looksLikeText(buf) {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates an uploaded file. Returns { fileType, ext, contentType, originalName } or throws 415.
 */
function validateUpload({ originalname, buffer }) {
  const originalName = sanitizeOriginalName(originalname);
  const ext = path.extname(originalName).toLowerCase();
  const rule = ALLOWED[ext];
  if (!rule || !Buffer.isBuffer(buffer) || buffer.length === 0) throw unsupported();

  const ok = rule.fileType === 'PDF' ? looksLikePdf(buffer) : rule.fileType === 'DOCX' ? looksLikeDocx(buffer) : looksLikeText(buffer);
  if (!ok) throw unsupported();

  return { fileType: rule.fileType, ext: ext.slice(1), contentType: rule.mime, originalName };
}

// A safe Content-Disposition value: ASCII fallback plus RFC 5987 UTF-8 filename*.
function contentDisposition(originalName) {
  const ascii = originalName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(originalName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

module.exports = { validateUpload, sanitizeOriginalName, contentDisposition, CONTENT_TYPES, ALLOWED };
