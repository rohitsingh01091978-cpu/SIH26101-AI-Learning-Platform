const prisma = require('../utils/prisma');
const { computeGap, gapStatus, gapPriority, requiredLevelFor } = require('../utils/competencyEngine');

/**
 * Recomputes every skill gap for a user directly from LearnerCompetency +
 * LearnerProfile.targetRole (never hardcoded), and upserts SkillGap rows.
 * Called after: initial assessment, quiz completion, and profile updates
 * (target role change re-derives every required level).
 */
async function computeAndStoreSkillGaps(userId) {
  const [profile, learnerCompetencies] = await Promise.all([
    prisma.learnerProfile.findUnique({ where: { userId } }),
    prisma.learnerCompetency.findMany({ where: { userId }, include: { competency: true } }),
  ]);

  const targetRole = profile?.targetRole || null;
  const results = [];

  for (const lc of learnerCompetencies) {
    const requiredLevel = requiredLevelFor(targetRole, lc.competency.name);
    const gap = computeGap(lc.currentLevel, requiredLevel);
    const status = gapStatus(gap);

    // Factor in recent quiz accuracy on this competency for priority weighting.
    const recentResponses = await prisma.questionResponse.findMany({
      where: {
        quizQuestion: { competencyId: lc.competencyId },
        quizAttempt: { userId, status: 'COMPLETED' },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    const recentAccuracy = recentResponses.length
      ? (recentResponses.filter((r) => r.isCorrect).length / recentResponses.length) * 100
      : null;

    const priority = gapPriority(gap, recentAccuracy);

    // keep LearnerCompetency.requiredLevel in sync for fast reads elsewhere
    await prisma.learnerCompetency.update({
      where: { id: lc.id },
      data: { requiredLevel },
    });

    const skillGap = await prisma.skillGap.upsert({
      where: { userId_competencyId: { userId, competencyId: lc.competencyId } },
      update: { currentLevel: lc.currentLevel, requiredLevel, gap, status, priority, calculatedAt: new Date() },
      create: {
        userId,
        competencyId: lc.competencyId,
        currentLevel: lc.currentLevel,
        requiredLevel,
        gap,
        status,
        priority,
      },
      include: { competency: true },
    });

    results.push({ ...skillGap, recentAccuracy: recentAccuracy != null ? Math.round(recentAccuracy) : null });
  }

  return results.sort((a, b) => b.gap - a.gap);
}

module.exports = { computeAndStoreSkillGaps };
