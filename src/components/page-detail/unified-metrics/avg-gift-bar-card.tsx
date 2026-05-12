'use client';

import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { Bar, BarChart, XAxis, YAxis, Cell } from 'recharts';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { DeltaBadge } from './delta-badge';
import { formatCurrency } from '@/lib/currency-utils';
import { useChartColors, LEGEND_DOT_CLASSES, ICON_BADGE_CLASSES } from '@/lib/chart-colors';
import type { ReportingCurrency } from '@/types/fundraising';

interface AvgGiftBarCardProps {
  avgGiftSingle: number;
  avgGiftRecurring: number;
  avgGiftChange?: number | null;
  currency: ReportingCurrency;
  description: string;
}

/**
 * Average gift comparison bar chart card
 *
 * Shows side-by-side bars comparing average one-time vs recurring gifts
 */
export function AvgGiftBarCard({
  avgGiftSingle,
  avgGiftRecurring,
  avgGiftChange,
  currency,
  description,
}: AvgGiftBarCardProps) {
  const colors = useChartColors();

  const chartConfig = useMemo(
    () => ({
      avgGift: {
        label: 'Average Gift',
      },
      oneTime: {
        label: 'One-Time',
        color: colors.oneTime,
      },
      recurring: {
        label: 'Recurring',
        color: colors.recurring,
      },
    }),
    [colors.oneTime, colors.recurring]
  ) satisfies ChartConfig;

  const chartData = [
    {
      type: 'One-Time',
      avgGift: avgGiftSingle,
      color: colors.oneTime,
    },
    {
      type: 'Recurring',
      avgGift: avgGiftRecurring,
      color: colors.recurring,
    },
  ];

  const hasData = avgGiftSingle > 0 || avgGiftRecurring > 0;

  // Handle empty state
  if (!hasData) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Average Gift</p>
            <p className="text-xs text-muted-foreground/70">{description}</p>
          </div>
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_BADGE_CLASSES.avgGift}`}
          >
            <TrendingUp className="h-5 w-5" />
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center pb-2">
          <p className="text-muted-foreground text-sm">No donation data</p>
        </CardContent>
        <CardFooter className="flex-col items-center pt-0">
          <span className="text-xs text-muted-foreground">No data available</span>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Average Gift</p>
          <p className="text-xs text-muted-foreground/70">{description}</p>
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_BADGE_CLASSES.avgGift}`}
        >
          <TrendingUp className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer config={chartConfig} className="h-[120px] w-full">
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            margin={{ left: 0, right: 8, top: 8, bottom: 8 }}
          >
            <YAxis
              dataKey="type"
              type="category"
              tickLine={false}
              tickMargin={8}
              axisLine={false}
              width={75}
              tick={{ fontSize: 11 }}
            />
            <XAxis dataKey="avgGift" type="number" hide />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value) => formatCurrency(value as number, currency)}
                />
              }
            />
            <Bar dataKey="avgGift" radius={4} barSize={20}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-center gap-2 pt-2">
        {/* Legend - same style as Donations card */}
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${LEGEND_DOT_CLASSES.oneTime}`} />
            One-Time: {formatCurrency(avgGiftSingle, currency)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${LEGEND_DOT_CLASSES.recurring}`} />
            Recurring: {formatCurrency(avgGiftRecurring, currency)}
          </span>
        </div>
        {avgGiftChange !== undefined && avgGiftChange !== null ? (
          <DeltaBadge change={avgGiftChange} positiveIsGood={true} size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground">No comparison data</span>
        )}
      </CardFooter>
    </Card>
  );
}
