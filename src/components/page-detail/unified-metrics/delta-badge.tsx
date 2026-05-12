'use client';

import { cn } from '@/lib/utils';
import { formatPercentageChange } from '@/lib/analytics';
import { ArrowUpIcon, ArrowDownIcon } from './metric-icons';
import type { DeltaBadgeProps } from './types';

/**
 * Pill-style badge showing percentage change with colored background
 *
 * - Green background for positive changes (when positiveIsGood=true)
 * - Red background for negative changes
 * - Neutral gray when change is null or zero
 */
export function DeltaBadge({ change, positiveIsGood = true, size = 'sm' }: DeltaBadgeProps) {
  // Handle null/undefined case
  if (change === null || change === undefined) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full font-medium',
          'bg-muted text-muted-foreground',
          size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
        )}
      >
        <span>—</span>
      </span>
    );
  }

  const isPositive = change > 0;
  const isNegative = change < 0;
  const isZero = change === 0;

  // Determine if this change is "good" or "bad"
  const isGood = positiveIsGood ? isPositive : isNegative;
  const isBad = positiveIsGood ? isNegative : isPositive;

  // Color classes based on whether the change is good/bad
  const colorClasses = isZero
    ? 'bg-muted text-muted-foreground'
    : isGood
      ? 'bg-success/10 text-success'
      : isBad
        ? 'bg-destructive/10 text-destructive'
        : 'bg-muted text-muted-foreground';

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  const iconClass = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        colorClasses,
        sizeClasses
      )}
    >
      {isPositive && <ArrowUpIcon className={iconClass} />}
      {isNegative && <ArrowDownIcon className={iconClass} />}
      <span>{formatPercentageChange(change)}</span>
    </span>
  );
}
