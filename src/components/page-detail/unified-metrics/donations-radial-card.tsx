'use client';

import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from 'recharts';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { DeltaBadge } from './delta-badge';
import { formatNumber } from '@/lib/currency-utils';
import { useChartColors, LEGEND_DOT_CLASSES, ICON_BADGE_CLASSES } from '@/lib/chart-colors';

interface DonationsRadialCardProps {
  singleCount: number;
  recurringCount: number;
  donorsChange?: number | null;
  description: string;
}

/**
 * Donations breakdown radial chart card
 *
 * Shows a half-circle radial chart with one-time vs recurring donations
 * Center label shows total donations count
 */
export function DonationsRadialCard({
  singleCount,
  recurringCount,
  donorsChange,
  description,
}: DonationsRadialCardProps) {
  const colors = useChartColors();

  const chartConfig = useMemo(
    () => ({
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

  const totalDonations = singleCount + recurringCount;

  const chartData = [
    {
      name: 'donations',
      oneTime: singleCount,
      recurring: recurringCount,
    },
  ];

  // Handle empty state
  if (totalDonations === 0) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Donations</p>
            <p className="text-xs text-muted-foreground/70">{description}</p>
          </div>
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_BADGE_CLASSES.donations}`}
          >
            <Users className="h-5 w-5" />
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center pb-2">
          <p className="text-muted-foreground text-sm">No donations</p>
        </CardContent>
        <CardFooter className="pt-0">
          <span className="text-xs text-muted-foreground">No data available</span>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-0">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Donations</p>
          <p className="text-xs text-muted-foreground/70">{description}</p>
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_BADGE_CLASSES.donations}`}
        >
          <Users className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 items-center justify-center p-0">
        <ChartContainer config={chartConfig} className="mx-auto w-full max-w-[260px] h-[150px]">
          <RadialBarChart
            data={chartData}
            endAngle={180}
            innerRadius={70}
            outerRadius={120}
            cx="50%"
            cy="80%"
          >
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) - 8}
                          className="fill-foreground text-2xl font-bold"
                        >
                          {formatNumber(totalDonations)}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 10}
                          className="fill-muted-foreground text-xs"
                        >
                          Donations
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </PolarRadiusAxis>
            <RadialBar
              dataKey="oneTime"
              stackId="a"
              cornerRadius={4}
              fill={colors.oneTime}
              className="stroke-transparent stroke-2"
            />
            <RadialBar
              dataKey="recurring"
              fill={colors.recurring}
              stackId="a"
              cornerRadius={4}
              className="stroke-transparent stroke-2"
            />
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 pt-2">
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${LEGEND_DOT_CLASSES.oneTime}`} />
            One-Time: {formatNumber(singleCount)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${LEGEND_DOT_CLASSES.recurring}`} />
            Recurring: {formatNumber(recurringCount)}
          </span>
        </div>
        {donorsChange !== undefined && donorsChange !== null ? (
          <DeltaBadge change={donorsChange} positiveIsGood={true} size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground">No comparison data</span>
        )}
      </CardFooter>
    </Card>
  );
}
