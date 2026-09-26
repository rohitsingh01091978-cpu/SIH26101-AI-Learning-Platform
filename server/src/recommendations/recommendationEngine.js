const prisma = require('../utils/prisma');
const { computeAndStoreSkillGaps } = require('../services/skillGapService');
const igotService = require('../services/igotService');

const PRIORITY_WEIGHT = { HIGH: 3, MEDIUM: 2, LOW: 1 };

function pickBestCourse(courses, requiredLevel) {
  if (!courses.length) return null;
  const levelRank = { BEGINNER: 33, INTERMEDIATE: 66, ADVANCED: 100 };
  // Prefer the course whose level most closely matches the required proficiency.
  return [...courses].sort(
    (a, b) => Math.abs(levelRank[a.level] - requiredLevel) - Math.abs(levelRank[b.level] - requiredLevel)
  )[0];
}

/**
 * Rebuilds a learner's personalized learning path from current skill gaps,
 * assessment/quiz history, and the prototype iGOT catalog. Fully recomputed
 * (not hardcoded) every time it is requested or triggered after a quiz.
 */
async function generateLearningPath(userId, { limit = 6 } = {}) {
  const gaps = await computeAndStoreSkillGaps(userId);
  const gapsToAddress = gaps
    .filter((g) => g.gap > 0)
    .sort((a, b) => {
      const weightDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
      if (weightDiff !== 0) return weightDiff;
      return b.gap - a.gap;
    })
    .slice(0, limit);

  await prisma.learningRecommendation.deleteMany({ where: { userId } });

  const recommendations = [];
  let rank = 1;

  for (const gap of gapsToAddress) {
    const { courses } = await igotService.getCourses({ competencyId: gap.competencyId });
    const course = pickBestCourse(courses, gap.requiredLevel);

    const expectedImprovement = Math.min(gap.gap, course ? 25 : 15);
    const difficulty = course?.level || (gap.gap > 40 ? 'BEGINNER' : gap.gap > 20 ? 'INTERMEDIATE' : 'ADVANCED');
    const estimatedDurationHrs = course?.durationHrs ?? (gap.gap > 40 ? 8 : gap.gap > 20 ? 5 : 3);

    const accuracyClause = gap.recentAccuracy != null ? ` Recent assessment accuracy on this competency: ${gap.recentAccuracy}%.` : '';
    const reason = course
      ? `Your "${gap.competency.name}" level (${gap.currentLevel}) is ${gap.gap} points below the ${gap.requiredLevel} required for your target role.${accuracyClause} "${course.title}" directly targets this competency.`
      : `Your "${gap.competency.name}" level (${gap.currentLevel}) is ${gap.gap} points below the ${gap.requiredLevel} required for your target role.${accuracyClause} No catalog course is mapped to this competency yet.`;

    const recommendation = await prisma.learningRecommendation.create({
      data: {
        userId,
        competencyId: gap.competencyId,
        courseId: course?.id || null,
        reason,
        currentLevel: gap.currentLevel,
        requiredLevel: gap.requiredLevel,
        expectedImprovement,
        difficulty,
        estimatedDurationHrs,
        priorityRank: rank,
      },
      include: { competency: true, course: true },
    });

    recommendations.push({
      ...recommendation,
      whyEvidence: {
        currentLevel: gap.currentLevel,
        requiredLevel: gap.requiredLevel,
        gap: gap.gap,
        recentAccuracy: gap.recentAccuracy,
        priority: gap.priority,
      },
    });
    rank += 1;
  }

  return recommendations;
}

module.exports = { generateLearningPath };
