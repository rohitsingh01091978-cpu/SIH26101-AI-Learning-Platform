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
      <div className="flex min-w-max items-center gap-1">
        {stages.map((stage, idx) => (
          <React.Fragment key={stage.label}>
            <div className="flex flex-col items-center gap-1.5 px-1">
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
              <span className={`w-20 text-center text-[10px] font-medium leading-tight ${stage.current ? 'text-primary-700' : 'text-ink-500'}`}>
                {stage.label}
              </span>
            </div>
            {idx < stages.length - 1 && (
              <div className={`h-px w-6 shrink-0 ${stage.done ? 'bg-success-400' : 'bg-ink-200'}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
