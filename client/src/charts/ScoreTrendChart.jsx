import React from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART, axisTick, tooltipProps } from './theme.jsx';

export default function ScoreTrendChart({ data, height = 240 }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} />
        <YAxis domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipProps} cursor={{ stroke: CHART.grid }} />
        <Line type="monotone" dataKey="score" stroke={CHART.current} strokeWidth={2} dot={{ r: 3, fill: CHART.current }} activeDot={{ r: 5 }} name="Score %" />
      </LineChart>
    </ResponsiveContainer>
  );
}
