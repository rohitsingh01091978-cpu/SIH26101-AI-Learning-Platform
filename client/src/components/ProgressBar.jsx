import React from 'react';

export default function ProgressBar({ value, max = 100, tone = 'primary', height = 'h-2' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const toneClasses = {
    primary: 'bg-primary-600',
    accent: 'bg-accent-600',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
  };
  return (
    <div className={`w-full ${height} rounded-full bg-ink-100 overflow-hidden`}>
      <div
        className={`${height} rounded-full ${toneClasses[tone] || toneClasses.primary} transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
