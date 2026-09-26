import React from 'react';
import { Check } from 'lucide-react';

/**
 * Horizontal pipeline showing the platform's full story end-to-end
 * (profile -> competency intelligence -> ... -> re-assessment), with the
 * learner's actual progress highlighted — driven by real booleans the
 * caller computes from live API data, not decorative.
 */
export default function JourneyStrip({ stages }) {
  return (
    <div className="scrollbar-thin overflow-x-auto pb-2">
      <div className="flex w-full min-w-[760px] items-start gap-1" role="list" aria-label="Your progress through the platform">
        {stages.map((stage, idx) => (
          <React.Fragment key={stage.label}>
            <div className="flex flex-col items-center gap-1.5 px-1" role="listitem" aria-current={stage.current ? 'step' : undefined}>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                  stage.done
                    ? 'border-success-500 bg-success-500 text-white'
                    : stage.current
                    ? 'border-primary-600 bg-primary-600 text-white animate-fade-in'
                    : 'border-ink-200 bg-white text-ink-400'
                }`}
              >
                {stage.done ? <Check size={14} /> : idx + 1}
              </div>
              <span className={`w-[68px] text-center text-[11px] font-medium leading-tight ${stage.current ? 'text-primary-700' : stage.done ? 'text-ink-700' : 'text-ink-500'}`}>
                {stage.label}
              </span>
            </div>
            {idx < stages.length - 1 && (
              <div aria-hidden="true" className={`mt-4 h-0.5 min-w-3 flex-1 rounded-full ${stage.done ? 'bg-success-400' : 'bg-ink-200'}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
