const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { requiredLevelFor } = require('../utils/competencyEngine');
const { computeAndStoreSkillGaps } = require('../services/skillGapService');

const getProfile = asyncHandler(async (req, res) => {
  const profile = await prisma.learnerProfile.findUnique({ where: { userId: req.user.id } });
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!profile) throw new ApiError(404, 'Profile not found.');

  res.json({ success: true, profile: { ...profile, name: user.name, email: user.email, role: user.role } });
});

const updateProfile = asyncHandler(async (req, res) => {
  const { department, organization, experience, currentRole, targetRole, learningGoals, name } = req.body;

  const existing = await prisma.learnerProfile.findUnique({ where: { userId: req.user.id } });
  if (!existing) throw new ApiError(404, 'Profile not found.');

  const targetRoleChanged = targetRole !== undefined && targetRole !== existing.targetRole;

  const profile = await prisma.learnerProfile.update({
    where: { userId: req.user.id },
    data: {
      ...(department !== undefined ? { department } : {}),
      ...(organization !== undefined ? { organization } : {}),
      ...(experience !== undefined ? { experience: Number(experience) } : {}),
      ...(currentRole !== undefined ? { currentRole } : {}),
      ...(targetRole !== undefined ? { targetRole } : {}),
      ...(learningGoals !== undefined ? { learningGoals } : {}),
    },
  });

  if (name) {
    await prisma.user.update({ where: { id: req.user.id }, data: { name } });
  }

  if (targetRoleChanged) {
    // Required levels for every competency depend on target role; recompute gaps immediately.
    const competencies = await prisma.learnerCompetency.findMany({
      where: { userId: req.user.id },
      include: { competency: true },
    });
    await Promise.all(
      competencies.map((lc) =>
        prisma.learnerCompetency.update({
          where: { id: lc.id },
          data: { requiredLevel: requiredLevelFor(targetRole, lc.competency.name) },
        })
      )
    );
    await computeAndStoreSkillGaps(req.user.id);
  }

  res.json({ success: true, profile });
});

module.exports = { getProfile, updateProfile };
