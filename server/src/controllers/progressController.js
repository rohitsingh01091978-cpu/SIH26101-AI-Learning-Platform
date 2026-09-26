const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const listProgress = asyncHandler(async (req, res) => {
  const progress = await prisma.learningProgress.findMany({
    where: { userId: req.user.id },
    include: { course: true, competency: true },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ success: true, progress });
});

const startProgress = asyncHandler(async (req, res) => {
  const { courseId, competencyId, recommendationId } = req.body;
  if (!courseId) throw new ApiError(400, 'courseId is required.');

  // Reject unknown references cleanly (they used to surface as database errors).
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) throw new ApiError(404, 'Course not found.');
  if (competencyId) {
    const competency = await prisma.competency.findUnique({ where: { id: competencyId }, select: { id: true } });
    if (!competency) throw new ApiError(400, 'competencyId is invalid.');
  }
  if (recommendationId) {
    // A recommendation can only be linked by the learner it belongs to.
    const rec = await prisma.learningRecommendation.findUnique({ where: { id: recommendationId }, select: { userId: true } });
    if (!rec || rec.userId !== req.user.id) throw new ApiError(400, 'recommendationId is invalid.');
  }

  const existing = await prisma.learningProgress.findFirst({ where: { userId: req.user.id, courseId } });
  if (existing) {
    return res.json({ success: true, progress: existing });
  }

  const progress = await prisma.learningProgress.create({
    data: {
      userId: req.user.id,
      courseId,
      competencyId: competencyId || null,
      recommendationId: recommendationId || null,
      status: 'IN_PROGRESS',
      progressPercent: 0,
      startedAt: new Date(),
    },
    include: { course: true, competency: true },
  });

  res.status(201).json({ success: true, progress });
});

const updateProgress = asyncHandler(async (req, res) => {
  const { status, progressPercent } = req.body;
  const existing = await prisma.learningProgress.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.user.id) {
    throw new ApiError(404, 'Progress record not found.');
  }

  const data = {};
  if (progressPercent !== undefined) data.progressPercent = Math.max(0, Math.min(100, Number(progressPercent)));
  if (status) {
    data.status = status;
    if (status === 'COMPLETED') {
      data.completedAt = new Date();
      data.progressPercent = 100;
    }
  }

  const progress = await prisma.learningProgress.update({
    where: { id: req.params.id },
    data,
    include: { course: true, competency: true },
  });

  res.json({ success: true, progress });
});

module.exports = { listProgress, startProgress, updateProgress };
