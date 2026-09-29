const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');

const getPerformance = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const [quizAttempts, assessmentAttempts, learnerCompetencies, materialsCount] = await Promise.all([
    prisma.quizAttempt.findMany({
      where: { userId, status: 'COMPLETED' },
      include: { quiz: { select: { title: true } } },
      orderBy: { completedAt: 'desc' },
      take: 10,
    }),
    prisma.assessmentAttempt.findMany({
      where: { userId, status: 'COMPLETED' },
      include: { assessment: { select: { title: true, type: true } } },
      orderBy: { completedAt: 'desc' },
      take: 10,
    }),
    prisma.learnerCompetency.findMany({ where: { userId }, include: { competency: true } }),
    prisma.learningMaterial.count({ where: { userId } }),
  ]);

  const overallScore = learnerCompetencies.length
    ? Math.round(learnerCompetencies.reduce((sum, c) => sum + c.currentLevel, 0) / learnerCompetencies.length)
    : 0;

  const avgQuizAccuracy = quizAttempts.length
    ? Math.round(quizAttempts.reduce((sum, a) => sum + (a.accuracy || 0), 0) / quizAttempts.length)
    : null;

  res.json({
    success: true,
    overallScore,
    avgQuizAccuracy,
    totalQuizzesTaken: quizAttempts.length,
    totalAssessmentsTaken: assessmentAttempts.length,
    totalMaterialsUploaded: materialsCount,
    recentQuizAttempts: quizAttempts.map((a) => ({
      id: a.id,
      quizTitle: a.quiz.title,
      score: a.score,
      accuracy: a.accuracy,
      correctCount: a.correctCount,
      incorrectCount: a.incorrectCount,
      completedAt: a.completedAt,
      performance: a.performanceJson,
    })),
    recentAssessmentAttempts: assessmentAttempts.map((a) => ({
      id: a.id,
      title: a.assessment.title,
      type: a.assessment.type,
      score: a.score,
      completedAt: a.completedAt,
      performance: a.performanceJson,
    })),
    competencies: learnerCompetencies
      .map((c) => ({
        competency: c.competency.name,
        category: c.competency.category,
        currentLevel: c.currentLevel,
        requiredLevel: c.requiredLevel,
      }))
      .sort((a, b) => b.currentLevel - a.currentLevel),
  });
});

module.exports = { getPerformance };
