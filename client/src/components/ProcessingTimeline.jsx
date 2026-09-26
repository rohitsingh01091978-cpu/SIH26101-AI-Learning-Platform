import React from 'react';
import { CheckCircle2, Loader2, Circle } from 'lucide-react';

/**
 * `steps`: [{ label, state: 'done' | 'active' | 'pending' }]
 */
export default function ProcessingTimeline({ steps }) {
  return (
    <ul className="space-y-3">
      {steps.map((step) => (
        <li key={step.label} className="flex items-center gap-2.5 text-sm">
          {step.state === 'done' && <CheckCircle2 size={17} className="shrink-0 text-success-600" />}
          {step.state === 'active' && <Loader2 size={17} className="shrink-0 animate-spin text-primary-600" />}
          {step.state === 'pending' && <Circle size={17} className="shrink-0 text-ink-300" />}
          <span className={step.state === 'pending' ? 'text-ink-400' : step.state === 'active' ? 'font-medium text-ink-900' : 'text-ink-700'}>
            {step.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
