# API Documentation

Base URL: `http://localhost:5000/api` (dev). All authenticated routes require
`Authorization: Bearer <token>`. All responses are JSON with a `success: boolean` field;
errors return `{ success: false, message: string, details?: any }` with an appropriate
HTTP status code (400/401/403/404/409/422/500).

## Auth

### `POST /auth/register`
Body: `{ email, password (min 8 chars), name, role? }` → `201 { success, token, user }`

### `POST /auth/login`
Body: `{ email, password }` → `200 { success, token, user }`

### `GET /auth/me` 🔒
→ `200 { success, user: { id, email, name, role, profile } }`

## Profile 🔒 (all routes require auth)

### `GET /profile`
→ `{ success, profile }`

### `PUT /profile`
Body: any of `{ name, department, organization, experience, currentRole, targetRole, learningGoals }`
→ `{ success, profile }`. Changing `targetRole` immediately recomputes every required
competency level and skill gap for the learner.

## Competencies 🔒

### `GET /competencies`
→ `{ success, competencies: Competency[] }` — the full 33-competency taxonomy.

### `GET /competencies/me`
→ `{ success, competencies: LearnerCompetency[] }` — the caller's own levels.

## Assessment 🔒

### `POST /assessment/start`
→ `201 { success, attemptId, assessment, questions: Question[] (no correctAnswer) }`

### `POST /assessment/submit`
Body: `{ attemptId, responses: [{ questionId, selectedAnswer, responseTimeMs? }] }`
→ `{ success, attempt, score, correctCount, totalQuestions, competencyBreakdown, skillGaps }`

## Skill Gaps 🔒

### `GET /skill-gaps`
→ `{ success, skillGaps: SkillGap[] }` — recomputed live from current competency levels and target role, not cached.

## Learning Materials 🔒

### `POST /materials/upload`
`multipart/form-data`, field `file` (PDF/DOCX/TXT, ≤10MB) → `201 { success, material }`.
Text is extracted synchronously; material status becomes `UPLOADED` (ready to analyze) or `FAILED`.

### `GET /materials`
→ `{ success, materials: Material[] }` (extractedText omitted from list payload)

### `GET /materials/:id`
→ `{ success, material }` (includes `analysis` and `quizzes` if present)

### `POST /materials/:id/analyze`
→ `{ success, analysis, aiProvider }`. Runs the active `AIProvider.analyzeDocument()`.

## Quizzes 🔒

### `POST /quizzes/generate`
Body: `{ materialId, count: 5|10|20, difficulty: 'EASY'|'MEDIUM'|'HARD'|'MIXED', title? }`
→ `201 { success, quiz, questions (no answers), aiProvider }`

### `GET /quizzes/:id`
→ `{ success, quiz, questions (no answers) }`

### `POST /quizzes/:id/start`
→ `201 { success, attemptId, progress, currentDifficulty, question (no answer) }`

### `POST /quizzes/:id/answer`
Body: `{ attemptId, questionId, selectedAnswer, responseTimeMs? }`
→ `{ success, done, feedback: { isCorrect, correctAnswer, explanation }, progress, currentDifficulty?, question? }`
or, when `done: true`: `{ success, done: true, feedback, progress, result: PerformanceReport }`

> This endpoint is an addition beyond the base spec, needed to implement genuine
> per-question adaptive difficulty (the spec's four quiz endpoints — generate/get/start/submit — are all present; `/answer` is the interactive step between `start` and `submit`).

### `POST /quizzes/:id/submit`
Body: `{ attemptId }` → `{ success, result: PerformanceReport }`. Idempotent — if the
attempt was already completed via `/answer` reaching the last question, returns the same
stored result; otherwise finalizes based on whatever was answered so far (early-exit).

`PerformanceReport` shape:
```json
{
  "score": 80, "accuracy": 80, "correctCount": 4, "incorrectCount": 1, "totalQuestions": 5,
  "competencyBreakdown": [{ "competency": "Python", "before": 58, "after": 66, "change": 8, "accuracy": 100, "questionsAnswered": 2 }],
  "difficultyBreakdown": [{ "difficulty": "EASY", "total": 2, "correct": 2, "accuracy": 100 }],
  "improvementAreas": ["Data Quality"]
}
```

## Performance 🔒

### `GET /performance`
→ `{ success, overallScore, avgQuizAccuracy, totalQuizzesTaken, totalAssessmentsTaken, totalMaterialsUploaded, recentQuizAttempts, recentAssessmentAttempts, competencies }`

## Learning Path & Recommendations 🔒

### `GET /learning-path`
→ `{ success, learningPath: [{ priority, competency, course, reason, currentLevel, requiredLevel, expectedImprovement, difficulty, estimatedDurationHrs }] }`
Fully recomputed on every call from live skill gaps + the prototype iGOT catalog.

### `GET /recommendations`
→ `{ success, recommendations: LearningRecommendation[] }` (same engine, raw DB shape with `course`/`competency` includes)

## Progress 🔒

### `GET /progress` → `{ success, progress: LearningProgress[] }`
### `POST /progress` — Body: `{ courseId, competencyId?, recommendationId? }` → `201 { success, progress }`
### `PUT /progress/:id` — Body: `{ status?, progressPercent? }` → `{ success, progress }`

## iGOT Karmayogi (prototype catalog) 🔒

### `GET /igot/courses?competencyId=&level=`
→ `{ success, courses, source: "Prototype iGOT Catalog", live: false }`

### `GET /igot/search?q=`
→ `{ success, courses, source, live }`

`live` is `true` only if `IGOT_API_BASE_URL`/`IGOT_API_KEY` are configured — they are not
in this prototype, so this always reports the prototype catalog.

## Assistant 🔒 (role: LEARNER)

### `POST /assistant/chat`
Body: `{ "message": string (1-1000 chars), "history"?: [{ "role": "user"|"assistant", "text": string }] }`
→ `{ success, reply, provider: "demo"|"external", fellBack: boolean, courseSource: "Prototype iGOT Catalog", liveIgot: false }`

The learner is always the authenticated user (from the JWT); no learner id is accepted in the body.
The reply is composed from that learner's own profile, competency levels, skill gaps, stored learning path,
progress, recent assessment/quiz results and material analyses. `provider: "demo"` is the offline rule-based
engine (no language model); `"external"` means the configured external model was sent the learner's data;
`fellBack: true` means the external model failed and the offline engine answered. Errors: `400` invalid message,
`401` unauthenticated, `403` not a learner, `429` more than 20 messages/minute, `503` assistant unavailable.

## Admin 🔒 (role: ADMIN)

### `GET /admin/dashboard`
→ `{ success, totalLearners, activeLearners, averageCompetency, assessmentCompletionRate, completedAssessments, totalUploadedMaterials, topSkillGaps, competencyDistribution, departmentStatistics, learningProgress }`
All figures computed live from the database — nothing hardcoded.

## Health check (no auth)

### `GET /health` → `{ status: "ok", service, aiProvider, timestamp }`
