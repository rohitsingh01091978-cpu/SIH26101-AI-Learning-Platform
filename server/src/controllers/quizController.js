const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { runCoreAI } = require('../ai');
const { reserveAiQuota, FEATURES } = require('../services/aiQuota');
const { clampLevel } = require('../utils/competencyEngine');
const { computeAndStoreSkillGaps } = require('../services/skillGapService');

const DIFFICULTY_ORDER = ['EASY', 'MEDIUM', 'HARD'];
const DIFFICULTY_WEIGHT = { EASY: 1, MEDIUM: 1.5, HARD: 2 };

const sanitizeQuestion = (q) => ({
  id: q.id,
  question: q.question,
  options: q.options,
  topic: q.topic,
  difficulty: q.difficulty,
  competency: q.competency?.name || null,
});

function nextDifficulty(current, isCorrect) {
  const idx = DIFFICULTY_ORDER.indexOf(current);
  const nextIdx = isCorrect ? Math.min(idx + 1, 2) : Math.max(idx - 1, 0);
  return DIFFICULTY_ORDER[nextIdx];
}

function pickNextQuestion(questions, answeredIds, targetDifficulty) {
  const candidates = questions.filter((q) => !answeredIds.has(q.id));
  if (!candidates.length) return null;
  const preferred = candidates.filter((q) => q.difficulty === targetDifficulty);
  if (preferred.length) return preferred[0];

  const targetIdx = DIFFICULTY_ORDER.indexOf(targetDifficulty);
  return [...candidates].sort(
    (a, b) => Math.abs(DIFFICULTY_ORDER.indexOf(a.difficulty) - targetIdx) - Math.abs(DIFFICULTY_ORDER.indexOf(b.difficulty) - targetIdx)
  )[0];
}

const generateQuiz = asyncHandler(async (req, res) => {
  const { materialId, count = 10, difficulty = 'MIXED', title } = req.body;

  if (!materialId) throw new ApiError(400, 'materialId is required.');
  if (![5, 10, 20].includes(Number(count))) {
    throw new ApiError(400, 'count must be 5, 10, or 20.');
  }

  const material = await prisma.learningMaterial.findUnique({ where: { id: materialId } });
  if (!material || material.userId !== req.user.id) {
    throw new ApiError(404, 'Material not found.');
  }
  if (!material.extractedText) {
    throw new ApiError(400, 'This material has no extracted text to generate questions from.');
  }

  // Daily quota first (clear 429 if used up), then the AI call.
  const usage = await reserveAiQuota(req.user.id, FEATURES.GENERATE_MCQS);
  let generated;
  let aiProvider;
  try {
    ({ result: generated, provider: aiProvider } = await usage.run(() =>
      runCoreAI('generateMCQs', material.extractedText, { count: Number(count), difficulty })
    ));
    await usage.succeed({ provider: aiProvider });
  } catch (err) {
    await usage.fail(err);
    throw err;
  }

  if (!generated.length) {
    throw new ApiError(422, 'Could not generate any questions from this material.');
  }

  const competencies = await prisma.competency.findMany();
  const competencyByName = new Map(competencies.map((c) => [c.name, c.id]));

  const quiz = await prisma.quiz.create({
    data: {
      materialId: material.id,
      userId: req.user.id,
      title: title || `Quiz: ${material.originalName}`,
      difficultyMode: difficulty,
      questionCount: generated.length,
      questions: {
        create: generated.map((q, idx) => ({
          competencyId: competencyByName.get(q.competency) || null,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          topic: q.topic,
          difficulty: q.difficulty,
          sourceReference: q.sourceReference,
          orderIndex: idx,
        })),
      },
    },
    include: { questions: { include: { competency: true } } },
  });

  res.status(201).json({
    success: true,
    quiz: {
      id: quiz.id,
      title: quiz.title,
      difficultyMode: quiz.difficultyMode,
      questionCount: quiz.questionCount,
      createdAt: quiz.createdAt,
    },
    questions: quiz.questions.map(sanitizeQuestion),
    aiProvider,
  });
});

const getQuiz = asyncHandler(async (req, res) => {
  const quiz = await prisma.quiz.findUnique({
    where: { id: req.params.id },
    include: { questions: { include: { competency: true }, orderBy: { orderIndex: 'asc' } } },
  });
  if (!quiz || quiz.userId !== req.user.id) throw new ApiError(404, 'Quiz not found.');

  res.json({
    success: true,
    quiz: {
      id: quiz.id,
      title: quiz.title,
      difficultyMode: quiz.difficultyMode,
      questionCount: quiz.questionCount,
      createdAt: quiz.createdAt,
    },
    questions: quiz.questions.map(sanitizeQuestion),
  });
});

const startQuiz = asyncHandler(async (req, res) => {
  const quiz = await prisma.quiz.findUnique({
    where: { id: req.params.id },
    include: { questions: { include: { competency: true } } },
  });
  if (!quiz || quiz.userId !== req.user.id) throw new ApiError(404, 'Quiz not found.');
  if (!quiz.questions.length) throw new ApiError(400, 'This quiz has no questions.');

  const competencyIds = [...new Set(quiz.questions.map((q) => q.competencyId).filter(Boolean))];
  const learnerCompetencies = await prisma.learnerCompetency.findMany({
    where: { userId: req.user.id, competencyId: { in: competencyIds } },
  });
  const beforeLevels = Object.fromEntries(learnerCompetencies.map((lc) => [lc.competencyId, lc.currentLevel]));

  const attempt = await prisma.quizAttempt.create({
    data: { quizId: quiz.id, userId: req.user.id, status: 'IN_PROGRESS', beforeLevels },
  });

  const startDifficulty = 'MEDIUM';
  const firstQuestion = pickNextQuestion(quiz.questions, new Set(), startDifficulty);

  res.status(201).json({
    success: true,
    attemptId: attempt.id,
    progress: { answered: 0, total: quiz.questions.length },
    currentDifficulty: firstQuestion?.difficulty || startDifficulty,
    question: firstQuestion ? sanitizeQuestion(firstQuestion) : null,
  });
});

async function finalizeAttempt(attempt, quiz) {
  if (attempt.status === 'COMPLETED') {
    return attempt.performanceJson;
  }

  const responses = await prisma.questionResponse.findMany({
    where: { quizAttemptId: attempt.id },
    include: { quizQuestion: { include: { competency: true } } },
  });

  const correctCount = responses.filter((r) => r.isCorrect).length;
  const incorrectCount = responses.length - correctCount;
  const accuracy = responses.length ? (correctCount / responses.length) * 100 : 0;
  const score = accuracy;

  const byCompetency = new Map();
  const byDifficulty = { EASY: { correct: 0, total: 0 }, MEDIUM: { correct: 0, total: 0 }, HARD: { correct: 0, total: 0 } };

  for (const r of responses) {
    const diff = r.difficultyAtTime || r.quizQuestion.difficulty;
    byDifficulty[diff].total += 1;
    if (r.isCorrect) byDifficulty[diff].correct += 1;

    const compId = r.quizQuestion.competencyId;
    if (!compId) continue;
    const entry = byCompetency.get(compId) || {
      name: r.quizQuestion.competency.name,
      weightedCorrect: 0,
      weightedTotal: 0,
      correct: 0,
      total: 0,
    };
    const weight = DIFFICULTY_WEIGHT[diff] || 1;
    entry.weightedTotal += weight;
    entry.total += 1;
    if (r.isCorrect) {
      entry.weightedCorrect += weight;
      entry.correct += 1;
    }
    byCompetency.set(compId, entry);
  }

  const beforeLevels = attempt.beforeLevels || {};
  const competencyBreakdown = [];

  for (const [competencyId, entry] of byCompetency.entries()) {
    const weightedAccuracy = (entry.weightedCorrect / entry.weightedTotal) * 100;
    const before = beforeLevels[competencyId] ?? 40;
    const delta = Math.round((weightedAccuracy - 50) * 0.3);
    const after = clampLevel(before + delta);

    await prisma.learnerCompetency.upsert({
      where: { userId_competencyId: { userId: attempt.userId, competencyId } },
      update: { currentLevel: after, lastAssessedAt: new Date() },
      create: { userId: attempt.userId, competencyId, currentLevel: after, requiredLevel: 65 },
    });

    competencyBreakdown.push({
      competencyId,
      competency: entry.name,
      before,
      after,
      change: after - before,
      accuracy: Math.round((entry.correct / entry.total) * 100),
      questionsAnswered: entry.total,
    });
  }

  const difficultyBreakdown = Object.entries(byDifficulty).map(([difficulty, v]) => ({
    difficulty,
    total: v.total,
    correct: v.correct,
    accuracy: v.total ? Math.round((v.correct / v.total) * 100) : null,
  }));

  const performance = {
    score: Math.round(score),
    accuracy: Math.round(accuracy),
    correctCount,
    incorrectCount,
    totalQuestions: responses.length,
    competencyBreakdown,
    difficultyBreakdown,
    improvementAreas: competencyBreakdown.filter((c) => c.accuracy < 60).map((c) => c.competency),
  };

  await prisma.quizAttempt.update({
    where: { id: attempt.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      score: performance.score,
      accuracy: performance.accuracy,
      correctCount,
      incorrectCount,
      performanceJson: performance,
    },
  });

  await computeAndStoreSkillGaps(attempt.userId);

  return performance;
}

const answerQuestion = asyncHandler(async (req, res) => {
  const { attemptId, questionId, selectedAnswer, responseTimeMs } = req.body;
  if (!attemptId || !questionId || selectedAnswer === undefined) {
    throw new ApiError(400, 'attemptId, questionId, and selectedAnswer are required.');
  }

  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: { quiz: { include: { questions: { include: { competency: true } } } } },
  });
  if (!attempt || attempt.userId !== req.user.id || attempt.quizId !== req.params.id) {
    throw new ApiError(404, 'Quiz attempt not found.');
  }
  if (attempt.status === 'COMPLETED') {
    throw new ApiError(400, 'This quiz attempt has already been completed.');
  }

  const question = attempt.quiz.questions.find((q) => q.id === questionId);
  if (!question) throw new ApiError(404, 'Question not found in this quiz.');

  const alreadyAnswered = await prisma.questionResponse.findFirst({
    where: { quizAttemptId: attempt.id, quizQuestionId: question.id },
  });
  if (alreadyAnswered) throw new ApiError(400, 'This question has already been answered in this attempt.');

  const isCorrect = Number(selectedAnswer) === question.correctAnswer;

  try {
    await prisma.questionResponse.create({
      data: {
        quizAttemptId: attempt.id,
        quizQuestionId: question.id,
        selectedAnswer: Number(selectedAnswer),
        isCorrect,
        difficultyAtTime: question.difficulty,
        responseTimeMs: responseTimeMs ?? null,
      },
    });
  } catch (err) {
    // P2002 = unique constraint hit — a concurrent duplicate request for the
    // same question slipped past the findFirst check above (TOCTOU race).
    if (err.code === 'P2002') {
      throw new ApiError(400, 'This question has already been answered in this attempt.');
    }
    throw err;
  }

  const answeredIds = new Set([
    ...(await prisma.questionResponse.findMany({ where: { quizAttemptId: attempt.id }, select: { quizQuestionId: true } })).map(
      (r) => r.quizQuestionId
    ),
  ]);

  const feedback = { isCorrect, correctAnswer: question.correctAnswer, explanation: question.explanation };

  if (answeredIds.size >= attempt.quiz.questions.length) {
    const performance = await finalizeAttempt(attempt, attempt.quiz);
    return res.json({
      success: true,
      done: true,
      feedback,
      progress: { answered: answeredIds.size, total: attempt.quiz.questions.length },
      result: performance,
    });
  }

  const target = nextDifficulty(question.difficulty, isCorrect);
  const nextQuestion = pickNextQuestion(attempt.quiz.questions, answeredIds, target);

  res.json({
    success: true,
    done: false,
    feedback,
    currentDifficulty: nextQuestion?.difficulty || target,
    progress: { answered: answeredIds.size, total: attempt.quiz.questions.length },
    question: nextQuestion ? sanitizeQuestion(nextQuestion) : null,
  });
});

const submitQuiz = asyncHandler(async (req, res) => {
  const { attemptId } = req.body;
  if (!attemptId) throw new ApiError(400, 'attemptId is required.');

  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: { quiz: { include: { questions: { include: { competency: true } } } } },
  });
  if (!attempt || attempt.userId !== req.user.id || attempt.quizId !== req.params.id) {
    throw new ApiError(404, 'Quiz attempt not found.');
  }

  const performance = await finalizeAttempt(attempt, attempt.quiz);
  res.json({ success: true, result: performance });
});

module.exports = { generateQuiz, getQuiz, startQuiz, answerQuestion, submitQuiz };
