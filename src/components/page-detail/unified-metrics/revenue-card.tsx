'use client';

import { DollarSign } from 'lucide-react';
import { useChartColors, ICON_BADGE_CLASSES } from '@/lib/chart-colors';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Sparkline } from './sparkline';
import { DeltaBadge } from './delta-badge';
import type { SparklinePoint } from './types';

interface RevenueCardProps {
  value: string;
  previousValue?: string;
  change?: number | null;
  sparklineData: SparklinePoint[];
  description: string;
}

/**
 * Revenue metric card with sparkline visualization
 */
export function RevenueCard({
  value,
  previousValue,
  change,
  sparklineData,
  description,
}: RevenueCardProps) {
  const colors = useChartColors();
  const hasSparkline = sparklineData && sparklineData.length >= 2;

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Revenue</p>
          <p className="text-xs text-muted-foreground/70">{description}</p>
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_BADGE_CLASSES.revenue}`}
        >
          <DollarSign className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-2 flex flex-col items-center">
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        {hasSparkline && (
          <div className="mt-4">
            <Sparkline data={sparklineData} color={colors.revenue} width={240} height={48} />
          </div>
        )}
      </CardContent>
      <CardFooter className="flex-col items-center gap-2 pt-2">
        {previousValue && (
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Previous Period</p>
            <p className="text-2xl font-semibold text-muted-foreground">{previousValue}</p>
          </div>
        )}
        {change !== undefined && change !== null ? (
          <DeltaBadge change={change} positiveIsGood={true} size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground">No comparison data</span>
        )}
      </CardFooter>
    </Card>
  );
}
