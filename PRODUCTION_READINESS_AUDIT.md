# Production Readiness Audit — SIH26101 AI Learning & Competency Intelligence Platform

Audit date: 2026-09-26 · Code audited: `main` @ `22046a8` · Phase 1 of the production-hardening plan (**no code was changed**).

## 0. Scope, method and limits

**What was inspected:** every server module (`server/src`, ~3.8k lines), the Prisma schema and all 4 migrations, the seed script, the React client (`client/src`, ~4.6k lines), deployment config (`railway.json`, `vercel.json`, env templates), the 59-test suite, and the repo's docs. **Read-only** probes were made against the live production site and backend (headers, health, CORS, route availability, error responses) and a local instance was used to confirm specific behaviours.

**What could NOT be verified (needs your confirmation):**
- Whether the demo accounts (`admin@demo.gov.in`, `learner@demo.gov.in`, …) exist in the **production** database. `DEPLOYMENT.md` says the seed was run once, so this is very likely. I did not log in to production. Read-only check: `SELECT email, role FROM users WHERE email LIKE '%@demo.gov.in';`
- Railway variable values, Postgres plan/backups, resource limits, replica count.
- Real-device mobile behaviour; accessibility (WCAG) was not audited.

**Classification key**
`[1]` Production-ready · `[2]` Prototype/demo · `[3]` Missing · `[4]` Needs external credentials/API · `[5]` Needs infrastructure upgrade. A feature can carry several tags; the first is the primary status.

## 1. Executive summary

The application is a **well-built, secure-by-default prototype** with a solid skeleton (auth, RBAC, ownership checks, OAuth, migrations, tests) but its *substance* is still demo-grade:

1. **Production is running `AI_PROVIDER=demo`** (confirmed live: `GET /api/health` → `"aiProvider":"demo"`). Document analysis, MCQ generation and the assistant are rule-based, and if an external provider is ever configured but fails, the code **silently falls back to the demo engine** — including a canned question bank — which then feeds real learners' competency scores.
2. **Competency scores are not yet trustworthy.** The only assessment is **10 questions covering 10 of 33 competencies (one question each)**, blended with an **invented baseline of 40**. The other 23 competencies have no data until quizzes on uploaded documents (auto-generated, uncalibrated) nudge them.
3. **Users can't recover accounts** (no password reset, no email verification, no deletion) and there is **no email infrastructure**.
4. **Uploaded files sit on an ephemeral container disk** with no delete, no ownership-scoped download, weak type checks, and an unmaintained PDF parser.
5. **The iGOT "catalog" is 36 invented prototype courses.** There is no official API access; labelling is mostly honest but has one latent mislabelling bug (§4.7).
6. **No cost controls** on AI-backed endpoints, **no observability** (no request IDs, monitoring, or structured logs), **no CI**.

**Production readiness: ≈ 48 %** (weighted estimate, method in §9). Safe for a *supervised pilot with known users*; **not** ready for open public use with real personal data and a paid AI provider.

## 2. Feature classification

| # | Area | Feature | Class | Evidence / finding |
|---|---|---|---|---|
| 1 | Auth | Email/password login (bcrypt, generic 401, timing-equalised) | **[1]** | `authController.js`; tested |
| 2 | Auth | Registration (always LEARNER, validated) | **[1]** | Works. **[3]** no email verification |
| 3 | Auth | Google OAuth (code+PKCE, state, nonce, ID-token checks, safe linking) | **[1]** | Live on production (route returns 302 to Google). Verified working by you |
| 4 | Auth | Set/change password (recent-session rule, rate limited) | **[1]** | `POST /auth/password` |
| 5 | Auth | Forgot/reset password | **[3][4]** | Missing; needs an email provider |
| 6 | Auth | Email verification | **[3][4]** | Missing |
| 7 | Auth | Account deletion/deactivation | **[3]** | Missing (schema cascades exist, no endpoint/UI) |
| 8 | Auth | Session: 7-day JWT in localStorage, HS256 pinned | **[1]** (documented trade-off) | No revocation/“log out everywhere”; no refresh tokens |
| 9 | Auth | Brute-force limits | **[1] [5]** | express-rate-limit, **in-memory** → resets on restart, per-instance |
| 10 | Authz | RBAC learner/admin; ownership checks on materials, quizzes, attempts, progress, assistant | **[1]** | Read all controllers: every by-id lookup checks `userId` |
| 11 | Authz | Admin account provisioning | **[2]** | Only via seed script; **documented public demo admin password** |
| 12 | API | Helmet, HSTS, CORS allow-list, JSON errors hide internals in prod | **[1]** | Verified live headers |
| 13 | API | Input validation | **[2]** | Auth endpoints validated; **profile, progress, assessment, quiz endpoints not** (§4.6) |
| 14 | API | Request IDs, structured logging, audit log | **[3]** | Only `morgan` + 14 `console.*` calls |
| 15 | API | Health check | **[2]** | Static `{"status":"ok"}` – does not test the database; exposes `aiProvider` |
| 16 | AI | Provider abstraction (`AIProvider`) | **[1]** | Clean; `withAIFallbackMeta` reports actual provider |
| 17 | AI | DemoAIProvider (extractive NLP, cloze MCQs, rule-based assistant) | **[2]** | Fine for dev/fallback; **not** for production |
| 18 | AI | ExternalAIProvider (OpenAI-compatible) | **[2][4]** | Exists for analysis, MCQs, assistant but: no retry, no output validation, no token cap, no timeout on analysis/MCQ calls, no usage log; env names `EXTERNAL_AI_*` |
| 19 | AI | Real-AI credentials | **[4]** | None configured (`AI_PROVIDER=demo` live) |
| 20 | AI | Cost control / quotas | **[3]** | Only the assistant is rate-limited; `/materials/:id/analyze`, `/quizzes/generate`, `/materials/upload` are **unlimited** |
| 21 | Docs | Upload (multer, 10 MB, pdf/docx/txt by extension + client MIME) | **[2][5]** | No magic-byte check, no AV scan, no per-user quota |
| 22 | Docs | Text extraction (`pdf-parse` 1.1.1, `mammoth`) | **[2]** | `pdf-parse` is **unmaintained since 2018** (pdf.js 1.10), runs in-process with no timeout; fails intermittently on very small PDFs |
| 23 | Docs | File storage | **[5]** | Container disk (ephemeral); `DEPLOYMENT.md` admits it. No download, **no delete endpoint**, orphan cleanup absent |
| 24 | Docs | Full extracted text stored in Postgres | **[2]** | Privacy/size concern; no retention policy |
| 25 | Docs | AI content analysis + evidence | **[2]** | Works; AI output is **not schema-validated** before `prisma.upsert(...result)` |
| 26 | Quiz | MCQ generation | **[2]** | Demo path pads with a **canned question bank** and defaults competency to "Data Quality" |
| 27 | Quiz | Adaptive difficulty (per-answer up/down) | **[1]** | Logic sound and race-safe (unique constraints) |
| 28 | Assess | Baseline assessment | **[2]** | 1 assessment, **10 questions, 1 per competency, 10 of 33 competencies** |
| 29 | Assess | Competency score updates | **[2]** | `before ?? 40` invented baseline; `after = 0.4·before + 0.6·accuracy` from a single question; quiz delta `(acc−50)·0.3` |
| 30 | Engine | Skill-gap engine | **[1]** with **[2]** inputs | Math is clear; required levels come from a hard-coded `ROLE_REQUIREMENTS` table (few roles, default 65) |
| 31 | Engine | Recommendation engine / learning path | **[2]** | Works, but **GET /learning-path deletes and recreates rows on every request**; ~100 queries per call (N+1) |
| 32 | iGOT | Catalog (36 courses, `source = "Prototype iGOT Catalog"`) | **[2][4]** | Invented content; no official API access |
| 33 | iGOT | Provider interface | **[2]** | Clean seam in `igotService.js`, but `live` is derived from *env vars*, not from actually calling iGOT (§4.7) |
| 34 | Assistant | Conversational assistant, grounded, per-learner, rate-limited | **[1]** (logic) / **[2]** (demo engine) | Tested; honest provider labels; no persistence (by design) |
| 35 | Progress | Course progress tracking | **[2]** | Works; enum/FK inputs unvalidated → 500 |
| 36 | Admin | Dashboard | **[2]** | Aggregates only (no PII). Loads **whole tables into memory**; demo users included; no trends over time, no material metadata, no course/recommendation usage |
| 37 | Data | Prisma schema + migrations | **[1]** | Sound relations and cascades. **No FK/query indexes** (0 `@@index`) |
| 38 | Data | Seed data | **[2]** | 33 competencies (reference), 36 fake courses, 5 demo accounts; run manually |
| 39 | Ops | Monitoring/alerting/uptime | **[3][4]** | None |
| 40 | Ops | Backups / recovery | **[5]** | Not defined in repo; depends on Railway plan – unverified |
| 41 | Ops | CI/CD, lint, frontend tests, e2e | **[3]** | None (`.github` absent; ESLint config absent) |
| 42 | Ops | Multi-instance readiness | **[5]** | Rate limits and OAuth handoff codes are in-memory |
| 43 | Frontend | Login/Register/Google/callback, two-step login | **[1]** | Verified in a real browser locally |
| 44 | Frontend | Error handling | **[2]** | Axios 401 redirect + friendly messages exist; **no ErrorBoundary**, no offline state, some pages silent on failure |
| 45 | Frontend | Performance | **[2]** | Single 785 kB JS bundle (no code splitting) |
| 46 | Frontend | CSP | **[3]** | Vercel sends X-Frame/nosniff/referrer/permissions/HSTS but **no Content-Security-Policy** |
| 47 | Frontend | Prototype branding | **[2]** | "Prototype build", "For demonstration purposes", DEMO PROFILE, "prototype" copy in 6 places |

## 3. What is already production-grade (keep as is)
Password hashing (bcrypt) and generic auth errors · JWT algorithm pinning · OAuth with state/nonce/PKCE and one-time handoff · rate limiting on auth/assistant · Helmet/HSTS/CORS allow-list (verified live) · consistent ownership checks (no IDOR found in materials, quizzes, attempts, progress, assistant) · prod error masking · additive Prisma migrations applied on deploy · env validation at start-up · 0 known vulnerabilities in `npm audit --omit=dev` (server and client) · 59 automated tests including cross-user isolation.

## 4. Detailed findings

### 4.1 AI (Phase 2 / 13)
- Production = demo provider. `getAIProvider()` also **silently falls back to demo when `AI_PROVIDER=external` but keys are missing**, and `withAIFallback*` falls back on any runtime failure. In production that means canned/rule-based output is presented to real learners (analysis and MCQs report `aiProvider: getAIProvider().name()` = `external` even after a fallback — **mislabelled**; only the assistant reports the true provider).
- ExternalAIProvider gaps: no retries/backoff; no request timeout on analysis/MCQ (only assistant has 25 s); `response_format: json_object` but **no schema validation** of analysis output (bad shapes reach Prisma → 500); no `max_tokens`; no usage/cost logging; text truncated at 12 000 chars silently; env names `EXTERNAL_AI_BASE_URL/API_KEY/MODEL` differ from the proposed `AI_BASE_URL/AI_API_KEY/AI_MODEL`.
- No per-user AI quotas; only `/assistant/chat` is limited (20/min).

### 4.2 Users / accounts (Phase 3 / 10)
Registration, login, Google, logout, set/change password, linking, rate limiting all exist. Missing: password reset, email verification, deletion/deactivation, `lastLoginAt`, session revocation (a changed password does not invalidate existing 7-day tokens), email delivery. `POST /auth/register` returns 409 for existing emails (enumeration; rate-limited).

### 4.3 Documents & storage (Phase 4)
Files are written to `server/uploads` on the container disk. No endpoint downloads or deletes them; nothing cleans abandoned files; a redeploy loses them (analysis survives because text is in Postgres). Validation trusts the client MIME type and file extension (no magic-byte sniffing); no antivirus; no per-user count/size quota; `pdf-parse` (2018) parses untrusted PDFs in the API process. **`GET /materials` returns the server-side `filePath` and stored `fileName` to the browser** (confirmed locally).

### 4.4 Data validity (Phase 5 / 6)
- Baseline assessment: 10 questions, one per competency, 10/33 competencies covered. Accuracy of a single question is 0 % or 100 %, so a learner's first score for a competency is **16 or 76**, mixed with the invented prior 40.
- Quiz scoring modifies real competency levels from auto-generated questions with no calibration; unmapped questions (competency `null`) are ignored; demo MCQ generation defaults to "Data Quality" when it cannot detect a competency (fabricated tag affecting a real score).
- Role requirement table is hard-coded for a handful of roles; any other free-text target role silently uses 65 for everything.
- No indexes on `userId`/FK columns: fine at hundreds of rows, slow at tens of thousands.
- Read paths that write: `GET /skill-gaps`, `GET /learning-path`, and assistant first-use recompute (upserts / delete+create) — contention and cost as users grow.

### 4.5 Admin (Phase 12)
Strict RBAC and aggregate-only responses (good). But it `findMany`s entire tables on every call, mixes demo and real users in every statistic, and lacks time trends, upload metadata, recommendation/course usage, user management and an audit log.

### 4.6 Input validation and error handling (Phase 9 / 11)
Confirmed locally: `PUT /profile {experience:"abc"}` and `POST /progress {courseId:"bogus"}` both raise Prisma errors → **HTTP 500** (production masks the text, but they should be 400s). Same pattern for `PUT /progress` status values, assessment/quiz submissions, and profile field lengths. Logging: no request IDs, no redaction layer; `morgan('combined')` logs full URLs, so the **Google OAuth `code`/`state` query parameters appear in access logs** (single-use and PKCE-bound, but should not be logged).

### 4.7 iGOT (Phase 7)
No official API credentials or specification exist → integration cannot be real. The catalog is invented. **Latent honesty bug:** `igotService.isLiveConfigured()` is true whenever `IGOT_API_BASE_URL` and `IGOT_API_KEY` are set, and `igotController` then labels responses `"iGOT Karmayogi (live)"` — but the data still comes from the local table. Setting those variables would make the UI claim live data that isn't.

### 4.8 Frontend / security (Phase 9 / 11)
No `dangerouslySetInnerHTML`/`eval` anywhere (XSS surface is small). Token in `localStorage` (documented trade-off, cookies impractical across Vercel/Railway). No frontend CSP, no ErrorBoundary, no code-splitting. Prototype wording appears on login, register, auth layout, iGOT page and profile.

### 4.9 Operations
Single Railway service, no worker/queue (AI calls run inside the HTTP request), no monitoring/alerting, static health check, no CI, no backups documented, `engines: node >=18`, in-memory state prevents scaling beyond one instance.

## 5. Complete list of prototype/demo dependencies
1. `AI_PROVIDER=demo` on production; default when unset; silent fallback from external to demo.
2. `DemoAIProvider` (analysis, MCQs) + `demoQuestionBank.js` canned questions + `competencyKeywords.js` keyword matcher.
3. `demoAssistant.js` (rule-based assistant engine — honest and labelled, but not an LLM).
4. Seed data: 36 invented iGOT courses; 1 assessment with 10 questions; 4 demo learners with preset levels; demo admin.
5. Documented public credentials (`admin@demo.gov.in / Admin@123`, `learner@demo.gov.in / Learner@123`) in README/DEPLOYMENT/DEMO_GUIDE and seed.
6. Invented constants: baseline level `40`, default required level `65`, `requiredLevel: 65` on create, hard-coded `ROLE_REQUIREMENTS`.
7. `@demo.gov.in` string checks in `Profile.jsx` and `authController.js` (demo-vs-real separation by email suffix, not a data flag).
8. UI copy: "Prototype build", "For demonstration purposes", "DEMO PROFILE", iGOT "Prototype Integration", "unavailable in this prototype".
9. Docs: `DEMO_GUIDE.md`, `TEST_REPORT.md`, `docs/demo-flow.md`.
10. `/api/health` publishes `aiProvider`.

## 6. Missing production features
Password reset · email verification · account deletion/deactivation · transactional email · session revocation · persistent object storage · file delete/download (owner-only) · upload hardening (magic-byte check, AV, quotas) · AI output validation, retries, token caps, usage logging, per-user quotas · larger, expert-reviewed assessment item bank · configurable role→competency requirements · input validation on all write endpoints · request IDs and structured logs · monitoring/alerting/uptime · deep health check · CSP on the frontend · ErrorBoundary/offline states · code-splitting · CI pipeline · frontend and end-to-end tests · admin trends/usage/audit · demo/real user separation in analytics · data retention & privacy policy · backup/restore runbook.

## 7. External services required
| Service | Why | Status |
|---|---|---|
| OpenAI-compatible LLM API (key, base URL, model) | Real AI features | **Needed — you must supply** |
| Transactional email (e.g. Resend, SendGrid, AWS SES, SMTP) + verified sending domain | Password reset, verification | **Needed** |
| S3-compatible object storage (AWS S3, Cloudflare R2, Backblaze B2) — or a Railway Volume as an interim | Persistent private files | **Needed** |
| Malware scanning (e.g. ClamAV sidecar/API) | Upload safety | Recommended |
| Error/uptime monitoring (e.g. Sentry, UptimeRobot/Better Stack) | Operations | Recommended |
| Redis (Railway add-on) | Shared rate limits/handoff codes if scaling >1 instance; queue for AI jobs | Only if scaling |
| Postgres backups | Recovery | Verify Railway plan / add scheduled `pg_dump` |
| **Official iGOT Karmayogi API access** | Real course integration | **Not available — cannot be built without government authorization; keep "prototype" labelling** |

## 8. Security risks (ranked)
| ID | Severity | Risk |
|---|---|---|
| S1 | **High** *(unverified on prod)* | Publicly documented **demo admin** and learner credentials; if seeded in production anyone can sign in as ADMIN |
| S2 | **High** | Silent fallback to demo/canned AI content that feeds real competency scores; provider mislabelled after fallback |
| S3 | **High** (once AI is real) | No quotas on `/analyze`, `/quizzes/generate`, `/upload` → unbounded AI spend and storage abuse |
| S4 | **High** | No password reset / email verification → permanent lock-out for password users; unverified emails allow pre-registration squatting (mitigated for Google linking by password confirmation) |
| S5 | Medium | Unhardened uploads (client-declared type, no AV, unmaintained parser in-process, no delete) |
| S6 | Medium | `filePath`/`fileName` returned to clients |
| S7 | Medium | Unvalidated write inputs → 500s (profile, progress, submissions) and garbage data |
| S8 | Medium | 7-day JWT without revocation; password change doesn't end other sessions |
| S9 | Medium | In-memory limiters/handoff codes: bypass on restart, break with >1 instance |
| S10 | Medium | No CSP on the frontend |
| S11 | Low–Med | OAuth `code`/`state` in access logs; no redaction layer; no request IDs |
| S12 | Low | Shallow health check exposes `aiProvider`; register 409 reveals emails |
| S13 | Low (latent) | iGOT `live` label triggered by env vars, not real integration |
| S14 | Low–Med | Admin/learning-path queries scale poorly (full-table loads, write-on-GET) |

## 9. Readiness score (method)
Subjective, weighted by importance to a real launch: Auth 12 % × 60 · Authorization 8 % × 80 · API hardening 10 % × 70 · Real AI 12 % × 35 · Documents/storage 10 % × 25 · Data model/persistence 8 % × 60 · Assessment/competency validity 10 % × 30 · Recommendations/iGOT 6 % × 40 · Assistant 6 % × 65 · Admin 4 % × 40 · Ops/observability 6 % × 15 · Testing/CI 4 % × 45 · Frontend resilience 4 % × 55 → **≈ 48 %**.

## 10. Database changes required (all additive, non-destructive)
- `users`: `emailVerifiedAt`, `deactivatedAt` (soft delete), `lastLoginAt`, `passwordChangedAt` (to invalidate old tokens), `isDemo` (boolean, real separation from demo data).
- New `auth_tokens` (password-reset / email-verification: hashed token, purpose, userId, expiresAt, usedAt).
- New `ai_usage` (userId, feature, model, prompt/completion token counts, status, createdAt — **no prompt content**).
- New `audit_log` (admin/security events).
- `learning_materials`: `storageKey`, `sha256`, verified `mimeType`, `deletedAt`; keep `filePath` until data is migrated, then stop returning it.
- `courses`: `externalId`, `sourceType` (`PROTOTYPE` | `IGOT_LIVE`), `lastSyncedAt`, `url`.
- New `role_profiles` (+ requirement rows) replacing the hard-coded `ROLE_REQUIREMENTS`.
- `quizzes` / `document_analyses`: `aiProvider`, `model` (provenance).
- Indexes on `userId` and other FK/query columns across attempt, material, progress, recommendation, gap tables.
- **Data (not schema):** an expert-authored item bank (multiple questions per competency) and a real course catalog.
No existing user data is deleted or rewritten by any of the above.

## 11. Estimated implementation phases (rough, one developer with AI assistance)
| Phase | Scope | Est. |
|---|---|---|
| 0 | **Immediate safety:** verify/disable production demo accounts; production guard so demo AI can't be used silently; stop returning `filePath`; rate-limit upload/analyze/generate | 0.5–1 day |
| 2 + 13 | Real AI provider hardening + quotas/cost control + usage logging | 3–4 days |
| 3 + 10 | Password reset, email verification, deletion/deactivation, session invalidation (needs email provider) | 4–5 days |
| 4 | Object storage, delete/download, upload hardening, cleanup job | 3–4 days |
| 5 + 6 | Migrations/indexes, demo-vs-real separation, remove invented constants, role profiles | 3–4 days (+ **content authoring**, non-code) |
| 7 | iGOT: provider seam + honest status only (real API blocked on access) | 0.5–1 day |
| 8 | Assistant follow-ups (real LLM path, optional history) | 1 day |
| 9 + 11 | CSP, validation on all writes, request IDs, structured/redacted logs, ErrorBoundary, error states | 4–5 days |
| 12 | Admin analytics (trends, usage, metadata), demo exclusion, pagination | 2–3 days |
| 14 | Test expansion + CI | 3–4 days |
| 15 + 16 | Real-browser production test with a fresh account; documentation set | 2–3 days |
Overall ≈ **5–7 working weeks**, dominated by external dependencies (LLM, email, storage accounts) and by **assessment content authoring**, which code cannot substitute for.

## 12. Exact next step
1. **You** run the read-only check on production Postgres: `SELECT email, role FROM users WHERE email LIKE '%@demo.gov.in';` and tell me the result (this decides how urgent S1 is).
2. **You** decide/provide: (a) LLM provider + base URL + model + key (as Railway variables, never in chat), (b) email provider, (c) storage choice (S3-compatible bucket vs Railway Volume as interim).
3. On your approval I start **Phase 0 + Phase 2** (production safety guard, real AI provider hardening, AI quotas), run the tests after each step, and stop for your review before anything is committed or deployed.
