# Demo Flow

```
  LOGIN
    │
    ▼
  LEARNER DASHBOARD  (overall score, radar chart, priority gaps, top strengths, next steps)
    │
    ▼
  PROFILE  (department, organization, experience, target role, learning goals)
    │
    ▼
  COMPETENCY ASSESSMENT  (10 baseline questions)
    │
    ▼
  COMPETENCY SCORE  (before/after chart, updated LearnerCompetency rows)
    │
    ▼
  SKILL GAP ANALYSIS  (gap = required − current, STRONG/DEVELOPING/NEEDS_IMPROVEMENT)
    │
    ▼
  UPLOAD PDF/DOCX/TXT  (drag-and-drop, validated, text extracted)
    │
    ▼
  DOCUMENT PROCESSING  (Extracting → Analyzing → Identifying competencies → Generating insights)
    │
    ▼
  AI CONTENT ANALYSIS  (summary, topics, concepts, competencies, learning objectives)
    │
    ▼
  GENERATE MCQs  (5/10/20 questions, EASY/MEDIUM/HARD/MIXED, grounded in the document)
    │
    ▼
  ADAPTIVE QUIZ  (difficulty steps up on correct, down on incorrect, per question)
    │
    ▼
  PERFORMANCE ANALYSIS  (score, accuracy, competency-wise + difficulty-wise breakdown)
    │
    ▼
  COMPETENCY UPDATE  (before/after chart, LearnerCompetency + SkillGap recomputed)
    │
    ▼
  PERSONALIZED LEARNING PATH  (ranked by priority × gap, reasons cite real numbers)
    │
    ▼
  iGOT COURSE RECOMMENDATIONS  (prototype catalog, clearly labelled, competency-matched)
    │
    ▼
  PROGRESS  (start a course, track % completion)
    │
    ▼
  RE-ASSESSMENT  (retake the assessment any time; scores and gaps recompute live)
```

Every arrow above is a real navigation + API call in the app — see `DEMO_GUIDE.md` for the
click-by-click script and `API_DOCUMENTATION.md` for the endpoints each step calls.
