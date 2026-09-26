import React, { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';
import Badge from './Badge.jsx';

/**
 * "Why is X prioritized?" evidence panel — renders the exact numbers the
 * recommendation/skill-gap engines computed (never invented copy), so a
 * judge can see recommendations are data-driven, not random.
 */
export default function WhyEvidence({ competency, evidence, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!evidence) return null;

  const { currentLevel, requiredLevel, gap, recentAccuracy, priority } = evidence;

  return (
    <div className="mt-3 rounded-md border border-ink-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold text-ink-700 hover:bg-surface-subtle"
      >
        <span className="flex items-center gap-1.5">
          <HelpCircle size={13} className="text-primary-600" /> Why is {competency} prioritized?
        </span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="animate-fade-in border-t border-ink-200 px-3.5 py-3 text-xs text-ink-700">
          <ul className="space-y-1">
            <li>
              • Current competency level: <strong className="text-ink-900">{currentLevel}</strong>
            </li>
            <li>
              • Required level for your target role: <strong className="text-ink-900">{requiredLevel}</strong>
            </li>
            <li>
              • Gap: <strong className="text-ink-900">{gap} points</strong>
            </li>
            <li>
              • Recent assessment accuracy:{' '}
              <strong className="text-ink-900">{recentAccuracy != null ? `${recentAccuracy}%` : 'not yet assessed'}</strong>
            </li>
          </ul>
          <p className="mt-2 flex items-center gap-1.5">
            Therefore: <Badge variant={priority}>{priority} PRIORITY</Badge>
          </p>
        </div>
      )}
    </div>
  );
}
