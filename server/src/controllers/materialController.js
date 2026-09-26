const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { extractTextFromBuffer } = require('../document/textExtractor');
const { publicMaterial } = require('../utils/serializers');
const { reserveAiQuota, FEATURES } = require('../services/aiQuota');
const { runCoreAI } = require('../ai');
const { AIUnavailableError } = require('../ai/errors');
const { getStorage, storageUnavailable } = require('../storage');
const { buildKey } = require('../storage/keys');
const { validateUpload, contentDisposition, CONTENT_TYPES } = require('../storage/fileValidation');

const MIN_TEXT_CHARS = 20;

// POST /materials/upload
// Order matters: validate -> extract text IN MEMORY -> store the file -> save the record. A document
// that cannot be read is never stored, and a failure part-way leaves no orphaned file behind.
const uploadMaterial = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'No file uploaded. Accepted types: PDF, DOCX, TXT.');
  }

  const storage = getStorage(); // 503 before any work if no persistent storage is configured
  const { fileType, originalName } = validateUpload(req.file); // 415 unless the bytes really are that format
  const key = buildKey(req.user.id, fileType); // server-generated; the owner is the JWT user

  const material = await prisma.learningMaterial.create({
    data: {
      userId: req.user.id,
      fileName: key.split('/').pop(), // generated name, never the client's
      originalName,
      fileType,
      fileSize: req.file.size,
      storageProvider: storage.name(),
      status: 'EXTRACTING',
    },
  });

  let text = null;
  try {
    text = await extractTextFromBuffer(req.file.buffer, fileType);
  } catch (err) {
    await prisma.learningMaterial.update({ where: { id: material.id }, data: { status: 'FAILED' } });
    throw new ApiError(422, 'Failed to extract text from the uploaded document.');
  }
  if (!text || text.trim().length < MIN_TEXT_CHARS) {
    await prisma.learningMaterial.update({ where: { id: material.id }, data: { status: 'FAILED' } });
    throw new ApiError(422, 'The uploaded document appears to be empty or unreadable.');
  }

  try {
    await storage.put(key, req.file.buffer);
  } catch (err) {
    console.error('[storage] could not store an uploaded file.'); // no name, path or content
    await prisma.learningMaterial.delete({ where: { id: material.id } }).catch(() => {});
    throw storageUnavailable();
  }

  try {
    const updated = await prisma.learningMaterial.update({
      where: { id: material.id },
      data: {
        extractedText: text,
        status: 'UPLOADED',
        storageKey: key,
        sha256: crypto.createHash('sha256').update(req.file.buffer).digest('hex'),
      },
    });
    res.status(201).json({ success: true, material: publicMaterial(updated) });
  } catch (err) {
    await storage.delete(key).catch(() => {}); // do not leave a file that no record points to
    throw err;
  }
});

const listMaterials = asyncHandler(async (req, res) => {
  const materials = await prisma.learningMaterial.findMany({
    where: { userId: req.user.id },
    include: { analysis: true, quizzes: { select: { id: true } } },
    orderBy: { uploadedAt: 'desc' },
  });
  res.json({
    success: true,
    materials: materials.map(publicMaterial),
  });
});

const getMaterial = asyncHandler(async (req, res) => {
  // Ownership is part of the query itself: someone else's material is indistinguishable from a missing one.
  const material = await prisma.learningMaterial.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { analysis: true, quizzes: true },
  });
  if (!material) {
    throw new ApiError(404, 'Material not found.');
  }
  res.json({ success: true, material: publicMaterial(material) });
});

const analyzeMaterial = asyncHandler(async (req, res) => {
  const material = await prisma.learningMaterial.findUnique({ where: { id: req.params.id } });
  if (!material || material.userId !== req.user.id) {
    throw new ApiError(404, 'Material not found.');
  }
  if (!material.extractedText) {
    throw new ApiError(400, 'This material has no extracted text yet.');
  }

  // Daily quota first: a learner over the limit gets a clear 429 before anything about the material changes.
  const usage = await reserveAiQuota(req.user.id, FEATURES.ANALYZE_DOCUMENT);

  const previousStatus = material.status;
  await prisma.learningMaterial.update({ where: { id: material.id }, data: { status: 'ANALYZING' } });

  try {
    const { result, provider } = await usage.run(() => runCoreAI('analyzeDocument', material.extractedText));
    await usage.succeed({ provider });

    const allCompetencies = await prisma.competency.findMany({ select: { name: true, category: true } });
    const categoryByName = new Map(allCompetencies.map((c) => [c.name, c.category]));
    const competencyEvidence = (result.competencyEvidence || [])
      .filter((e) => e.evidence)
      .map((e) => ({ ...e, category: categoryByName.get(e.competency) || null }));

    const analysis = await prisma.documentAnalysis.upsert({
      where: { materialId: material.id },
      update: { ...result, competencyEvidence },
      create: { materialId: material.id, ...result, competencyEvidence },
    });

    await prisma.learningMaterial.update({ where: { id: material.id }, data: { status: 'COMPLETED' } });

    res.json({ success: true, analysis, aiProvider: provider });
  } catch (err) {
    await usage.fail(err); // no-op if the AI call had already succeeded
    if (err instanceof AIUnavailableError) {
      // Not the document's fault: put it back so the learner can simply retry later.
      await prisma.learningMaterial.update({ where: { id: material.id }, data: { status: previousStatus === 'ANALYZING' ? 'UPLOADED' : previousStatus } });
      throw err;
    }
    await prisma.learningMaterial.update({ where: { id: material.id }, data: { status: 'FAILED' } });
    throw new ApiError(500, 'AI content analysis failed. Please try again.');
  }
});

// GET /materials/:id/file - streams the ORIGINAL file, to its owner only. Never a public URL.
const downloadMaterialFile = asyncHandler(async (req, res) => {
  const material = await prisma.learningMaterial.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    select: { originalName: true, fileType: true, storageKey: true },
  });
  if (!material) throw new ApiError(404, 'Material not found.');

  const notAvailable = () => new ApiError(404, 'The original file is not available for this material.', null, 'FILE_NOT_AVAILABLE');
  if (!material.storageKey) throw notAvailable(); // uploaded before persistent storage existed

  const file = await getStorage().get(material.storageKey);
  if (!file) throw notAvailable();

  // Content-Type comes from the validated file type, never from the client; the name is sanitised.
  res.setHeader('Content-Type', CONTENT_TYPES[material.fileType] || 'application/octet-stream');
  res.setHeader('Content-Length', String(file.size));
  res.setHeader('Content-Disposition', contentDisposition(material.originalName));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  file.stream.on('error', () => res.destroy());
  file.stream.pipe(res);
});

// Files uploaded before persistent storage existed have an absolute path in the legacy column. Remove the
// file only if it really is inside the legacy upload directory; anything else is ignored.
function deleteLegacyFile(filePath) {
  try {
    const legacyDir = path.resolve(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads');
    const target = path.resolve(filePath);
    if (target.startsWith(legacyDir + path.sep)) fs.unlink(target, () => {});
  } catch {
    /* best effort */
  }
}

// DELETE /materials/:id - owner only. Removes the stored file, the extracted text and the analysis.
// Quizzes and results generated from it are kept (their link to the material is simply cleared).
const deleteMaterial = asyncHandler(async (req, res) => {
  const material = await prisma.learningMaterial.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    select: { id: true, storageKey: true, filePath: true },
  });
  if (!material) throw new ApiError(404, 'Material not found.');

  // File first: if this fails the record stays, so the learner can retry and nothing is orphaned.
  if (material.storageKey) {
    try {
      await getStorage().delete(material.storageKey);
    } catch (err) {
      console.error('[storage] could not delete a stored file.');
      throw storageUnavailable();
    }
  } else if (material.filePath) {
    deleteLegacyFile(material.filePath);
  }

  await prisma.learningMaterial.delete({ where: { id: material.id } });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, message: 'The material and its stored file have been deleted.' });
});

module.exports = { uploadMaterial, listMaterials, getMaterial, analyzeMaterial, downloadMaterialFile, deleteMaterial };
