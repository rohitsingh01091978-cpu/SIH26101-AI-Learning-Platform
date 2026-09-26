const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const ApiError = require('../utils/ApiError');
const { inspectDocx } = require('./docxGuard');
const { maxTextChars, enforceTextLimit, textTooLong } = require('./limits');

// Text extraction works on the uploaded bytes in memory, so nothing has to be written to disk (or
// stored at all) before we know the document is readable AND within safe limits.
//
// Every format is held to the same MAX_EXTRACTED_TEXT_CHARS limit; DOCX archives are additionally
// inspected with hard decompression limits before the real parser runs (see docxGuard.js).

// Same output as pdf-parse's built-in page renderer, plus a running character budget. Once the budget is
// exceeded every remaining page is skipped WITHOUT extracting it (its content stream is never decoded), so a
// huge PDF is abandoned early instead of being read to the end.
//
// pdf-parse swallows exceptions thrown inside a page renderer (it substitutes empty text), so the overrun is
// recorded in state and raised by the caller after parsing returns.
function limitedPageRenderer() {
  const state = { total: 0, exceeded: false };
  function renderPage(pageData) {
    if (state.exceeded) return Promise.resolve(''); // budget already blown: do no more work
    return pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then((textContent) => {
      let lastY;
      let text = '';
      for (const item of textContent.items) {
        if (lastY === item.transform[5] || !lastY) text += item.str;
        else text += `\n${item.str}`;
        lastY = item.transform[5];
        // Early stop only. A little slack keeps this from rejecting a document the final (trimmed) check would accept.
        if (state.total + text.length > maxTextChars() + 1024) {
          state.exceeded = true;
          return '';
        }
      }
      state.total += text.length + 2; // pdf-parse joins pages with a blank line
      return text;
    });
  }
  return { renderPage, state };
}

async function extractTextFromBuffer(buffer, fileType) {
  switch (fileType) {
    case 'PDF': {
      const { renderPage, state } = limitedPageRenderer();
      const data = await pdfParse(buffer, { pagerender: renderPage, max: 0 });
      if (state.exceeded) throw textTooLong();
      return enforceTextLimit(data.text.trim());
    }
    case 'DOCX': {
      await inspectDocx(buffer); // throws a clean 4xx for oversized / suspicious / malformed archives
      const result = await mammoth.extractRawText({ buffer });
      return enforceTextLimit(result.value.trim());
    }
    case 'TXT': {
      return enforceTextLimit(buffer.toString('utf-8').trim());
    }
    default:
      throw new ApiError(400, `Unsupported file type for extraction: ${fileType}`);
  }
}

module.exports = { extractTextFromBuffer };
