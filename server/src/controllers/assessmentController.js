const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { clampLevel } = require('../utils/competencyEngine');
const { computeAndStoreSkillGaps } = require('../services/skillGapService');

const sanitizeQuestion = (q) => ({
  id: q.id,
  question: q.question,
  options: q.options,
  competency: q.competency?.name,
  difficulty: q.difficulty,
});

const startAssessment = asyncHandler(async (req, res) => {
  const assessment = await prisma.assessment.findFirst({
    where: { type: 'INITIAL' },
    orderBy: { createdAt: 'asc' },
    include: { questions: { include: { competency: true } } },
  });
  if (!assessment) throw new ApiError(404, 'No assessment is configured yet.');

  const attempt = await prisma.assessmentAttempt.create({
    data: { userId: req.user.id, assessmentId: assessment.id, status: 'IN_PROGRESS' },
  });

  res.status(201).json({
    success: true,
    attemptId: attempt.id,
    assessment: { id: assessment.id, title: assessment.title, type: assessment.type },
    questions: assessment.questions.map(sanitizeQuestion),
  });
});

const submitAssessment = asyncHandler(async (req, res) => {
  const { attemptId, responses } = req.body;
  if (!attemptId || !Array.isArray(responses) || responses.length === 0) {
    throw new ApiError(400, 'attemptId and a non-empty responses array are required.');
  }

  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: { include: { questions: { include: { competency: true } } } } },
  });
  if (!attempt || attempt.userId !== req.user.id) {
    throw new ApiError(404, 'Assessment attempt not found.');
  }
  if (attempt.status === 'COMPLETED') {
    throw new ApiError(400, 'This assessment attempt has already been submitted.');
  }

  const questionsById = new Map(attempt.assessment.questions.map((q) => [q.id, q]));
  const competencyStats = new Map(); // competencyId -> { correct, total, name }
  let correctCount = 0;

  for (const r of responses) {
    const question = questionsById.get(r.questionId);
    if (!question) continue;

    const isCorrect = Number(r.selectedAnswer) === question.correctAnswer;
    if (isCorrect) correctCount += 1;

    try {
      await prisma.questionResponse.create({
        data: {
          assessmentAttemptId: attempt.id,
          assessmentQuestionId: question.id,
          selectedAnswer: Number(r.selectedAnswer),
          isCorrect,
          difficultyAtTime: question.difficulty,
          responseTimeMs: r.responseTimeMs ?? null,
        },
      });
    } catch (err) {
      // P2002 = unique constraint hit — a concurrent duplicate submit request
      // for this attempt slipped past the earlier "already COMPLETED" check.
      if (err.code === 'P2002') {
        throw new ApiError(400, 'This assessment attempt is already being submitted.');
      }
      throw err;
    }

    const stat = competencyStats.get(question.competencyId) || {
      correct: 0,
      total: 0,
      name: question.competency.name,
    };
    stat.total += 1;
    if (isCorrect) stat.correct += 1;
    competencyStats.set(question.competencyId, stat);
  }

  const competencyBreakdown = [];
  for (const [competencyId, stat] of competencyStats.entries()) {
    const accuracy = (stat.correct / stat.total) * 100;

    const existing = await prisma.learnerCompetency.findUnique({
      where: { userId_competencyId: { userId: req.user.id, competencyId } },
    });
    const before = existing?.currentLevel ?? 40;
    const after = clampLevel(before * 0.4 + accuracy * 0.6);

    await prisma.learnerCompetency.upsert({
      where: { userId_competencyId: { userId: req.user.id, competencyId } },
      update: { currentLevel: after, lastAssessedAt: new Date() },
      create: { userId: req.user.id, competencyId, currentLevel: after, requiredLevel: 65 },
    });

    competencyBreakdown.push({ competencyId, competency: stat.name, before, after, accuracy: Math.round(accuracy) });
  }

  const score = (correctCount / responses.length) * 100;

  const updatedAttempt = await prisma.assessmentAttempt.update({
    where: { id: attempt.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      score,
      performanceJson: { competencyBreakdown, correctCount, totalQuestions: responses.length },
    },
  });

  const skillGaps = await computeAndStoreSkillGaps(req.user.id);

  res.json({
    success: true,
    attempt: updatedAttempt,
    score: Math.round(score),
    correctCount,
    totalQuestions: responses.length,
    competencyBreakdown,
    skillGaps,
  });
});

module.exports = { startAssessment, submitAssessment };
