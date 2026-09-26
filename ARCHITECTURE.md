# Architecture

## System overview

```
┌─────────────┐      HTTPS/JSON       ┌──────────────┐      Prisma       ┌────────────┐
│   React SPA │ ───────────────────▶ │  Express API │ ─────────────────▶│ PostgreSQL │
│  (Vite dev  │ ◀─────────────────── │  (Node.js)   │◀─────────────────│            │
│   server)   │      Bearer JWT       └──────┬───────┘                   └────────────┘
└─────────────┘                              │
                                              │ AIProvider interface
                                    ┌─────────┴─────────┐
                                    │                    │
                             DemoAIProvider       ExternalAIProvider
                          (offline extractive NLP)  (OpenAI-compatible API)
```

## Layering (backend)

- **routes/** — thin Express routers, one file per resource, mounted under `/api` in `routes/index.js`.
- **controllers/** — request/response handling, validation, orchestration. No SQL/Prisma calls live outside this + services layer.
- **services/** — reusable business logic shared by multiple controllers (`skillGapService`, `igotService`).
- **recommendations/** — the learning-path recommendation engine, built on top of `skillGapService` and `igotService`.
- **ai/** — the `AIProvider` abstraction (`AIProvider.js` interface, `DemoAIProvider.js`, `ExternalAIProvider.js`, `index.js` factory + fallback wrapper). Nothing outside this folder imports a concrete provider.
- **document/** — text extraction from PDF/DOCX/TXT (`textExtractor.js`).
- **middleware/** — `auth.js` (JWT verify + role guard), `upload.js` (multer config + file-type/size validation), `errorHandler.js`.
- **utils/** — `prisma.js` (singleton client), `competencyEngine.js` (gap/status/priority math, role→required-level mapping), `jwt.js`, `asyncHandler.js`, `ApiError.js`.

Every controller is wrapped in `asyncHandler`, so thrown `ApiError`s (or any rejected promise) land in the single `errorHandler` middleware — no route has to remember to try/catch.

## Data model (Prisma / PostgreSQL)

Core entities and how they connect:

```
User ──1:1── LearnerProfile
User ──1:N── LearnerCompetency ──N:1── Competency
User ──1:N── AssessmentAttempt ──N:1── Assessment ──1:N── AssessmentQuestion ──N:1── Competency
User ──1:N── LearningMaterial ──1:1── DocumentAnalysis
LearningMaterial ──1:N── Quiz ──1:N── QuizQuestion ──N:1── Competency
Quiz ──1:N── QuizAttempt ──1:N── QuestionResponse ──N:1── (AssessmentQuestion | QuizQuestion)
User ──1:N── SkillGap ──N:1── Competency
User ──1:N── LearningRecommendation ──N:1── Competency, N:1── Course
Competency ──1:N── Course (prototype iGOT catalog)
User ──1:N── LearningProgress ──N:1── Course
```

`QuestionResponse` is intentionally shared between assessment attempts and quiz attempts
(nullable FKs to each) rather than duplicated, since the grading/response shape is
identical — this is the one deliberate denormalization in the schema.

## Key algorithms

### Skill-gap calculation (`utils/competencyEngine.js`, `services/skillGapService.js`)

```
gap = clamp(requiredLevel - currentLevel, min 0)
status = gap <= 0 ? STRONG : gap <= 20 ? DEVELOPING : NEEDS_IMPROVEMENT
priority = f(gap, recentQuizAccuracyOnThatCompetency)
```

`requiredLevel` is derived from the learner's `targetRole` via a role→competency→level
lookup table (`ROLE_REQUIREMENTS`), falling back to a default proficiency bar (65) for any
role not explicitly modeled — so the app works for any free-text target role, not just the
three example roles. Gaps are recomputed on demand (every `GET /skill-gaps`,
`GET /learning-path`, and after every assessment/quiz submission), never cached stale.

### Adaptive quiz engine (`controllers/quizController.js`)

Each `QuizAttempt` tracks which questions have been answered. After each answer:

```
nextDifficulty = correct ? min(EASY→MEDIUM→HARD, +1) : max(EASY→MEDIUM→HARD, -1)
nextQuestion   = pick an unanswered question at nextDifficulty,
                 or the closest available difficulty if none remain at that level
```

When every question has been answered, the attempt is finalized: per-competency
before/after levels are computed from a **difficulty-weighted accuracy** (`EASY=1,
MEDIUM=1.5, HARD=2`), so getting a HARD question right moves the needle more than an EASY
one. The `LearnerCompetency.currentLevel` is updated from this, then `SkillGap` rows are
recomputed — so the whole gap/recommendation chain reacts to a single quiz attempt.

### AI content analysis & MCQ generation (`ai/DemoAIProvider.js`)

`DemoAIProvider` never calls an external API. It computes everything from the document
text itself:

- **Summary**: extractive — sentences scored by sum of top-keyword frequency, top N kept in original order.
- **Topics/keyTerms**: word-frequency ranking after stopword removal.
- **Concepts**: consecutive-capitalized-word phrase detection ("National Accounts", "Consumer Price Index").
- **Competencies identified**: keyword-dictionary match (`ai/competencyKeywords.js`) against the fixed competency taxonomy.
- **MCQs**: cloze-deletion — a sentence is picked, its key term/number/phrase is blanked, and three plausible distractors of the same type (other numbers, other proper phrases, or other keywords) are drawn from elsewhere in the document. The original sentence becomes the explanation, so every question is auditable back to its source.
- If a document is too short to yield the requested question count, a small, clearly-labelled supplementary bank (`ai/demoQuestionBank.js`, tagged `sourceReference: "Prototype demo bank"`) pads the remainder — it never pretends to be extracted from the file.

### AI provider fallback (`ai/index.js`)

`AI_PROVIDER=external` that fails to construct (missing key) or throws at call time
degrades to `DemoAIProvider` automatically, logged but not surfaced as a 500 — the demo
never breaks mid-presentation because of a network blip or missing key.

## Frontend architecture

- **`services/*.js`** — one thin wrapper per API resource around a shared `axios` instance (`services/api.js`) that attaches the JWT and redirects to `/login` on 401.
- **`context/AuthContext.jsx`** — holds the current user, exposes `login`/`logout`, rehydrates from `GET /auth/me` on load.
- **`layouts/AppLayout.jsx`** — sidebar navigation (role-aware: learner vs admin nav), used by every authenticated route. `AuthLayout.jsx` wraps `/login`.
- **`components/ProtectedRoute.jsx`** — redirects unauthenticated users to `/login` and role-mismatched users to their own home page.
- **`pages/*.jsx`** — one page per route, each owning its own loading/error/empty states (no global loading spinner masking errors).
- **`charts/*.jsx`** — thin Recharts wrappers (radar, bar, before/after) so pages stay declarative.

## Security

- Passwords hashed with bcrypt (`BCRYPT_SALT_ROUNDS`, default 10).
- JWT signed server-side (`JWT_SECRET`), verified on every protected route via `middleware/auth.js`; role checks via `requireRole(...)`.
- File uploads validated by MIME type and size (`middleware/upload.js`) before touching disk.
- No secrets ever sent to the frontend — `EXTERNAL_AI_API_KEY` and `JWT_SECRET` are read only server-side.
- CORS restricted to `FRONTEND_URL` (`CLIENT_URL` accepted as a legacy alias); localhost origins are allowed only outside production.
- Ownership checks on every resource controller (`material.userId !== req.user.id` etc.) — a learner can't read another learner's materials/quizzes/attempts by guessing an ID.
