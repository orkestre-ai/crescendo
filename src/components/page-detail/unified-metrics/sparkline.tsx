'use client';

import { useId } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import type { SparklineProps } from './types';

/**
 * Minimal sparkline chart for inline metric visualization
 *
 * Uses Recharts AreaChart with all labels/axes hidden
 * for a clean, compact trend indicator.
 */
export function Sparkline({
  data,
  width = 80,
  height = 32,
  color,
  showArea = true,
}: SparklineProps) {
  const gradientId = useId();

  // Need at least 2 points to render a meaningful sparkline
  if (!data || data.length < 2) {
    return (
      <div style={{ width, height }} className="flex items-center justify-center">
        <div className="h-px w-full bg-muted" />
      </div>
    );
  }

  // Recharts needs named keys
  const chartData = data.map((point, index) => ({
    index,
    value: point.value,
  }));

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={showArea ? `url(#${gradientId})` : 'none'}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
