const prisma = require('../utils/prisma');
const { computeGap, gapStatus, gapPriority, requiredLevelFor } = require('../utils/competencyEngine');

/**
 * Recomputes every skill gap for a user directly from LearnerCompetency +
 * LearnerProfile.targetRole (never hardcoded), and upserts SkillGap rows.
 * Called after: initial assessment, quiz completion, and profile updates
 * (target role change re-derives every required level).
 */
async function computeAndStoreSkillGaps(userId) {
  const [profile, learnerCompetencies, recentAssessmentAttempts, learningProgressRecords] = await Promise.all([
    prisma.learnerProfile.findUnique({ where: { userId } }),
    prisma.learnerCompetency.findMany({ where: { userId }, include: { competency: true } }),
    // Recent completed assessments, newest first — used below to surface each competency's
    // most recent assessment accuracy (distinct signal from quiz accuracy) for recommendation explainability.
    prisma.assessmentAttempt.findMany({
      where: { userId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      take: 5,
      select: { performanceJson: true, completedAt: true },
    }),
    // Real learning-history signal: has the learner started/completed any course tied to this competency.
    prisma.learningProgress.findMany({
      where: { userId, competencyId: { not: null } },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const targetRole = profile?.targetRole || null;

  const assessmentAccuracyByCompetencyId = new Map();
  for (const attempt of recentAssessmentAttempts) {
    for (const c of attempt.performanceJson?.competencyBreakdown || []) {
      if (c.competencyId && !assessmentAccuracyByCompetencyId.has(c.competencyId)) {
        assessmentAccuracyByCompetencyId.set(c.competencyId, c.accuracy);
      }
    }
  }

  const learningActivityByCompetencyId = new Map();
  for (const p of learningProgressRecords) {
    if (!learningActivityByCompetencyId.has(p.competencyId)) {
      learningActivityByCompetencyId.set(p.competencyId, p.status);
    }
  }

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

    const assessmentAccuracy = assessmentAccuracyByCompetencyId.get(lc.competencyId);

    results.push({
      ...skillGap,
      recentAccuracy: recentAccuracy != null ? Math.round(recentAccuracy) : null,
      assessmentAccuracy: assessmentAccuracy != null ? Math.round(assessmentAccuracy) : null,
      learningActivity: learningActivityByCompetencyId.get(lc.competencyId) || null,
      targetRole,
    });
  }

  return results.sort((a, b) => b.gap - a.gap);
}

module.exports = { computeAndStoreSkillGaps };
