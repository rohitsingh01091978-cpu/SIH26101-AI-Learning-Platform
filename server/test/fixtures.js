// Small generators for real, parseable test documents (no binary fixtures committed).
const zlib = require('node:zlib');

// A valid one-page PDF padded past 4 KB (the bundled pdf-parse is unreliable on very small PDFs).
function buildPdf(lines) {
  const esc = (s) => s.replace(/([\\()])/g, '\\$1');
  const content = `BT /F1 11 Tf 40 780 Td 14 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = `%PDF-1.4\n${`%${'x'.repeat(78)}\n`.repeat(60)}`;
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

// A minimal but genuine .docx (a ZIP with stored entries) that mammoth can read.
function buildDocx(text) {
  const entries = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  };
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, body] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name);
    const data = Buffer.from(body);
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const SENTENCES = [
  'Statistical sampling selects a subset of a population to estimate population parameters.',
  'Data quality has several dimensions including accuracy, timeliness, coherence and accessibility.',
  'The Consumer Price Index measures the average change in prices paid by households over time.',
  'National accounts record production, income and expenditure of an economy in a consistent framework.',
  'Survey design needs a clear sampling frame, a questionnaire pilot and a plan for non-response follow up.',
  'Metadata standards make statistical datasets easier to discover, understand and reuse across agencies.',
];

module.exports = { buildPdf, buildDocx, SENTENCES };

// ---------------------------------------------------------------------------------------------
// Generic ZIP builder for extraction-safety tests. Each entry:
//   { name, data, method: 'deflate' | 'store' | <number>, flags, declaredCompressed }
// (declaredCompressed lets a test write a deliberately wrong size into the headers.)
// Tests keep every fixture small by lowering the DOCX_* limits through environment variables.
function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name);
    const method = e.method === 'store' ? 0 : e.method === undefined || e.method === 'deflate' ? 8 : e.method;
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
    const stored = method === 8 && !e.raw ? zlib.deflateRawSync(data) : data;
    const compressedSize = e.declaredCompressed !== undefined ? e.declaredCompressed : stored.length;
    const crc = zlib.crc32(data);
    const flags = e.flags || 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressedSize, 18);
    local.writeUInt32LE(e.declaredUncompressed !== undefined ? e.declaredUncompressed : data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, stored);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressedSize, 20);
    central.writeUInt32LE(e.declaredUncompressed !== undefined ? e.declaredUncompressed : data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + stored.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const RELS_XML =
  '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
const documentXml = (text) =>
  `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;

// A well-formed DOCX with the given body text, plus any extra entries.
function docxWith(text, extraEntries = [], overrides = {}) {
  return buildZip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES_XML },
    { name: '_rels/.rels', data: RELS_XML },
    { name: 'word/document.xml', data: overrides.documentData || documentXml(text), ...(overrides.document || {}) },
    ...extraEntries,
  ]);
}

// Deterministic, poorly-compressible filler text of roughly `chars` characters (so ratio limits are not what trips).
function fillerText(chars, seed = 7) {
  let x = seed;
  const out = [];
  let len = 0;
  while (len < chars) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const w = (x % 1000003).toString(36);
    out.push(w);
    len += w.length + 1;
  }
  return out.join(' ').slice(0, chars);
}

module.exports.buildZip = buildZip;
module.exports.docxWith = docxWith;
module.exports.documentXml = documentXml;
module.exports.fillerText = fillerText;
