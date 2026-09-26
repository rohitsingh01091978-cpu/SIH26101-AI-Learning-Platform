const asyncHandler = require('../utils/asyncHandler');
const { generateLearningPath } = require('../recommendations/recommendationEngine');

const getLearningPath = asyncHandler(async (req, res) => {
  const recommendations = await generateLearningPath(req.user.id);

  const path = recommendations.map((r, idx) => ({
    priority: idx + 1,
    competency: r.competency.name,
    course: r.course
      ? { id: r.course.id, title: r.course.title, source: r.course.source, level: r.course.level }
      : null,
    reason: r.reason,
    currentLevel: r.currentLevel,
    requiredLevel: r.requiredLevel,
    expectedImprovement: r.expectedImprovement,
    difficulty: r.difficulty,
    estimatedDurationHrs: r.estimatedDurationHrs,
    whyEvidence: r.whyEvidence,
  }));

  res.json({ success: true, learningPath: path });
});

const getRecommendations = asyncHandler(async (req, res) => {
  const recommendations = await generateLearningPath(req.user.id);
  res.json({ success: true, recommendations });
});

module.exports = { getLearningPath, getRecommendations };
