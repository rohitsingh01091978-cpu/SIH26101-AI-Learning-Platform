import React, { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';

/**
 * Plain-language walkthrough of the real scoring rules in competencyEngine.js /
 * assessmentController.js / quizController.js — no numbers here are invented,
 * they describe the same formulas that produced the scores on this page.
 */
export default function CompetencyCalcExplainer() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-ink-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold text-ink-700 hover:bg-surface-subtle"
      >
        <span className="flex items-center gap-1.5">
          <HelpCircle size={13} className="text-primary-600" /> How is competency improvement calculated?
        </span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="animate-fade-in space-y-2 border-t border-ink-200 px-3.5 py-3 text-xs text-ink-700">
          <p>
            <strong className="text-ink-900">Before</strong> is your score the first time this competency was ever measured —
            from the baseline assessment, or your earliest quiz that covered it.
          </p>
          <p>
            <strong className="text-ink-900">Current</strong> updates every time you complete the baseline assessment or an
            adaptive quiz. Each attempt blends your prior score with how accurately you answered the questions tagged to that
            competency, so consistently correct answers move it up and repeated wrong answers move it down.
          </p>
          <p>
            <strong className="text-ink-900">Target</strong> is the proficiency level required for your target role (or a
            standard working-proficiency bar when no role-specific requirement is defined).
          </p>
          <p>
            <strong className="text-ink-900">Status</strong> — Strong (at or above target), Developing (within 20 points of
            target), or Needs Improvement (more than 20 points below) — is recalculated live from Current vs. Target, the same
            rule used on the Skill Gap Analysis page.
          </p>
        </div>
      )}
    </div>
  );
}
