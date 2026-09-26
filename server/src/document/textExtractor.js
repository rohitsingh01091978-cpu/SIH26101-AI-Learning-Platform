const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const ApiError = require('../utils/ApiError');

// Text extraction works on the uploaded bytes in memory, so nothing has to be written to disk (or
// stored at all) before we know the document is readable.
async function extractTextFromBuffer(buffer, fileType) {
  switch (fileType) {
    case 'PDF': {
      const data = await pdfParse(buffer);
      return data.text.trim();
    }
    case 'DOCX': {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }
    case 'TXT': {
      return buffer.toString('utf-8').trim();
    }
    default:
      throw new ApiError(400, `Unsupported file type for extraction: ${fileType}`);
  }
}

module.exports = { extractTextFromBuffer };
