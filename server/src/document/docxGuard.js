const zlib = require('node:zlib');
const { promisify } = require('node:util');
const { docxLimits, tooLarge, unreadable } = require('./limits');

const inflateRaw = promisify(zlib.inflateRaw);

/**
 * Safety inspection of a DOCX (a ZIP archive) BEFORE the real parser (mammoth) sees it.
 *
 * It never trusts the sizes written in the archive headers. Every compressed part is actually
 * decompressed here with a hard output cap, so the real amount of data - not the claimed amount -
 * is what is limited. Enforced limits (see document/limits.js):
 *   - per-part limit for XML/rels parts (the ones the parser reads into memory),
 *   - total expanded size of all parts,
 *   - compression ratio for any sizeable part.
 * Structural problems (not a ZIP, truncated, encrypted, ZIP64, unknown compression, path tricks,
 * or no word/document.xml part) are rejected as unreadable. Nothing here writes to disk.
 *
 * Throws ApiError: 422 DOCUMENT_TOO_LARGE for limit violations, 415 UNSUPPORTED_FILE for anything malformed.
 */

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const MAX_ENTRIES = 2000;
const RATIO_MIN_BYTES = 256 * 1024; // tiny parts may legitimately compress very well; only sizeable ones are ratio-checked
const XML_LIKE = /\.(xml|rels)$/i;

function findEndOfCentralDirectory(buf) {
  const min = Math.max(0, buf.length - (22 + 0xffff));
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

function readEntries(buf) {
  if (buf.length < 22) throw unreadable();
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) throw unreadable();

  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  // ZIP64 / multi-disk archives are never produced by word processors for ordinary documents.
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw unreadable();
  if (total === 0 || total > MAX_ENTRIES) throw unreadable();
  if (cdOffset + cdSize > eocd) throw unreadable();

  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < total; i += 1) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CENTRAL) throw unreadable();
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    if (p + 46 + nameLen > buf.length) throw unreadable();
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.push({ name, flags, method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function compressedBytesOf(buf, entry) {
  const o = entry.localOffset;
  if (o + 30 > buf.length || buf.readUInt32LE(o) !== SIG_LOCAL) throw unreadable();
  const start = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28);
  const end = start + entry.compressedSize;
  if (end > buf.length) throw unreadable();
  return buf.subarray(start, end);
}

const isSuspiciousName = (name) => name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || name.includes('\u0000');

async function inspectDocx(buffer) {
  const limits = docxLimits();
  const entries = readEntries(buffer);

  if (!entries.some((e) => e.name === 'word/document.xml')) throw unreadable();

  let totalExpanded = 0;
  for (const entry of entries) {
    if (isSuspiciousName(entry.name) || (entry.flags & 0x1) !== 0) throw unreadable(); // path tricks / encryption
    if (entry.name.endsWith('/')) continue; // directory marker
    if (entry.method !== 0 && entry.method !== 8) throw unreadable(); // only "stored" and "deflate"

    const data = compressedBytesOf(buffer, entry);
    const budget = limits.maxTotalBytes - totalExpanded;
    const cap = XML_LIKE.test(entry.name) ? Math.min(limits.maxXmlBytes, budget) : budget;
    if (cap <= 0) throw tooLarge();

    let expanded;
    if (entry.method === 0) {
      expanded = data.length;
      if (expanded > cap) throw tooLarge();
    } else {
      try {
        // maxOutputLength makes the decompressor stop and fail as soon as the REAL output exceeds the cap.
        expanded = (await inflateRaw(data, { maxOutputLength: cap })).length;
      } catch (err) {
        if (err && err.code === 'ERR_BUFFER_TOO_LARGE') throw tooLarge();
        throw unreadable(); // corrupt / truncated deflate data
      }
    }

    if (expanded > RATIO_MIN_BYTES && data.length > 0 && expanded / data.length > limits.maxRatio) throw tooLarge();
    totalExpanded += expanded;
  }
  return { entries: entries.length, totalExpanded };
}

module.exports = { inspectDocx };
