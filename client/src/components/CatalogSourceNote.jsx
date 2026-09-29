import React from 'react';
import { Info } from 'lucide-react';
import Tooltip from './Tooltip.jsx';
import { catalogLabel, CATALOG_DISCLAIMER } from '../utils/display';

/**
 * Subtle, honest source label shown wherever a course from the catalog is
 * displayed — never visually dominant, but never absent either. Says exactly
 * what it is: the seeded prototype catalog, unless a live iGOT connection is
 * actually configured server-side (source will then read "iGOT Karmayogi (live)").
 */
export default function CatalogSourceNote({ source, className = '' }) {
  const label = catalogLabel(source);
  const isLive = /live/i.test(label);

  return (
    <Tooltip label={isLive ? 'Connected to a live iGOT Karmayogi API.' : CATALOG_DISCLAIMER} wrap side="top">
      <span className={`inline-flex cursor-help items-center gap-1 text-[11px] text-ink-500 ${className}`}>
        <Info size={11} className="shrink-0" />
        {label}
      </span>
    </Tooltip>
  );
}
