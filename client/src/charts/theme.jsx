import React from 'react';

// One palette for every chart, taken from the Tailwind design tokens (primary / ink / success / warning / danger)
// so charts, badges and cards all speak the same colour language.
export const CHART = {
  current: '#4338ca', // primary-600  - the learner's current level / score
  currentSoft: '#818cf8', // primary-400
  required: '#94a3b8', // ink-400      - the target / required level
  before: '#cbd5e1', // ink-300
  after: '#4338ca',
  grid: '#e2e8f0', // ink-200
  axis: '#64748b', // ink-500
  cursor: '#f1f5f9', // ink-100
  success: '#059669',
  warning: '#d97706',
  danger: '#dc2626',
};

export const axisTick = { fontSize: 11, fill: CHART.axis };

export const tooltipProps = {
  cursor: { fill: CHART.cursor },
  contentStyle: {
    borderRadius: 8,
    border: `1px solid ${CHART.grid}`,
    boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.08)',
    fontSize: 12,
    padding: '8px 10px',
  },
  labelStyle: { fontWeight: 600, color: '#0f172a', marginBottom: 2 },
};

export const legendProps = { iconType: 'circle', iconSize: 8, wrapperStyle: { fontSize: 12, color: CHART.axis, paddingTop: 4 } };

// X-axis tick that wraps long names onto at most two lines instead of rotating (and clipping) them.
// `maxChars` is the width of one line: charts with many bars pass a smaller value so neighbouring labels never touch.
export function WrapTick({ x, y, payload, maxChars = 13 }) {
  const cut = (w) => (w.length > maxChars ? `${w.slice(0, maxChars - 1)}…` : w);
  const words = String(payload.value).split(/(?<=\/)\s*|\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 2).map(cut);
  if (lines.length > 2) shown[1] = `${shown[1].slice(0, maxChars - 1)}…`;
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{payload.value}</title>
      <text textAnchor="middle" fill={CHART.axis} fontSize={11}>
        {shown.map((l, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 14 : 13}>{l}</tspan>
        ))}
      </text>
    </g>
  );
}

// Radar axis label: shortened so it never runs off the edge of a narrow (phone) chart; the full name is in the tooltip/title.
export function RadarTick({ x, y, payload, textAnchor }) {
  const full = String(payload.value);
  const short = full.length > 11 ? `${full.slice(0, 10)}…` : full;
  return (
    <text x={x} y={y} textAnchor={textAnchor} fill={CHART.axis} fontSize={11}>
      <title>{full}</title>
      {short}
    </text>
  );
}
