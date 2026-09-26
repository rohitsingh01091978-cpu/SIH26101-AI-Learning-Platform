# Test Report

## Summary

The backend was tested end-to-end against a **live PostgreSQL database** (not mocked)
using real HTTP requests. The frontend was verified with a full production build (static
correctness across all 2470+ modules) and a running dev server.

A later pass (UI/UX overhaul + final polish) **did** get live browser verification via a
connected Chrome instance — see "Final polish pass" below for what was actually clicked
through, and the real race-condition bug that pass found and fixed.

## Final polish pass — live browser verification

Logged in as `learner@demo.gov.in` in a real Chrome tab and drove: Login → Dashboard
(including the new "Your Biggest Opportunity" hero card and its "Why is X prioritized?"
evidence toggle) → Competency Intelligence → Skill Gaps → an AI-generated adaptive quiz
end-to-end (intro screen → 5 questions → adaptive difficulty stepping → Performance
Analysis results page with before/after deltas) → Learning Path (with per-step "Why this
recommendation?" evidence) → iGOT Courses. Then logged in as `admin@demo.gov.in` and
confirmed `/admin/dashboard` returns 200 while the learner token gets 403.

**Bug found and fixed**: `handleNext` in `AdaptiveQuiz.jsx` (and the equivalent
`handleSubmit` in `CompetencyAssessment.jsx`) had a real re-entrancy race — the Submit
button's `disabled` attribute only takes effect after React re-renders, so two clicks
fired in the same synchronous tick (reproduced deliberately via
`submitBtn.click(); submitBtn.click();`) both invoked the handler before the first
`await` resolved, submitting the same question/attempt twice. Verified against the live
DB: before the fix, a 5-question quiz recorded 6 `QuestionResponse` rows (accuracy showed
"5/6"). Fixed with a synchronous `useRef` re-entrancy guard on both pages, **and** a
Postgres-level defense-in-depth: `@@unique([quizAttemptId, quizQuestionId])` and
`@@unique([assessmentAttemptId, assessmentQuestionId])` on `QuestionResponse`, with both
controllers catching the resulting `P2002` and returning a clean 400 instead of a 500.
Re-tested with the identical deliberate double-click after the fix: exactly 1 response
recorded, confirmed via direct DB query.

Also confirmed: the new `competencyEvidence` field (AI Content Intelligence → "Why were
these competencies identified?") returns real verbatim sentences from an uploaded
document via `DemoAIProvider`, and the new `whyEvidence` field on learning-path
recommendations carries real `currentLevel`/`requiredLevel`/`gap`/`recentAccuracy`/
`priority` numbers through to the UI's expandable evidence panels — verified via curl
before and after the frontend integration.

One tool-level false alarm worth recording: the Chrome extension's screenshot capture
timed out intermittently throughout this session ("renderer may be frozen"), and clicks
occasionally didn't visually register. In every case, retrying the screenshot or driving
the click via `element.click()` in `javascript_tool` instead of simulated mouse
coordinates confirmed the page was never actually frozen — this was automation-tool
flakiness, not an application bug. Only the double-submit issue above was a genuine app
bug; everything else reproduced cleanly on retry.

## Environment

- PostgreSQL 17 installed locally via winget, running as a Windows service
- Database `sih26101`, role `sih_user`
- `npx prisma migrate dev` applied cleanly (migration `20260925151702_init`)
- `node prisma/seed.js` — seeded 33 competencies, 36 prototype iGOT courses, 1 admin, 4
  learners (one with the worked-example demo levels from the brief), a 10-question
  baseline assessment

## Backend: end-to-end golden path (live, via curl)

| Step | Endpoint | Result |
|---|---|---|
| Login | `POST /auth/login` | 200, JWT issued |
| Auth check | `GET /auth/me` | 200, profile returned |
| Competencies | `GET /competencies/me` | 200, 33 competencies with seeded levels |
| Skill gaps | `GET /skill-gaps` | 200, gaps computed live (e.g. SAS: 15 → 65 required → gap 50, NEEDS_IMPROVEMENT, HIGH priority) |
| Upload | `POST /materials/upload` (TXT) | 201, text extracted (1013 bytes → stored) |
| Analyze | `POST /materials/:id/analyze` | 200, DemoAIProvider produced a grounded summary, 12 topics, 6 identified competencies, difficulty MEDIUM |
| Generate quiz | `POST /quizzes/generate` (5 questions, MIXED) | 201, 5 cloze-style MCQs generated, each traceable to a source sentence |
| Start quiz | `POST /quizzes/:id/start` | 201, attempt created, first question at MEDIUM |
| Answer loop | `POST /quizzes/:id/answer` × 5 | Difficulty adapted correctly: MEDIUM → EASY after a wrong answer, EASY → MEDIUM after a right one, stayed at MEDIUM (floor never breached, no HARD questions existed in this small pool) |
| Finalize | (5th answer, `done: true`) | Competency levels updated from weighted accuracy: Survey Design 70→55 (wrong), Sampling 62→77 (right), Data Quality 55→40 (wrong), Python 58→73 (right) |
| Learning path | `GET /learning-path` | 200, ranked by priority×gap, top gap (SAS) correctly surfaced with a matched prototype course and a reason string citing actual levels |
| iGOT catalog | `GET /igot/courses` | 200, 36 courses, `source: "Prototype iGOT Catalog"` |
| Performance | `GET /performance` | 200, overallScore and totalQuizzesTaken reflect the attempt just completed |
| Admin dashboard | `GET /admin/dashboard` (as admin) | 200, totalLearners=4, averageCompetency, topSkillGaps, competencyDistribution by category, departmentStatistics — all aggregated live across all 4 seeded learners |

Test artifacts (the uploaded file and its quiz) were deleted and the affected learner's
competency levels were reset via re-seed after this run, so the demo database starts clean.

## Backend: error handling (live, via curl)

| Case | Expected | Actual |
|---|---|---|
| Wrong password | 401 | ✅ 401 |
| No Authorization header | 401 | ✅ 401 |
| Malformed JWT | 401 | ✅ 401 |
| Learner calling `/admin/dashboard` | 403 | ✅ 403 |
| Uploading a `.exe` file | 400 | ✅ 400 (MIME-type rejected before touching disk) |
| Unknown route | 404 | ✅ 404 |
| Duplicate registration email | 409 | ✅ 409 |

## Frontend

- `npm run build` (Vite production build): **passed**, 2470 modules transformed, no
  broken imports/exports, no syntax errors, across every page, component, service, and
  chart in the app.
- `npm run dev`: dev server starts cleanly on `:5173`, serves `index.html` (HTTP 200),
  proxies `/api/*` to the backend on `:5000`.
- **Visually verified live** (see "Final polish pass" above): Login, Dashboard,
  Competency Intelligence, Skill Gaps, AI Content Intelligence intro, the full adaptive
  quiz flow, Performance Analysis results, Learning Path, iGOT Courses, and the Admin
  Dashboard were all clicked through in a real connected Chrome tab, with the double-submit
  bug found and fixed as a direct result.

## Known limitation: not covered by live browser verification

The connected Chrome session disconnected before the full 22-step checklist below could
be finished end-to-end in one continuous run (it covered most steps individually across
two sessions, not the full sequence in one pass). Not independently re-verified in a
browser this pass: file upload through the native picker (verified via API instead — the
Claude in Chrome file-upload tool only accepts files pre-shared with the session, and the
project's test fixtures aren't in that allowlist), the Progress page after this pass's
edits, mobile/tablet breakpoints, and the Karmayogi AI Assistant panel's click-to-open
interaction (its logic was verified by direct inspection and by exercising the same
`getSkillGaps`/`getLearningPath`/`getPerformance` calls it uses). Recommended before a
live demo: open http://localhost:5173, click through `DEMO_GUIDE.md` once end-to-end
using an actual PDF/DOCX file, and check the browser console for warnings.
