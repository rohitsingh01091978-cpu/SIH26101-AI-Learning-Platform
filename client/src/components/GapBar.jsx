import React from 'react';

/**
 * "CURRENT ──── 38   REQUIRED ──────────── 75" style comparison bar:
 * two overlaid tracks so the gap between current and required proficiency
 * is visually obvious at a glance, not just two numbers in a table cell.
 */
export default function GapBar({ current, required, tone = 'primary' }) {
  const toneBar = {
    primary: 'bg-primary-600',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
  }[tone];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Current</span>
        <div className="relative h-2 flex-1 rounded-full bg-ink-100">
          <div className={`h-2 rounded-full ${toneBar} transition-all duration-500`} style={{ width: `${current}%` }} />
        </div>
        <span className="w-7 shrink-0 text-right text-xs font-semibold text-ink-900">{current}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Required</span>
        <div className="relative h-2 flex-1 rounded-full bg-ink-100">
          <div className="h-2 rounded-full bg-ink-300 transition-all duration-500" style={{ width: `${required}%` }} />
          <div className="absolute inset-y-0 w-px bg-ink-500" style={{ left: `${required}%` }} />
        </div>
        <span className="w-7 shrink-0 text-right text-xs font-semibold text-ink-500">{required}</span>
      </div>
    </div>
  );
}
