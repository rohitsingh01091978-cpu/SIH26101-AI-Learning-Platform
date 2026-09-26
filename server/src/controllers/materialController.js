const fs = require('fs');
const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { extractText, mimeToFileType } = require('../document/textExtractor');
const { withAIFallback, getAIProvider } = require('../ai');

const uploadMaterial = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'No file uploaded. Accepted types: PDF, DOCX, TXT.');
  }

  const fileType = mimeToFileType(req.file.mimetype);
  if (!fileType) {
    fs.unlink(req.file.path, () => {});
    throw new ApiError(400, 'Unsupported file type.');
  }

  const material = await prisma.learningMaterial.create({
    data: {
      userId: req.user.id,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      fileType,
      fileSize: req.file.size,
      filePath: req.file.path,
      status: 'EXTRACTING',
    },
  });

  try {
    const text = await extractText(req.file.path, fileType);
    if (!text || text.trim().length < 20) {
      await prisma.learningMaterial.update({ where: { id: material.id }, data: { status: 'FAILED' } });
      throw new ApiError(422, 'The uploaded document appears to be empty or unreadable.');
    }

    const updated = await prisma.learningMaterial.update({
      where: { id: material.id },
      data: { extractedText: text, status: 'UPLOADED' },
    });

    res.status(201).json({ success: true, material: { ...updated, extractedText: undefined } });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    await prisma.learningMaterial.update({ where: { id: material.id }, data: { status: 'FAILED' } });
    throw new ApiError(422, 'Failed to extract text from the uploaded document.');
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
    materials: materials.map((m) => ({ ...m, extractedText: undefined })),
  });
});

const getMaterial = asyncHandler(async (req, res) => {
  const material = await prisma.learningMaterial.findUnique({
    where: { id: req.params.id },
    include: { analysis: true, quizzes: true },
  });
  if (!material || material.userId !== req.user.id) {
    throw new ApiError(404, 'Material not found.');
  }
  res.json({ success: true, material });
});

const analyzeMaterial = asyncHandler(async (req, res) => {
  const material = await prisma.learningMaterial.findUnique({ where: { id: req.params.id } });
  if (!material || material.userId !== req.user.id) {
    throw new ApiError(404, 'Material not found.');
  }
  if (!material.extractedText) {
    throw new ApiError(400, 'This material has no extracted text yet.');
  }

  await prisma.learningMaterial.update({ where: { id: material.id }, data: { status: 'ANALYZING' } });

  try {
    const result = await withAIFallback('analyzeDocument', material.extractedText);

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

    res.json({ success: true, analysis, aiProvider: getAIProvider().name() });
  } catch (err) {
    await prisma.learningMaterial.update({ where: { id: material.id }, data: { status: 'FAILED' } });
    throw new ApiError(500, 'AI content analysis failed. Please try again.');
  }
});

module.exports = { uploadMaterial, listMaterials, getMaterial, analyzeMaterial };
