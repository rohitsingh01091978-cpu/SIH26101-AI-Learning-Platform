# Demo Guide

A script for presenting the golden path to judges in ~5–7 minutes.

## Before you start

```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

Open http://localhost:5173. Have a short PDF/DOCX/TXT file ready to upload (2–4
paragraphs of real content works best — the AI analysis and MCQs are grounded in
whatever you upload, so richer text gives richer questions).

## Script

1. **Login** — sign in as `learner@demo.gov.in` / `Learner@123` (or click "Learner demo" to autofill).
2. **Dashboard** — point out the overall competency score, the radar chart, and that the
   priority skill gaps panel is computed live, not hardcoded.
3. **Competency Assessment** — take the 10-question baseline assessment. Submit it and
   show the before/after competency chart updating from your actual answers.
4. **Skill Gaps** — show the gap list re-sorted by priority, with the
   Strong/Developing/Needs Improvement status driven by the `gap = required − current`
   formula.
5. **Learning Materials → Upload** — drag in your sample document. Point out the file-type
   validation and upload progress.
6. **Analyze document** — click "Analyze document," narrate the processing steps
   (Extracting → Analyzing → Identifying competencies → Generating insights), then show
   the AI-generated summary, topics, and competencies — all grounded in the uploaded text.
7. **Generate MCQs** — pick 5 questions, Mixed difficulty. Show a generated question and
   point out its `sourceReference` traces back to the exact sentence in your document.
8. **Adaptive Quiz** — take the quiz. Answer one correctly (note the difficulty step up)
   and one incorrectly (note the difficulty step down) to demonstrate real-time adaptivity.
9. **Quiz Results** — show the before/after competency chart, difficulty-wise breakdown,
   and improvement areas — computed from this exact attempt.
10. **Learning Path** — show the ranked recommendations, each with a reason string
    referencing the learner's actual current/required levels, and a matched course from
    the prototype iGOT catalog. Click "Start course."
11. **iGOT Courses** — show the catalog, and point out the on-page disclosure that this is
    a labelled prototype catalog, not a live iGOT API call — with `igotService.js`
    structured so a real API key would need zero frontend changes.
12. **Progress** — show the started course and advance its progress bar.
13. **Switch to Admin** — log out, sign in as `admin@demo.gov.in` / `Admin@123`. Show the
    organization-wide stats, top skill gaps across all seeded learners, and department
    breakdown — all live queries, not fixtures.

## Talking points if asked

- **"Is this connected to a real database?"** Yes — PostgreSQL via Prisma, with real
  migrations (`server/prisma/migrations/`) and a documented schema (`ARCHITECTURE.md`).
- **"What happens without an AI API key?"** `AI_PROVIDER=demo` (the default) uses a
  zero-dependency extractive-NLP engine that computes everything from the actual document
  text — no external call, so it works completely offline and never fails mid-demo.
- **"Is the iGOT integration real?"** No — clearly labelled prototype catalog, seeded into
  our own database, structured behind `igotService.js` so a real API key is a one-file change.
- **"Are competency scores hardcoded?"** No — seeded with realistic starting values for
  the demo, but every subsequent number (skill gaps, dashboard, learning path, admin
  stats) is recomputed live from those values plus your actual quiz/assessment answers.
