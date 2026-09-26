import React from 'react';
import { GraduationCap } from 'lucide-react';

/**
 * Vertical connected-steps "journey" used by the Learning Path page.
 * `steps` items: { title, meta, children, icon }
 */
export default function Stepper({ steps }) {
  return (
    <ol className="relative">
      {steps.map((step, idx) => {
        const Icon = step.icon || GraduationCap;
        const isLast = idx === steps.length - 1;
        return (
          <li key={idx} className="relative pb-8 pl-12 last:pb-0">
            {!isLast && <span className="absolute left-[19px] top-10 h-[calc(100%-2.25rem)] w-px bg-ink-200" />}
            <span className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white shadow-sm">
              {step.number ?? <Icon size={16} />}
            </span>
            <div className="card-interactive">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="section-eyebrow">Step {idx + 1}</p>
                {step.meta}
              </div>
              <h3 className="font-display text-base font-bold text-ink-900">{step.title}</h3>
              {step.children}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
