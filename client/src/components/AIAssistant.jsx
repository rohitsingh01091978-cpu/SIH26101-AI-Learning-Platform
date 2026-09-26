import React, { useState } from 'react';
import { Sparkles, X, Send, Bot, User, Loader2 } from 'lucide-react';
import { getSkillGaps } from '../services/skillGapService';
import { getLearningPath } from '../services/learningPathService';
import { getPerformance } from '../services/performanceService';

const QUICK_QUESTIONS = [
  'What should I learn next?',
  'Why is this my top priority?',
  'Explain my competency gap',
  'What course is recommended for me?',
  'Why did my score change?',
];

/**
 * "Karmayogi AI Assistant" — grounds every answer in the same computed data
 * the rest of the app shows (skill-gap engine + recommendation engine +
 * quiz performance), pulled live from the existing API. It composes plain
 * language around real numbers rather than generating free-form text, so it
 * can never contradict what the dashboard/skill-gap/learning-path pages say.
 */
export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: "Hi, I'm the Karmayogi AI Assistant. Ask me about your priorities, skill gaps, or recommended courses — I'll answer from your live competency data.",
    },
  ]);

  const ask = async (question) => {
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const answer = await composeAnswer(question);
      setMessages((m) => [...m, { role: 'assistant', text: answer }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: "I couldn't reach your competency data just now — please try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-popover transition-all hover:bg-primary-700 active:scale-95"
      >
        <Sparkles size={17} />
        <span className="hidden sm:inline">Karmayogi AI</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[95] flex justify-end">
          <div className="absolute inset-0 bg-ink-950/30 animate-fade-in" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-popover animate-slide-in-right">
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white">
                  <Bot size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink-900">Karmayogi AI Assistant</p>
                  <p className="text-[11px] text-ink-500">Grounded in your live competency data</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-ink-400 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>

            <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${m.role === 'user' ? 'bg-ink-200 text-ink-700' : 'bg-primary-50 text-primary-700'}`}>
                    {m.role === 'user' ? <User size={12} /> : <Sparkles size={12} />}
                  </div>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                      m.role === 'user' ? 'bg-primary-600 text-white' : 'bg-surface-subtle text-ink-800'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-xs text-ink-500">
                  <Loader2 size={13} className="animate-spin" /> Reading your competency data...
                </div>
              )}
            </div>

            <div className="border-t border-ink-200 p-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => !loading && ask(q)}
                    disabled={loading}
                    className="rounded-full border border-ink-200 px-2.5 py-1 text-[11px] font-medium text-ink-600 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-md border border-ink-200 bg-surface-subtle px-3 py-2 text-xs text-ink-400">
                <Send size={13} />
                Tap a question above — answers are generated from your real scores, not scripted text.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

async function composeAnswer(question) {
  const [skillGaps, learningPath, performance] = await Promise.all([getSkillGaps(), getLearningPath(), getPerformance()]);
  const topGaps = [...skillGaps].filter((g) => g.gap > 0).sort((a, b) => b.gap - a.gap);
  const topGap = topGaps[0];
  const topRec = learningPath[0];

  if (question === 'What should I learn next?') {
    if (!topRec) return "You don't have any open competency gaps right now — your levels meet the requirements for your target role. Great work.";
    return `Your top recommendation is "${topRec.course ? topRec.course.title : topRec.competency}" for ${topRec.competency}. ${topRec.reason}`;
  }

  if (question === 'Why is this my top priority?') {
    if (!topGap) return 'You have no priority gaps at the moment — all your competencies meet or exceed the required level for your target role.';
    const accuracyClause = topGap.recentAccuracy != null ? ` Your recent assessment accuracy on this competency was ${topGap.recentAccuracy}%.` : '';
    return `${topGap.competency.name} is ranked highest because your current level (${topGap.currentLevel}) is ${topGap.gap} points below the ${topGap.requiredLevel} required for your target role — that puts it in the "${topGap.status.replace(/_/g, ' ')}" band at ${topGap.priority} priority.${accuracyClause}`;
  }

  if (question === 'Explain my competency gap') {
    if (!topGaps.length) return 'You currently have no competency gaps — every tracked competency meets its required level.';
    const list = topGaps.slice(0, 3).map((g) => `${g.competency.name} (${g.currentLevel}/${g.requiredLevel}, gap ${g.gap})`).join(', ');
    return `You have ${topGaps.length} open gap${topGaps.length === 1 ? '' : 's'}. The largest: ${list}. These are calculated as required level minus current level, recomputed every time you complete an assessment or quiz.`;
  }

  if (question === 'What course is recommended for me?') {
    if (!topRec?.course) return "There's no catalog course mapped to your top gap yet — check the iGOT Courses page for related options.";
    return `"${topRec.course.title}" (${topRec.course.level.toLowerCase()}, ~${topRec.estimatedDurationHrs}h) from the ${topRec.course.source}, targeting ${topRec.competency}. Expected improvement: +${topRec.expectedImprovement} points.`;
  }

  if (question === 'Why did my score change?') {
    const latest = performance.recentQuizAttempts?.[0];
    if (!latest) return "You haven't completed a quiz yet, so there's no score change to explain. Take an adaptive quiz and I'll break down exactly why your competency levels moved.";
    const changes = (latest.performance?.competencyBreakdown || [])
      .map((c) => `${c.competency} ${c.before}→${c.after} (${c.change >= 0 ? '+' : ''}${c.change})`)
      .join(', ');
    return `In "${latest.quizTitle}" you scored ${latest.score}% (${latest.correctCount} correct, ${latest.incorrectCount} incorrect). Competency levels update from a difficulty-weighted accuracy on each topic — harder questions move the needle more: ${changes || 'no competency-linked questions in this attempt.'}`;
  }

  return "I can answer questions about your priorities, skill gaps, recommended courses, and recent score changes — try one of the quick questions above.";
}
