const ApiError = require('../utils/ApiError');

// Limits that keep document extraction from consuming unbounded memory/CPU. All are read from the
// environment at call time; an invalid value silently falls back to the documented default.
//
//   MAX_EXTRACTED_TEXT_CHARS     max characters of text extracted from any PDF/DOCX/TXT     default 2,000,000
//   DOCX_MAX_XML_MB              max expanded size of one XML/rels part inside a DOCX (MB)   default 8
//   DOCX_MAX_TOTAL_MB            max expanded size of ALL parts of a DOCX together (MB)      default 40
//   DOCX_MAX_COMPRESSION_RATIO   max expanded:compressed ratio for a part over 256 KB        default 100
//   MAX_CONCURRENT_EXTRACTIONS   document extractions allowed to run at once in this process   default 2

const DEFAULTS = {
  maxTextChars: 2_000_000, // ~1000 pages of dense text
  docxMaxXmlBytes: 8 * 1024 * 1024,
  docxMaxTotalBytes: 40 * 1024 * 1024,
  docxMaxRatio: 100,
  maxConcurrentExtractions: 2,
};

// Parses a positive number within [min, max]; anything else (empty, text, NaN, out of range) -> fallback.
function numberEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

const maxTextChars = () => Math.floor(numberEnv('MAX_EXTRACTED_TEXT_CHARS', DEFAULTS.maxTextChars, 100, 50_000_000));
const maxConcurrentExtractions = () => Math.floor(numberEnv('MAX_CONCURRENT_EXTRACTIONS', DEFAULTS.maxConcurrentExtractions, 1, 32));
const docxLimits = () => ({
  maxXmlBytes: Math.floor(numberEnv('DOCX_MAX_XML_MB', DEFAULTS.docxMaxXmlBytes / 1048576, 0.01, 200) * 1048576),
  maxTotalBytes: Math.floor(numberEnv('DOCX_MAX_TOTAL_MB', DEFAULTS.docxMaxTotalBytes / 1048576, 0.01, 500) * 1048576),
  maxRatio: numberEnv('DOCX_MAX_COMPRESSION_RATIO', DEFAULTS.docxMaxRatio, 2, 10_000),
});

// ---- Errors shown to the learner: clear and generic. They never contain parser output, paths or sizes we computed internally.
const tooLarge = () =>
  new ApiError(422, 'This document is too large or too complex to process safely. Please reduce its size or split it into smaller files.', null, 'DOCUMENT_TOO_LARGE');
const unreadable = () =>
  new ApiError(415, 'Unsupported or unreadable file. Only genuine PDF, DOCX and TXT files are accepted.', null, 'UNSUPPORTED_FILE');
const textTooLong = () =>
  new ApiError(
    422,
    `This document contains too much text to process (the limit is ${maxTextChars().toLocaleString('en-US')} characters). Please upload a shorter document or split it into parts.`,
    null,
    'TEXT_TOO_LONG'
  );

// Throws if the extracted text is over the configured limit.
function enforceTextLimit(text) {
  if (typeof text === 'string' && text.length > maxTextChars()) throw textTooLong();
  return text;
}

module.exports = { DEFAULTS, maxTextChars, maxConcurrentExtractions, docxLimits, enforceTextLimit, tooLarge, unreadable, textTooLong };
