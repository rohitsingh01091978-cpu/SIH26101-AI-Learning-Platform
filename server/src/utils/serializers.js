// What the browser is allowed to see about an uploaded material. Internal storage details
// (stored file name, server path/key, owner id) and the full extracted text are never sent.
function publicMaterial(m) {
  return {
    id: m.id,
    originalName: m.originalName,
    fileType: m.fileType,
    fileSize: m.fileSize,
    status: m.status,
    uploadedAt: m.uploadedAt,
    // list/detail queries do not load the text; they pass an explicit flag instead
    hasExtractedText: m.hasExtractedText !== undefined ? Boolean(m.hasExtractedText) : Boolean(m.extractedText),
    // true when the original file is stored and can be downloaded/deleted (never the location itself)
    hasStoredFile: Boolean(m.storageKey),
    ...(m.analysis !== undefined ? { analysis: m.analysis } : {}),
    ...(m.quizzes !== undefined ? { quizzes: m.quizzes } : {}),
  };
}

module.exports = { publicMaterial };
