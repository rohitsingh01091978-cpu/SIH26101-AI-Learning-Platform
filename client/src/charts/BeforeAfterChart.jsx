import React from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART, axisTick, legendProps, tooltipProps, WrapTick } from './theme.jsx';

export default function BeforeAfterChart({ data }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={290}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="competency" tick={<WrapTick />} interval={0} height={48} tickLine={false} />
        <YAxis domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipProps} />
        <Legend {...legendProps} />
        <Bar dataKey="before" name="Before" fill={CHART.before} radius={[4, 4, 0, 0]} maxBarSize={48} />
        <Bar dataKey="after" name="After" fill={CHART.after} radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
