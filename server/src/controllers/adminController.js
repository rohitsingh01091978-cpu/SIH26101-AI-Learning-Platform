const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const getAdminDashboard = asyncHandler(async (req, res) => {
  const [learners, learnerCompetencies, quizAttempts, assessmentAttempts, skillGaps, materials] = await Promise.all([
    prisma.user.findMany({ where: { role: 'LEARNER' }, include: { profile: true } }),
    prisma.learnerCompetency.findMany({ include: { competency: true } }),
    prisma.quizAttempt.findMany({ where: { status: 'COMPLETED' } }),
    prisma.assessmentAttempt.findMany(),
    prisma.skillGap.findMany({ include: { competency: true } }),
    prisma.learningMaterial.count(),
  ]);

  const totalLearners = learners.length;

  const activeLearnerIds = new Set(
    quizAttempts
      .filter((a) => a.completedAt && Date.now() - new Date(a.completedAt).getTime() < THIRTY_DAYS_MS)
      .map((a) => a.userId)
  );
  const activeLearners = activeLearnerIds.size;

  const averageCompetency = learnerCompetencies.length
    ? Math.round(learnerCompetencies.reduce((sum, c) => sum + c.currentLevel, 0) / learnerCompetencies.length)
    : 0;

  const completedAssessments = assessmentAttempts.filter((a) => a.status === 'COMPLETED').length;
  const assessmentCompletionRate = totalLearners
    ? Math.round((new Set(assessmentAttempts.filter((a) => a.status === 'COMPLETED').map((a) => a.userId)).size / totalLearners) * 100)
    : 0;

  const gapByCompetency = new Map();
  for (const g of skillGaps) {
    const entry = gapByCompetency.get(g.competencyId) || { name: g.competency.name, totalGap: 0, count: 0 };
    entry.totalGap += g.gap;
    entry.count += 1;
    gapByCompetency.set(g.competencyId, entry);
  }
  const topSkillGaps = [...gapByCompetency.values()]
    .map((e) => ({ competency: e.name, averageGap: Math.round(e.totalGap / e.count), learnersAffected: e.count }))
    .sort((a, b) => b.averageGap - a.averageGap)
    .slice(0, 8);

  const distByCategory = new Map();
  for (const lc of learnerCompetencies) {
    const cat = lc.competency.category;
    const entry = distByCategory.get(cat) || { category: cat, total: 0, count: 0 };
    entry.total += lc.currentLevel;
    entry.count += 1;
    distByCategory.set(cat, entry);
  }
  const competencyDistribution = [...distByCategory.values()].map((e) => ({
    category: e.category,
    averageLevel: Math.round(e.total / e.count),
  }));

  const deptMap = new Map();
  for (const learner of learners) {
    const dept = learner.profile?.department || 'Unassigned';
    const entry = deptMap.get(dept) || { department: dept, learnerCount: 0 };
    entry.learnerCount += 1;
    deptMap.set(dept, entry);
  }
  const learnerCompByUser = new Map();
  for (const lc of learnerCompetencies) {
    const arr = learnerCompByUser.get(lc.userId) || [];
    arr.push(lc.currentLevel);
    learnerCompByUser.set(lc.userId, arr);
  }
  const departmentStatistics = [...deptMap.values()].map((d) => {
    const deptLearners = learners.filter((l) => (l.profile?.department || 'Unassigned') === d.department);
    const levels = deptLearners.flatMap((l) => learnerCompByUser.get(l.id) || []);
    const avg = levels.length ? Math.round(levels.reduce((s, v) => s + v, 0) / levels.length) : 0;
    return { ...d, averageCompetency: avg };
  });

  const learningProgressCount = await prisma.learningProgress.count({ where: { status: 'IN_PROGRESS' } });
  const learningCompletedCount = await prisma.learningProgress.count({ where: { status: 'COMPLETED' } });

  res.json({
    success: true,
    totalLearners,
    activeLearners,
    averageCompetency,
    assessmentCompletionRate,
    completedAssessments,
    totalUploadedMaterials: materials,
    topSkillGaps,
    competencyDistribution,
    departmentStatistics,
    learningProgress: { inProgress: learningProgressCount, completed: learningCompletedCount },
  });
});

module.exports = { getAdminDashboard };
