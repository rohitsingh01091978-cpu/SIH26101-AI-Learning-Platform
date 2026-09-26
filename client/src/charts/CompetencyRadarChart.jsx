import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

export default function CompetencyRadarChart({ data }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} outerRadius="75%">
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="competency" tick={{ fontSize: 11, fill: '#64748b' }} />
        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
        <Radar name="Current level" dataKey="currentLevel" stroke="#2558eb" fill="#3b76f6" fillOpacity={0.35} />
        <Radar name="Required level" dataKey="requiredLevel" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.1} />
        <Tooltip />
      </RadarChart>
    </ResponsiveContainer>
  );
}
