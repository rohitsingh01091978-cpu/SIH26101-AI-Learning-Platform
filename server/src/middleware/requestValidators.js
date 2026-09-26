const { body } = require('express-validator');

// Request validation for the learner write endpoints. Rules are deliberately permissive about
// shape (the React client sends whole profile objects, nulls, numeric strings and -1 for
// "unanswered") and strict about type, range and length, so bad input becomes a clean 400
// instead of a database error. Unknown fields are ignored, as before.

const isIntLike = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isInteger(Number(v));
const inRange = (min, max) => (v) => isIntLike(v) && Number(v) >= min && Number(v) <= max;

const optionalText = (field, max) =>
  body(field)
    .optional({ nullable: true })
    .isString().withMessage(`${field} must be text.`).bail()
    .trim()
    .isLength({ max }).withMessage(`${field} must be at most ${max} characters.`);

const profileUpdate = [
  optionalText('name', 100),
  optionalText('department', 120),
  optionalText('organization', 120),
  optionalText('currentRole', 100),
  optionalText('targetRole', 100),
  optionalText('learningGoals', 1000),
  body('experience')
    .optional({ nullable: true })
    .custom((v) => v === '' || inRange(0, 60)(v))
    .withMessage('Experience must be a whole number of years between 0 and 60.'),
];

const progressStart = [
  body('courseId').isString().withMessage('courseId is required.').bail().trim().isLength({ min: 1, max: 64 }).withMessage('courseId is invalid.'),
  body('competencyId').optional({ nullable: true }).isString().isLength({ max: 64 }).withMessage('competencyId is invalid.'),
  body('recommendationId').optional({ nullable: true }).isString().isLength({ max: 64 }).withMessage('recommendationId is invalid.'),
];

const progressUpdate = [
  body('status').optional().isIn(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']).withMessage('status is invalid.'),
  body('progressPercent').optional().custom(inRange(0, 100)).withMessage('progressPercent must be a whole number between 0 and 100.'),
];

const answerValue = (field) =>
  body(field).custom(inRange(-1, 3)).withMessage(`${field} must be an option index (0-3), or -1 for unanswered.`);
const responseTime = (field) =>
  body(field).optional({ nullable: true }).custom(inRange(0, 3600000)).withMessage(`${field} is invalid.`);

const assessmentSubmit = [
  body('attemptId').isString().withMessage('attemptId is required.').bail().isLength({ min: 1, max: 64 }),
  body('responses').isArray({ min: 1, max: 100 }).withMessage('responses must be a list of 1 to 100 answers.'),
  body('responses.*.questionId').isString().isLength({ min: 1, max: 64 }).withMessage('questionId is invalid.'),
  answerValue('responses.*.selectedAnswer'),
  responseTime('responses.*.responseTimeMs'),
];

const quizGenerate = [
  body('materialId').isString().withMessage('materialId is required.').bail().isLength({ min: 1, max: 64 }),
  body('count').optional().custom((v) => [5, 10, 20].includes(Number(v))).withMessage('count must be 5, 10, or 20.'),
  body('difficulty').optional().isIn(['EASY', 'MEDIUM', 'HARD', 'MIXED']).withMessage('difficulty is invalid.'),
  body('title').optional({ nullable: true }).isString().trim().isLength({ max: 120 }).withMessage('title must be at most 120 characters.'),
];

const quizAnswer = [
  body('attemptId').isString().withMessage('attemptId is required.').bail().isLength({ min: 1, max: 64 }),
  body('questionId').isString().withMessage('questionId is required.').bail().isLength({ min: 1, max: 64 }),
  answerValue('selectedAnswer'),
  responseTime('responseTimeMs'),
];

const quizSubmit = [body('attemptId').isString().withMessage('attemptId is required.').bail().isLength({ min: 1, max: 64 })];

module.exports = { profileUpdate, progressStart, progressUpdate, assessmentSubmit, quizGenerate, quizAnswer, quizSubmit };
