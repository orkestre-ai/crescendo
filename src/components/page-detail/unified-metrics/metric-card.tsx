'use client';

import { DeltaBadge } from './delta-badge';
import { Sparkline } from './sparkline';
import type { MetricCardProps } from './types';

/**
 * Enhanced metric card with optional sparkline and delta badge
 *
 * Layout:
 * +-------------------------------------------+
 * | [Icon]  Label                             |
 * |         Value           [Sparkline]       |
 * |         [DeltaBadge]                      |
 * +-------------------------------------------+
 */
export function MetricCard({
  label,
  value,
  change,
  positiveIsGood = true,
  icon,
  sparklineData,
  sparklineColor,
}: MetricCardProps) {
  const hasSparkline = sparklineData && sparklineData.length >= 2;
  const hasChange = change !== undefined;

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
      {/* Icon */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Label */}
        <p className="text-sm text-muted-foreground">{label}</p>

        {/* Value row with optional sparkline */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xl font-bold truncate">{value}</p>

          {/* Sparkline - hidden on small screens */}
          {hasSparkline && (
            <div className="hidden sm:block shrink-0">
              <Sparkline data={sparklineData} color={sparklineColor} width={72} height={28} />
            </div>
          )}
        </div>

        {/* Delta badge */}
        {hasChange && (
          <div className="mt-0.5">
            <DeltaBadge change={change} positiveIsGood={positiveIsGood} />
          </div>
        )}
      </div>
    </div>
  );
}
