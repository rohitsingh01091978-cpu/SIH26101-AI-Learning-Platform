import React from 'react';
import Badge from './Badge.jsx';
import GapBar from './GapBar.jsx';

const CATEGORY_LABEL = {
  STATISTICAL: 'Statistical',
  TECHNICAL: 'Technical',
  DIGITAL_GOVERNANCE: 'Digital Governance',
  BEHAVIOURAL_MANAGERIAL: 'Behavioural / Managerial',
};

const sentence = (v) => String(v || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

/**
 * One competency's Before -> Current -> Target story, built entirely from
 * real stored values (never animated or invented) — the row a judge should
 * be able to point at and ask "where did that number come from?".
 */
export default function CompetencyProgressCard({ row }) {
  const gapTone = row.status === 'STRONG' ? 'success' : row.status === 'DEVELOPING' ? 'warning' : 'danger';

  return (
    <div className="rounded-md border border-ink-200 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink-900">{row.competency}</p>
          <p className="text-xs text-ink-500">{CATEGORY_LABEL[row.category] || row.category}</p>
        </div>
        <Badge variant={row.status}>{sentence(row.status)}</Badge>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Before</span>
        <span className="font-display font-bold text-ink-700">{row.baseline ?? '—'}</span>
        <span className="text-ink-300">→</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Current</span>
        <span className="font-display font-bold text-ink-900">{row.current}</span>
        <span className="text-ink-300">→</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Target</span>
        <span className="font-display font-bold text-ink-900">{row.required}</span>
      </div>

      <GapBar current={row.current} required={row.required} tone={gapTone} />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        {row.improvement != null ? (
          <span className={`font-semibold ${row.improvement >= 0 ? 'text-success-700' : 'text-danger-700'}`}>
            {row.improvement >= 0 ? '+' : ''}
            {row.improvement} points since baseline
          </span>
        ) : (
          <span className="text-ink-500">Baseline will be available after the learner completes an initial assessment.</span>
        )}
        <span className="text-ink-500">
          Remaining gap: <strong className="text-ink-700">{row.remainingGap}</strong>
        </span>
      </div>
    </div>
  );
}
