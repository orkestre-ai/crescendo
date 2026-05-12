'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import { useChartColors } from '@/lib/chart-colors';
import { TrendInsights } from '@/components/page-detail/trend-insights';
import type { PerformanceSnapshot } from '@/types/api';
import type { PeriodRange } from '@/components/page-detail/unified-metrics/types';

/**
 * Format a date as "MMM d" in UTC to avoid local timezone shifting.
 */
function formatDateUTC(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), 'MMM d');
}

interface TrendsChartProps {
  snapshots: PerformanceSnapshot[];
  singleDonations?: { date: Date; count: number; amount: number }[];
  recurringDonations?: { date: Date; count: number; amount: number }[];
  period: PeriodRange;
}

type ChartMetric = 'conversionRate' | 'revenue' | 'pageViews' | 'donations';

interface ChartDataPoint {
  date: string;
  conversionRate: number;
  revenue: number;
  pageViews: number;
  bounceRate: number;
  singleCount?: number;
  recurringCount?: number;
}

/**
 * Aggregate daily data into weekly buckets for All Time charts with >90 data points.
 */
function aggregateWeekly(data: ChartDataPoint[]): ChartDataPoint[] {
  if (data.length <= 90) return data;

  const weeks: ChartDataPoint[][] = [];
  for (let i = 0; i < data.length; i += 7) {
    weeks.push(data.slice(i, i + 7));
  }

  return weeks.map((week) => {
    const avg = (key: keyof ChartDataPoint) => {
      const vals = week.map((d) => (typeof d[key] === 'number' ? (d[key] as number) : 0));
      return vals.reduce((sum, v) => sum + v, 0) / vals.length;
    };
    const sum = (key: keyof ChartDataPoint) => {
      return week
        .map((d) => (typeof d[key] === 'number' ? (d[key] as number) : 0))
        .reduce((s, v) => s + v, 0);
    };

    return {
      date: week[0].date,
      conversionRate: avg('conversionRate'),
      revenue: sum('revenue'),
      pageViews: sum('pageViews'),
      bounceRate: avg('bounceRate'),
      singleCount: sum('singleCount' as keyof ChartDataPoint),
      recurringCount: sum('recurringCount' as keyof ChartDataPoint),
    };
  });
}

const METRIC_CONFIG: Record<
  ChartMetric,
  {
    label: string;
    shortLabel: string;
    dataKey: string;
    colorKey: keyof ReturnType<typeof useChartColors>;
    formatter: (value: number) => string;
  }
> = {
  conversionRate: {
    label: 'Conversion Rate',
    shortLabel: 'Conv Rate',
    dataKey: 'conversionRate',
    colorKey: 'conversionRate',
    formatter: (v) => `${v.toFixed(2)}%`,
  },
  revenue: {
    label: 'Revenue',
    shortLabel: 'Revenue',
    dataKey: 'revenue',
    colorKey: 'revenue',
    formatter: (v) => `$${v.toFixed(2)}`,
  },
  pageViews: {
    label: 'Page Views',
    shortLabel: 'Page Views',
    dataKey: 'pageViews',
    colorKey: 'pageViews',
    formatter: (v) => v.toLocaleString(),
  },
  donations: {
    label: 'Donations by Type',
    shortLabel: 'Donations',
    dataKey: 'singleCount',
    colorKey: 'oneTime',
    formatter: (v) => v.toLocaleString(),
  },
};

export function TrendsChart({
  snapshots,
  singleDonations,
  recurringDonations,
  period,
}: TrendsChartProps) {
  const [metric, setMetric] = useState<ChartMetric>('conversionRate');
  const colors = useChartColors();

  // Recharts v3 ResponsiveContainer doesn't SSR with real dimensions. Without
  // gating it behind a client-mount flag, the chart's internal clipPath is
  // sized to width(-1)/height(-1) on first paint, which clips parts of the
  // line off-canvas until the window is resized (Apr 30 → May 11 invisible).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const hasDonationBreakdown = !!(singleDonations && recurringDonations);

  // Slice data by period
  const chartData = useMemo(() => {
    const sliceCount = period === '7d' ? 7 : period === '30d' ? 30 : snapshots.length;

    const sliced = snapshots.slice(0, sliceCount);
    const reversed = [...sliced].reverse();

    const data: ChartDataPoint[] = reversed.map((snapshot) => {
      const snapshotDate = new Date(snapshot.date);
      const dateStr = formatDateUTC(snapshotDate);

      let singleCount = 0;
      let recurringCount = 0;

      if (hasDonationBreakdown) {
        const snapshotUTC = `${snapshotDate.getUTCFullYear()}-${String(snapshotDate.getUTCMonth() + 1).padStart(2, '0')}-${String(snapshotDate.getUTCDate()).padStart(2, '0')}`;
        const single = singleDonations?.find((d) => {
          const dd = new Date(d.date);
          return (
            `${dd.getUTCFullYear()}-${String(dd.getUTCMonth() + 1).padStart(2, '0')}-${String(dd.getUTCDate()).padStart(2, '0')}` ===
            snapshotUTC
          );
        });
        const recurring = recurringDonations?.find((d) => {
          const dd = new Date(d.date);
          return (
            `${dd.getUTCFullYear()}-${String(dd.getUTCMonth() + 1).padStart(2, '0')}-${String(dd.getUTCDate()).padStart(2, '0')}` ===
            snapshotUTC
          );
        });
        singleCount = single?.count ?? 0;
        recurringCount = recurring?.count ?? 0;
      }

      return {
        date: dateStr,
        conversionRate: snapshot.conversionRate * 100,
        revenue: snapshot.revenue,
        pageViews: snapshot.pageViews,
        bounceRate: snapshot.bounceRate * 100,
        singleCount,
        recurringCount,
      };
    });

    return period === 'allTime' ? aggregateWeekly(data) : data;
  }, [snapshots, singleDonations, recurringDonations, period, hasDonationBreakdown]);

  if (snapshots.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No historical data available yet. Data will appear after multiple collection cycles.
          </p>
        </CardContent>
      </Card>
    );
  }

  const activeConfig = METRIC_CONFIG[metric];
  const tooltipStyle = {
    backgroundColor: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle>Performance Trends</CardTitle>
          <Tabs value={metric} onValueChange={(v) => setMetric(v as ChartMetric)}>
            <TabsList>
              <TabsTrigger value="conversionRate">Conv Rate</TabsTrigger>
              <TabsTrigger value="revenue">Revenue</TabsTrigger>
              <TabsTrigger value="pageViews">Page Views</TabsTrigger>
              {hasDonationBreakdown && <TabsTrigger value="donations">Donations</TabsTrigger>}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: 300 }}>
          {mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke={colors.mutedForeground} />
                <YAxis tick={{ fontSize: 12 }} stroke={colors.mutedForeground} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => activeConfig.formatter(Number(value))}
                />
                {metric === 'donations' ? (
                  <>
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="singleCount"
                      name="One-time"
                      stroke={colors.oneTime}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="recurringCount"
                      name="Recurring"
                      stroke={colors.recurring}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </>
                ) : (
                  <Line
                    type="monotone"
                    dataKey={activeConfig.dataKey}
                    stroke={colors[activeConfig.colorKey]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        {period === '7d' && (
          <div className="mt-4">
            <TrendInsights snapshots={snapshots} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
