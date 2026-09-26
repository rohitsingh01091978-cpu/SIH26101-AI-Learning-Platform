import React from 'react';

export default function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 animate-fade-in">
      <div className="min-w-0">
        {eyebrow && <p className="section-eyebrow mb-1">{eyebrow}</p>}
        <h1 className="break-words font-display text-2xl font-bold text-ink-900">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-ink-600">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
