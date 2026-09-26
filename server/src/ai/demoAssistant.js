/**
 * Offline answer engine used by DemoAIProvider.answerLearnerQuestion().
 *
 * It is NOT a language model. It recognises what the learner is asking (a small set of
 * intents) and composes the reply purely from the learner's real data in `ctx`
 * (see assistant/learnerContext.js). Every number, competency and course in a reply is
 * copied from `ctx`; nothing is invented, and if the data needed is missing it says so.
 */

const CATALOG_NOTE =
  'Note: courses come from the prototype iGOT catalog built into this application, not from a live iGOT feed.';

const lc = (s) => String(s || '').toLowerCase();
const level = (l) => (l ? l.charAt(0) + l.slice(1).toLowerCase() : '');
const bandOf = (g) => `${g.priority} priority`;
const fmtGap = (g) => `${g.name}: level ${g.current}, required ${g.required}, gap ${g.gap}`;
const list = (items) => items.map((t, i) => `${i + 1}. ${t}`).join('\n');
const ROLE = (ctx) => ctx.learner.targetRole || 'your target role';

function findCompetency(message, ctx) {
  const m = lc(message);
  let best = null;
  for (const c of ctx.competencies) {
    const n = lc(c.name);
    if (n.length >= 2 && new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(m)) {
      if (!best || n.length > best.name.length) best = c;
    }
  }
  return best;
}

function recFor(ctx, competencyName) {
  return ctx.recommendations.find((r) => r.competency === competencyName) || null;
}

function courseLine(r) {
  if (!r.course) return `no catalog course is mapped to ${r.competency} yet`;
  return `"${r.course.title}" (${level(r.course.level)}, about ${r.course.durationHrs}h, expected improvement up to +${r.expectedImprovement} points)`;
}

const noData =
  "I don't have competency scores for you yet, so I can't rank your priorities. Take the Competency Assessment first - after that I can answer using your real results.";

// ---------------------------------------------------------------------------- intents

function learnNext(ctx) {
  if (!ctx.competencies.length) return noData;
  if (!ctx.gaps.length) {
    return `Good news: every tracked competency meets the level required for ${ROLE(ctx)}. There is no open gap to close right now. You could take another adaptive quiz on new material to keep your levels current.`;
  }
  const top = ctx.gaps.slice(0, 3);
  const lines = top.map((g) => {
    const r = recFor(ctx, g.name);
    return `${g.name} - level ${g.current} against ${g.required} required (gap ${g.gap}, ${bandOf(g)}). ${r ? `Suggested: ${courseLine(r)}.` : ''}`.trim();
  });
  const first = top[0];
  const firstRec = recFor(ctx, first.name);
  return [
    `Based on your current competency profile and your target role (${ROLE(ctx)}), I'd focus on these next:`,
    list(lines),
    `Why this order: ${first.name} comes first because your level (${first.current}) is ${first.gap} points below the ${first.required} required for ${ROLE(ctx)}, which puts it in the ${bandOf(first)} band. Priorities combine the size of the gap with your recent quiz accuracy on that competency.${firstRec ? ` ${firstRec.reason}` : ''}`,
    CATALOG_NOTE,
  ].join('\n\n');
}

function priorityExplain(ctx) {
  if (!ctx.competencies.length) return noData;
  if (!ctx.gaps.length) return `You have no priority gaps at the moment - all your competencies meet or exceed the levels required for ${ROLE(ctx)}.`;
  const g = ctx.gaps[0];
  const r = recFor(ctx, g.name);
  const others = ctx.gaps.slice(1, 3).map((x) => `${x.name} (gap ${x.gap}, ${bandOf(x)})`);
  return [
    `${g.name} is ranked first because your current level (${g.current}) is ${g.gap} points below the ${g.required} that ${ROLE(ctx)} requires - that is the "${g.status.replace(/_/g, ' ').toLowerCase()}" band and ${bandOf(g)}.`,
    r ? r.reason : null,
    others.length ? `For comparison, the next gaps are ${others.join(' and ')}.` : null,
    'Priority is set by the size of the gap, raised when your recent quiz accuracy on that competency is below 50%.',
  ].filter(Boolean).join('\n\n');
}

function gapsSummary(ctx, message) {
  if (!ctx.competencies.length) return noData;
  const weakestByLevel = /weak|lowest|worst/.test(lc(message));
  if (!ctx.gaps.length) return `You have no open gaps - every competency meets the level required for ${ROLE(ctx)}.`;
  const shown = ctx.gaps.slice(0, 5);
  const head = weakestByLevel
    ? `Your weakest competencies relative to ${ROLE(ctx)} (largest priority and gap first):`
    : `You have ${ctx.gaps.length} open competency gap${ctx.gaps.length === 1 ? '' : 's'} against ${ROLE(ctx)}. The biggest:`;
  return [
    head,
    list(shown.map((g) => `${fmtGap(g)} (${bandOf(g)})`)),
    'A gap is the required level minus your current level; it is recalculated whenever you complete an assessment or quiz.',
  ].join('\n\n');
}

function competencyDetail(ctx, c) {
  const parts = [];
  if (c.gap > 0) {
    parts.push(`${c.name}: your level is ${c.current} and ${ROLE(ctx)} requires ${c.required}, a gap of ${c.gap} points (${bandOf(c)}).`);
    const rank = ctx.gaps.findIndex((g) => g.name === c.name) + 1;
    if (rank) parts.push(`It is #${rank} of your ${ctx.gaps.length} open gaps, so it is prioritised ${rank === 1 ? 'first' : `after ${rank - 1} larger or higher-priority gap${rank - 1 === 1 ? '' : 's'}`}.`);
  } else {
    parts.push(`${c.name}: your level is ${c.current}, which already meets the ${c.required} required for ${ROLE(ctx)} - no gap.`);
  }
  const r = recFor(ctx, c.name);
  if (r) {
    parts.push(`To improve it: ${courseLine(r)}. ${r.reason}`);
  } else {
    const options = ctx.catalog.filter((x) => x.competency === c.name).slice(0, 3);
    if (options.length) {
      parts.push(`Catalog courses for ${c.name}:\n${list(options.map((o) => `"${o.title}" (${level(o.level)}, about ${o.durationHrs}h)`))}`);
    } else if (c.gap > 0) {
      parts.push(`No catalog course is mapped to ${c.name} yet.`);
    }
  }
  const inQuiz = ctx.quizzes.flatMap((q) => q.competencyBreakdown).filter((b) => b.competency === c.name)[0];
  if (inQuiz) parts.push(`In your latest quiz that covered it, ${c.name} moved from ${inQuiz.before} to ${inQuiz.after} (${inQuiz.change >= 0 ? '+' : ''}${inQuiz.change}) with ${inQuiz.accuracy}% accuracy. Adaptive quizzes on this topic will move it faster.`);
  if (r || ctx.catalog.some((x) => x.competency === c.name)) parts.push(CATALOG_NOTE);
  return parts.join('\n\n');
}

function courses(ctx) {
  if (!ctx.competencies.length) return noData;
  if (!ctx.recommendations.length) {
    return ctx.gaps.length
      ? "I don't have a saved learning path for you yet. Open the Learning Path page once and I'll be able to name your first course."
      : `You have no open gaps, so no course is needed right now. ${CATALOG_NOTE}`;
  }
  const first = ctx.recommendations[0];
  const rest = ctx.recommendations.slice(1, 3);
  return [
    `Take this one first: ${courseLine(first)} for ${first.competency}.`,
    `Why: ${first.reason}`,
    rest.length ? `After that:\n${list(rest.map((r) => `${r.competency} - ${courseLine(r)}`))}` : null,
    CATALOG_NOTE,
  ].filter(Boolean).join('\n\n');
}

function scoreChange(ctx) {
  const latest = ctx.quizzes[0];
  const latestAssessment = ctx.assessments[0];
  if (!latest && !latestAssessment) {
    return "You haven't completed a quiz or assessment yet, so there's no score change to explain. Complete one and I'll break down how each competency moved.";
  }
  const source = latest || latestAssessment;
  const kind = latest ? 'quiz' : 'assessment';
  const breakdown = source.competencyBreakdown || [];
  const moved = breakdown.filter((b) => b.after != null && b.before != null);
  const lines = moved.map((b) => `${b.competency}: ${b.before} to ${b.after}${b.change != null ? ` (${b.change >= 0 ? '+' : ''}${b.change})` : ''}${b.accuracy != null ? `, ${b.accuracy}% accuracy` : ''}`);
  const scoreLine = latest
    ? `In "${latest.title}" you scored ${Math.round(latest.score)}% (${latest.correct} correct, ${latest.incorrect} incorrect).`
    : `In "${latestAssessment.title}" you scored ${Math.round(latestAssessment.score)}%.`;
  return [
    scoreLine,
    lines.length
      ? `Your competency levels are updated from difficulty-weighted accuracy on each topic, so harder questions move them more. In this ${kind}:\n${list(lines)}`
      : `This ${kind} had no competency-linked questions, so no competency levels changed.`,
  ].join('\n\n');
}

function recentPerformance(ctx) {
  const q = ctx.quizzes[0];
  const a = ctx.assessments[0];
  if (!q && !a) return "You haven't completed an assessment or quiz yet, so I have no results to review. Take the Competency Assessment and I'll go through it with you.";
  const parts = [];
  if (a) {
    const weak = [...(a.competencyBreakdown || [])].filter((b) => b.accuracy != null).sort((x, y) => x.accuracy - y.accuracy).slice(0, 3);
    parts.push(`Latest assessment "${a.title}": ${Math.round(a.score)}% overall.${weak.length ? ` Weakest areas by accuracy:\n${list(weak.map((b) => `${b.competency} - ${b.accuracy}% correct`))}` : ''}`);
  }
  if (q) {
    parts.push(`Latest quiz "${q.title}": ${Math.round(q.score)}% (${q.correct} correct, ${q.incorrect} incorrect).${q.improvementAreas.length ? ` Areas flagged for improvement: ${q.improvementAreas.join(', ')}.` : ''}`);
  }
  return parts.join('\n\n');
}

function roleSkills(ctx) {
  if (!ctx.competencies.length) return noData;
  if (!ctx.learner.targetRole) {
    return 'You have not set a target role in your Profile yet, so I am using the default proficiency bar for every competency. Set your target role in Profile and your requirements will be recalculated.';
  }
  const required = [...ctx.competencies].sort((a, b) => b.required - a.required).slice(0, 8);
  return [
    `For ${ctx.learner.targetRole}, these are the highest required levels and where you stand:`,
    list(required.map((c) => `${c.name}: required ${c.required}, you are at ${c.current}${c.gap > 0 ? ` (gap ${c.gap})` : ' (met)'}`)),
    ctx.learner.currentRole ? `You are currently in the role: ${ctx.learner.currentRole}.` : null,
  ].filter(Boolean).join('\n\n');
}

function progressSummary(ctx) {
  const parts = [];
  if (ctx.overallScore != null) parts.push(`Your overall competency score is ${ctx.overallScore} across ${ctx.competencies.length} tracked competencies, with ${ctx.gaps.length} open gap${ctx.gaps.length === 1 ? '' : 's'} against ${ROLE(ctx)}.`);
  const done = ctx.progress.filter((p) => p.status === 'COMPLETED').length;
  const active = ctx.progress.filter((p) => p.status === 'IN_PROGRESS');
  if (ctx.progress.length) {
    parts.push(`Learning progress: ${done} course${done === 1 ? '' : 's'} completed, ${active.length} in progress.${active.length ? `\n${list(active.slice(0, 3).map((p) => `${p.course || p.competency || 'Course'} - ${p.percent}%`))}` : ''}`);
  } else {
    parts.push("You haven't started any recommended course yet. Start one from the Learning Path page and I'll track it here.");
  }
  parts.push(`Assessments and quizzes: ${ctx.assessments.length} recent assessment${ctx.assessments.length === 1 ? '' : 's'}, ${ctx.quizzes.length} recent quiz${ctx.quizzes.length === 1 ? '' : 'zes'}.${ctx.quizzes[0] ? ` Latest quiz: ${Math.round(ctx.quizzes[0].score)}%.` : ''}`);
  if (!parts.length) return noData;
  return parts.join('\n\n');
}

function thirtyDayPlan(ctx) {
  if (!ctx.competencies.length) return noData;
  const recs = ctx.recommendations.length ? ctx.recommendations : [];
  if (!ctx.gaps.length) return `You currently have no open gaps against ${ROLE(ctx)}, so there is nothing to plan. I'd suggest an adaptive quiz on new material each week to keep your levels fresh.`;
  const items = (recs.length ? recs.map((r) => ({ name: r.competency, hrs: r.estimatedDurationHrs, r })) : ctx.gaps.map((g) => ({ name: g.name, hrs: null, r: null }))).slice(0, 4);
  const weeks = items.map((it, i) => {
    const gap = ctx.gaps.find((g) => g.name === it.name);
    const what = it.r ? courseLine(it.r) : 'work through your materials and practise with an adaptive quiz on this topic';
    return `Week ${i + 1} - ${it.name}${gap ? ` (level ${gap.current} to required ${gap.required})` : ''}: ${what}.`;
  });
  return [
    `Here is a 30-day plan built from your open gaps and learning path (largest priority first):`,
    weeks.join('\n'),
    'Final days: take the Competency Assessment again to measure how your levels have moved, then review the updated skill gaps.',
    ctx.recommendations.some((r) => r.course) ? CATALOG_NOTE : null,
  ].filter(Boolean).join('\n\n');
}

function materials(ctx) {
  if (!ctx.materials.total) return "You haven't uploaded any learning material yet. Upload a PDF, DOCX or TXT on the AI Content Intelligence page and I can talk you through its analysis.";
  if (!ctx.materials.analysed.length) return `You have ${ctx.materials.total} uploaded material${ctx.materials.total === 1 ? '' : 's'}, but none has been analysed yet. Open one and run the analysis.`;
  return ctx.materials.analysed
    .map((m) => `"${m.file}": ${m.summary}${m.topics.length ? ` Topics: ${m.topics.join(', ')}.` : ''}${m.competencies.length ? ` Competencies detected: ${m.competencies.join(', ')}.` : ''}`)
    .join('\n\n');
}

function profileSummary(ctx) {
  const l = ctx.learner;
  const bits = [
    l.currentRole && `current role ${l.currentRole}`,
    l.targetRole && `target role ${l.targetRole}`,
    l.department && `department ${l.department}`,
    l.organization && `organisation ${l.organization}`,
    l.experienceYears != null && `${l.experienceYears} years of experience`,
  ].filter(Boolean);
  return bits.length
    ? `Your profile: ${bits.join(', ')}.${l.learningGoals ? ` Your stated goal: ${l.learningGoals}` : ''}`
    : 'Your profile is mostly empty. Add your current role, target role and goals in Profile so I can tailor your priorities.';
}

const OUT_OF_SCOPE =
  "I'm designed to help with your competency and learning journey - your skill gaps, assessments, quizzes, recommended courses and progress. Try asking, for example, \"What should I learn next?\" or \"Which competencies are my weakest?\"";

// --------------------------------------------------------------------------- dispatch

function answer(message, ctx) {
  const m = lc(message);
  const named = findCompetency(message, ctx);

  let intent;
  let reply;

  if (/\b(30|thirty)[- ]?day|learning plan|study plan|roadmap|schedule/.test(m)) {
    intent = 'plan'; reply = thirtyDayPlan(ctx);
  } else if (/(score|level|competenc\w*).*(chang|moved|went (up|down)|drop|increas|decreas)|why did my|score change/.test(m) && !named) {
    intent = 'score_change'; reply = scoreChange(ctx);
  } else if (/(last|latest|recent|previous).*(assessment|quiz|test)|poorly|mistakes?|got wrong|what did i (get|do)/.test(m)) {
    intent = 'recent_performance'; reply = recentPerformance(ctx);
  } else if (named) {
    intent = 'competency'; reply = competencyDetail(ctx, named);
  } else if (/top priority|prioriti[sz]|why is this/.test(m)) {
    intent = 'priority'; reply = priorityExplain(ctx);
  } else if (/course|training|igot|first to take/.test(m)) {
    intent = 'course'; reply = courses(ctx);
  } else if (/weak|gap|lowest|worst|struggl|biggest/.test(m)) {
    intent = 'gaps'; reply = gapsSummary(ctx, message);
  } else if (/target role|skills? (do i need|required|needed)|role (require|need)|requirements?/.test(m)) {
    intent = 'role_skills'; reply = roleSkills(ctx);
  } else if (/progress|how am i doing|how am i getting|completed|status/.test(m)) {
    intent = 'progress'; reply = progressSummary(ctx);
  } else if (/material|document|upload|\bpdf\b/.test(m)) {
    intent = 'materials'; reply = materials(ctx);
  } else if (/my profile|my role|about me|department/.test(m)) {
    intent = 'profile'; reply = profileSummary(ctx);
  } else if (/learn next|should i (learn|study|focus|do)|what next|where (do|should) i start|recommend|improve|next step/.test(m)) {
    intent = 'learn_next'; reply = learnNext(ctx);
  } else if (/^(hi|hello|hey|namaste|good (morning|afternoon|evening))\b/.test(m)) {
    const name = ctx.learner.name ? ctx.learner.name.split(' ')[0] : 'there';
    intent = 'greeting';
    reply = `Hello ${name}! I can explain your skill gaps, recommend what to learn next, review your latest assessment or quiz, and build a 30-day plan - all from your own data. What would you like to know?`;
  } else if (/learn|skill|competenc|assess|quiz|score|statistic|career|role|train|study/.test(m)) {
    intent = 'general';
    reply = ctx.gaps.length
      ? `I can answer that best if you ask about a specific part of your learning. Right now your largest gap is ${fmtGap(ctx.gaps[0])}. You could ask "Why is ${ctx.gaps[0].name} a priority for me?" or "Give me a learning plan for the next 30 days."`
      : 'Ask me about your skill gaps, recommended courses, latest quiz or assessment, or your progress and I will answer from your own data.';
  } else {
    intent = 'out_of_scope'; reply = OUT_OF_SCOPE;
  }

  return { reply, intent };
}

module.exports = { answer };
