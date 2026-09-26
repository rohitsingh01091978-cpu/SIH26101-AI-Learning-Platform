import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART, axisTick, tooltipProps, WrapTick } from './theme.jsx';

export default function CompetencyBarChart({ data, dataKey = 'currentLevel', color = CHART.current, height = 280 }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="name" tick={<WrapTick maxChars={data.length > 6 ? 10 : 14} />} interval={0} height={48} tickLine={false} />
        <YAxis domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipProps} />
        <Bar dataKey={dataKey} name="Level" fill={color} radius={[4, 4, 0, 0]} maxBarSize={56} />
      </BarChart>
    </ResponsiveContainer>
  );
}
