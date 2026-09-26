# AI-Powered Learning & Competency Intelligence Platform

**SIH26101** — Smart India Hackathon 2026 · Theme: Smart Education · Category: Software

## Problem Statement

> Develop an AI-enabled learning platform that identifies competency gaps, recommends
> personalized training through integration with the iGOT Karmayogi ecosystem, and is
> capable of generating quizzes and multiple-choice questions (MCQs) from uploaded
> learning materials to strengthen capacity building in India's Official Statistical System.

## Overview

This is a full-stack, working prototype (not a static mockup). A learner logs in, takes a
baseline competency assessment, uploads a learning document, gets it analyzed and turned
into an adaptive MCQ quiz by an AI layer, sees their competency scores update from real
quiz performance, and receives a personalized learning path backed by a prototype iGOT
Karmayogi course catalog. An admin sees organization-wide competency analytics.

```
Profile & Input → Content Intelligence → Adaptive Assessment
   → Competency Gap Analysis → Personalized Training → iGOT Karmayogi integration
```

## Features

- JWT authentication with bcrypt password hashing, role-based access (Learner / Admin)
- 33-competency framework across 4 categories (Statistical, Technical, Digital
  Governance, Behavioural/Managerial)
- Baseline competency assessment that updates real competency scores in the database
- Skill-gap analysis computed live from `gap = required level − current level`
- PDF / DOCX / TXT upload with real text extraction (`pdf-parse`, `mammoth`)
- AI content analysis (summary, topics, concepts, competencies, learning objectives),
  grounded strictly in the uploaded document
- AI MCQ generation (5/10/20 questions, difficulty EASY/MEDIUM/HARD/MIXED), grounded in
  the source document, with a modular `AIProvider` abstraction
  (`DemoAIProvider` offline fallback + `ExternalAIProvider` for a real LLM API)
- Adaptive quiz engine: difficulty increases after correct answers, decreases after
  incorrect ones, computed server-side per question
- Real competency score updates (before/after) computed from quiz performance, not animated
- Personalized learning path & recommendations, recalculated from live skill gaps
- Prototype iGOT Karmayogi course catalog, clearly labelled as a prototype, structured so
  a real iGOT API can be plugged in later without frontend changes
- Admin dashboard with organization-wide analytics (Recharts, backed by live DB queries)
- Professional, government/enterprise-style UI (React + Tailwind CSS)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router, Axios, Lucide React, Recharts |
| Backend | Node.js, Express.js |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT, bcrypt, role-based middleware |
| AI | Modular `AIProvider` (Demo + External), extractive NLP, OpenAI-compatible chat API |
| Documents | `pdf-parse`, `mammoth`, `multer` |

## Project Structure

```
SIH26101/
├── client/           React + Vite frontend
│   └── src/{components,pages,layouts,context,services,hooks,charts}
├── server/           Express backend
│   ├── src/{controllers,routes,services,middleware,ai,document,recommendations,utils}
│   └── prisma/{schema.prisma,seed.js}
├── docs/
├── .env.example
├── README.md, ARCHITECTURE.md, API_DOCUMENTATION.md, DEMO_GUIDE.md, TEST_REPORT.md
```

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (a local instance is fine for the demo)

### 1. Database

Create a database and a role (adjust names/password as you like):

```sql
CREATE ROLE sih_user LOGIN PASSWORD 'sih_password' CREATEDB;
CREATE DATABASE sih26101 OWNER sih_user;
```

### 2. Backend

```bash
cd server
cp ../.env.example .env      # then edit DATABASE_URL / JWT_SECRET as needed
npm install
npx prisma migrate deploy    # applies the committed migration
node prisma/seed.js          # seeds competencies, demo users, iGOT catalog, baseline assessment
npm run dev                  # http://localhost:5000
```

### 3. Frontend

```bash
cd client
npm install
npm run dev                  # http://localhost:5173 (proxies /api to :5000 in dev)
```

Open http://localhost:5173 and log in with a demo account below.

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Learner | `learner@demo.gov.in` | `Learner@123` |
| Admin | `admin@demo.gov.in` | `Admin@123` |

(Three additional learners are seeded for admin-dashboard variety: `r.iyer@demo.gov.in`,
`s.gupta@demo.gov.in`, `k.das@demo.gov.in`, all with password `Learner@123`.)

## Environment Variables

See `.env.example` for the full list. Key ones:

- `DATABASE_URL` — PostgreSQL connection string used by Prisma
- `JWT_SECRET` — sign/verify secret for auth tokens (never used client-side)
- `FRONTEND_URL` — deployed frontend origin allowed by CORS (production)
- `VITE_API_URL` — (frontend, `client/.env`) backend origin; unset in local dev
- Deployment steps: see [DEPLOYMENT.md](DEPLOYMENT.md)
- `AI_PROVIDER` — `demo` (default, zero setup, always works offline) or `external`
- `EXTERNAL_AI_API_KEY` / `EXTERNAL_AI_BASE_URL` / `EXTERNAL_AI_MODEL` — only needed if
  `AI_PROVIDER=external`. Never sent to the frontend.

## AI Provider Configuration

The app never talks to a specific AI vendor directly — every call goes through
`server/src/ai/index.js`, which returns whichever provider `AI_PROVIDER` selects and
transparently falls back to `DemoAIProvider` if `ExternalAIProvider` is unconfigured or a
call fails at runtime. This means the demo keeps working even with no internet access.

- `DemoAIProvider` — zero-dependency extractive NLP (keyword frequency, sentence ranking,
  cloze-style question generation) computed directly from the uploaded document text. No
  external network call, no invented facts.
- `ExternalAIProvider` — calls any OpenAI-chat-completions-compatible endpoint, configured
  entirely through env vars.

## iGOT Karmayogi Integration Note

This prototype does **not** have live iGOT Karmayogi API credentials. All course data
comes from a seeded **"Prototype iGOT Course Catalog"**, clearly labelled as such via
`source: "Prototype iGOT Catalog"` on every course record and in the UI. `igotService.js`
(`server/src/services/igotService.js`) is the single place that would need to change to
call a real iGOT API — no controller or frontend code depends on the data's origin.

## API Overview

See `API_DOCUMENTATION.md` for the full reference. Highlights: `/api/auth/*`,
`/api/profile`, `/api/competencies*`, `/api/assessment/*`, `/api/skill-gaps`,
`/api/materials/*`, `/api/quizzes/*`, `/api/performance`, `/api/learning-path`,
`/api/recommendations`, `/api/progress`, `/api/igot/*`, `/api/admin/dashboard`.

## Further Reading

- `ARCHITECTURE.md` — system design, data model, module responsibilities
- `API_DOCUMENTATION.md` — full REST API reference
- `DEMO_GUIDE.md` — step-by-step script for demoing the golden path
- `TEST_REPORT.md` — what was tested and how, including live end-to-end runs
- `docs/demo-flow.md` — the user-journey diagram
