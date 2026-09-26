import React from 'react';
import { FileText, ChevronDown } from 'lucide-react';
import Badge from './Badge.jsx';

/**
 * Vertical "Learning Material -> Competency -> Category" chains. Deliberately
 * only as many levels as the analysis actually supports — no invented
 * intermediate topic hierarchy the backend never returned.
 */
export default function CompetencyChainMap({ chains }) {
  if (!chains?.length) return null;

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {chains.map((chain) => (
        <div key={chain.competency} className="flex flex-col items-center gap-1.5 rounded-lg border border-ink-200 bg-surface-subtle py-5">
          <ChainNode label="Learning Material" icon={FileText} />
          <ChevronDown size={14} className="text-ink-300" />
          <ChainNode label={chain.competency} tone="primary" />
          {chain.category && (
            <>
              <ChevronDown size={14} className="text-ink-300" />
              <Badge variant={chain.category}>{chain.category.replace(/_/g, ' ')}</Badge>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function ChainNode({ label, icon: Icon, tone }) {
  const toneClasses = tone === 'primary' ? 'border-primary-300 bg-primary-50 text-primary-800' : 'border-ink-200 bg-white text-ink-700';
  return (
    <div className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold ${toneClasses}`}>
      {Icon && <Icon size={12} />}
      {label}
    </div>
  );
}
