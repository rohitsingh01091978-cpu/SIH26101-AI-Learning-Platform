import React from 'react';
import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CHART, RadarTick, legendProps, tooltipProps } from './theme.jsx';

export default function CompetencyRadarChart({ data }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={360}>
      <RadarChart data={data} outerRadius="55%">
        <PolarGrid stroke={CHART.grid} />
        <PolarAngleAxis dataKey="competency" tick={<RadarTick />} />
        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} />
        <Radar name="Required level" dataKey="requiredLevel" stroke={CHART.required} fill={CHART.required} fillOpacity={0.12} strokeDasharray="4 3" />
        <Radar name="Current level" dataKey="currentLevel" stroke={CHART.current} fill={CHART.currentSoft} fillOpacity={0.35} strokeWidth={2} />
        <Tooltip {...tooltipProps} />
        <Legend {...legendProps} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
