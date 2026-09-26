const prisma = require('../utils/prisma');
const { computeAndStoreSkillGaps } = require('../services/skillGapService');
const { generateLearningPath } = require('../recommendations/recommendationEngine');

const PRIORITY_WEIGHT = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const trim = (s, n) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
const asArray = (v) => (Array.isArray(v) ? v : []);

/**
 * Everything the assistant is allowed to know about ONE learner, read from the
 * database for the userId taken from the verified JWT (never from the request body).
 *
 * Efficiency: one parallel round of read-only queries over data the app already
 * persists (skill gaps, recommendations, progress, attempts). The expensive
 * recomputation (computeAndStoreSkillGaps / generateLearningPath, which write to the
 * DB) is only run the first time, when nothing has been stored for this learner yet.
 * No document text is loaded - only the analysis summaries.
 */
async function buildLearnerContext(userId) {
  const load = () =>
    Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      prisma.learnerProfile.findUnique({ where: { userId } }),
      prisma.skillGap.findMany({ where: { userId }, include: { competency: true } }),
      prisma.learningRecommendation.findMany({
        where: { userId },
        include: { competency: true, course: true },
        orderBy: { priorityRank: 'asc' },
      }),
      prisma.learningProgress.findMany({
        where: { userId },
        include: { course: true, competency: true },
        orderBy: { updatedAt: 'desc' },
        take: 15,
      }),
      prisma.quizAttempt.findMany({
        where: { userId, status: 'COMPLETED' },
        include: { quiz: { select: { title: true } } },
        orderBy: { completedAt: 'desc' },
        take: 5,
      }),
      prisma.assessmentAttempt.findMany({
        where: { userId, status: 'COMPLETED' },
        include: { assessment: { select: { title: true, type: true } } },
        orderBy: { completedAt: 'desc' },
        take: 5,
      }),
      prisma.learningMaterial.findMany({
        where: { userId, analysis: { isNot: null } },
        select: { originalName: true, uploadedAt: true, analysis: true },
        orderBy: { uploadedAt: 'desc' },
        take: 3,
      }),
      prisma.learningMaterial.count({ where: { userId } }),
      prisma.course.findMany({ include: { competency: { select: { name: true } } }, orderBy: { createdAt: 'asc' } }),
    ]);

  let [user, profile, skillGaps, recs, progress, quizzes, assessments, materials, materialCount, courses] = await load();

  // First use: the learner has competency data but nothing derived yet. Use the existing services once.
  if (skillGaps.length === 0) {
    const hasCompetencies = (await prisma.learnerCompetency.count({ where: { userId } })) > 0;
    if (hasCompetencies) {
      await computeAndStoreSkillGaps(userId);
      [, , skillGaps] = await load();
    }
  }
  if (recs.length === 0 && skillGaps.some((g) => g.gap > 0)) {
    await generateLearningPath(userId);
    recs = await prisma.learningRecommendation.findMany({
      where: { userId },
      include: { competency: true, course: true },
      orderBy: { priorityRank: 'asc' },
    });
  }

  const competencies = skillGaps
    .map((g) => ({
      name: g.competency.name,
      category: g.competency.category,
      current: g.currentLevel,
      required: g.requiredLevel,
      gap: g.gap,
      status: g.status,
      priority: g.priority,
    }))
    .sort((a, b) => b.gap - a.gap);

  // The stored learning path (what the Learning Path page shows) is the source of truth for ranking,
  // so the assistant never disagrees with it when gaps tie. Gaps not in the path follow by priority/size.
  const rankOf = new Map(recs.map((r) => [r.competency.name, r.priorityRank]));
  const gaps = competencies
    .filter((c) => c.gap > 0)
    .sort((a, b) => {
      const ra = rankOf.has(a.name) ? rankOf.get(a.name) : Infinity;
      const rb = rankOf.has(b.name) ? rankOf.get(b.name) : Infinity;
      if (ra !== rb) return ra < rb ? -1 : 1;
      return (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0) || b.gap - a.gap;
    });

  const overallScore = competencies.length
    ? Math.round(competencies.reduce((s, c) => s + c.current, 0) / competencies.length)
    : null;

  return {
    learner: {
      name: user?.name || null,
      department: profile?.department || null,
      organization: profile?.organization || null,
      experienceYears: profile?.experience ?? null,
      currentRole: profile?.currentRole || null,
      targetRole: profile?.targetRole || null,
      learningGoals: profile?.learningGoals || null,
    },
    overallScore,
    competencies,
    gaps,
    recommendations: recs.map((r) => ({
      rank: r.priorityRank,
      competency: r.competency.name,
      current: r.currentLevel,
      required: r.requiredLevel,
      expectedImprovement: r.expectedImprovement,
      difficulty: r.difficulty,
      estimatedDurationHrs: r.estimatedDurationHrs,
      reason: r.reason,
      course: r.course
        ? { title: r.course.title, level: r.course.level, durationHrs: r.course.durationHrs, source: r.course.source }
        : null,
    })),
    catalog: courses.map((c) => ({
      title: c.title,
      competency: c.competency.name,
      level: c.level,
      durationHrs: c.durationHrs,
      source: c.source,
    })),
    progress: progress.map((p) => ({
      course: p.course?.title || null,
      competency: p.competency?.name || null,
      status: p.status,
      percent: p.progressPercent,
    })),
    quizzes: quizzes.map((q) => {
      const perf = q.performanceJson || {};
      return {
        title: q.quiz.title,
        score: q.score,
        accuracy: q.accuracy,
        correct: q.correctCount,
        incorrect: q.incorrectCount,
        completedAt: q.completedAt,
        competencyBreakdown: asArray(perf.competencyBreakdown).map((c) => ({
          competency: c.competency,
          before: c.before,
          after: c.after,
          change: c.change,
          accuracy: c.accuracy,
        })),
        improvementAreas: asArray(perf.improvementAreas),
      };
    }),
    assessments: assessments.map((a) => {
      const perf = a.performanceJson || {};
      return {
        title: a.assessment.title,
        type: a.assessment.type,
        score: a.score,
        completedAt: a.completedAt,
        competencyBreakdown: asArray(perf.competencyBreakdown).map((c) => ({
          competency: c.competency,
          before: c.before,
          after: c.after,
          accuracy: c.accuracy,
        })),
      };
    }),
    materials: {
      total: materialCount,
      analysed: materials.map((m) => ({
        file: m.originalName,
        summary: trim(m.analysis.summary, 350),
        topics: asArray(m.analysis.topics).slice(0, 6),
        competencies: asArray(m.analysis.competencies),
      })),
    },
    // Courses are always read from the app's own iGOT-aligned catalog table: the app never calls a live iGOT API, so nothing is ever presented as live.
    igot: {
      live: false,
      label: 'iGOT-aligned Training Catalog',
    },
  };
}

module.exports = { buildLearnerContext };
