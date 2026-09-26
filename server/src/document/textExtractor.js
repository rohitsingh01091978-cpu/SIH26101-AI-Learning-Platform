const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const ApiError = require('../utils/ApiError');

async function extractText(filePath, fileType) {
  const buffer = fs.readFileSync(filePath);

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

function mimeToFileType(mimetype) {
  const map = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'text/plain': 'TXT',
  };
  return map[mimetype] || null;
}

module.exports = { extractText, mimeToFileType };
