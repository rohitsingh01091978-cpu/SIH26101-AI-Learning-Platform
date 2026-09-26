import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

const TONES = {
  primary: 'bg-primary-50 text-primary-700',
  accent: 'bg-accent-50 text-accent-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
};

export default function KPICard({ icon: Icon, label, value, sub, trend, tone = 'primary' }) {
  const TrendIcon = trend == null ? null : trend > 0 ? ArrowUpRight : trend < 0 ? ArrowDownRight : Minus;
  const trendTone = trend > 0 ? 'text-success-600' : trend < 0 ? 'text-danger-600' : 'text-ink-500';

  return (
    <div className="card-interactive">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
        {Icon && (
          <div className={`rounded-md p-1.5 ${TONES[tone] || TONES.primary}`}>
            <Icon size={16} />
          </div>
        )}
      </div>
      <p className="mt-2 font-display text-[28px] font-bold leading-none text-ink-900">{value}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {TrendIcon && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${trendTone}`}>
            <TrendIcon size={13} />
            {Math.abs(trend)}%
          </span>
        )}
        {sub && <span className="text-xs text-ink-500">{sub}</span>}
      </div>
    </div>
  );
}
