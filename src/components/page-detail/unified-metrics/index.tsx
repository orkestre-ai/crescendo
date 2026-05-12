'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/currency-utils';
import { calculatePercentageChange } from '@/lib/analytics';
import { RevenueCard } from './revenue-card';
import { DonationsRadialCard } from './donations-radial-card';
import { AvgGiftBarCard } from './avg-gift-bar-card';
import { AllTimeCards } from './all-time-cards';
import type { UnifiedMetricsProps, PeriodRange, SparklinePoint } from './types';

/**
 * Unified metrics section (Zone 1) with global period selector.
 *
 * Features:
 * - Tabbed period selector (7 Days / 30 Days / All Time)
 * - 7d/30d: 3 enhanced metric cards (Revenue, Donations Radial, Avg Gift Bar)
 * - All Time: 3 stat cards (Total Revenue, Supporters, Highest Gift)
 *
 * Period state is owned by the parent (MetricsTab) and passed as props
 * so that zone 2 (TrendsChart) can also react to period changes.
 */
export function UnifiedMetricsSection({
  currency,
  sevenDay,
  thirtyDay,
  allTime,
  dailySnapshots,
  period,
  onPeriodChange,
}: UnifiedMetricsProps & {
  period: PeriodRange;
  onPeriodChange: (period: PeriodRange) => void;
}) {
  // Select data based on current period (7d/30d only — allTime uses AllTimeCards)
  const currentPeriod = period === '7d' ? sevenDay : period === '30d' ? thirtyDay : null;

  // Prepare sparkline data for revenue (from daily GA4 snapshots)
  const revenueSparkline = useMemo((): SparklinePoint[] => {
    const days = period === '7d' ? 7 : 30;
    return dailySnapshots
      .slice(0, days)
      .reverse()
      .map((s) => ({ value: s.revenue }));
  }, [dailySnapshots, period]);

  // Calculate percentage changes
  const changes = useMemo(() => {
    if (!currentPeriod?.current || !currentPeriod?.previous) {
      return {
        revenue: undefined,
        donors: undefined,
        avgGift: undefined,
      };
    }

    return {
      revenue: calculatePercentageChange(
        currentPeriod.current.revenue,
        currentPeriod.previous.revenue
      ),
      donors: calculatePercentageChange(
        currentPeriod.current.donors,
        currentPeriod.previous.donors
      ),
      avgGift: calculatePercentageChange(
        currentPeriod.current.avgGift,
        currentPeriod.previous.avgGift
      ),
    };
  }, [currentPeriod]);

  // Calculate average gifts for one-time and recurring
  const avgGifts = useMemo(() => {
    if (!currentPeriod?.current) {
      return { single: 0, recurring: 0 };
    }

    const { singleCount, singleAmount, recurringCount, recurringAmount } = currentPeriod.current;

    return {
      single: singleCount > 0 ? singleAmount / singleCount : 0,
      recurring: recurringCount > 0 ? recurringAmount / recurringCount : 0,
    };
  }, [currentPeriod]);

  // Determine if we have any data to show
  const hasData = sevenDay || thirtyDay || allTime;

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No fundraising data available. This page may not have an associated EN campaign, or the
            EN Public API token may not be configured.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Period tabs shared across all states
  const periodTabs = (
    <Tabs value={period} onValueChange={(value) => onPeriodChange(value as PeriodRange)}>
      <TabsList>
        <TabsTrigger value="7d" disabled={!sevenDay}>
          7 Days
        </TabsTrigger>
        <TabsTrigger value="30d" disabled={!thirtyDay}>
          30 Days
        </TabsTrigger>
        <TabsTrigger value="allTime" disabled={!allTime}>
          All Time
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  // All Time view
  if (period === 'allTime' && allTime) {
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle>All Time</CardTitle>
            {periodTabs}
          </div>
        </CardHeader>
        <CardContent>
          <AllTimeCards data={allTime} currency={currency} />
        </CardContent>
      </Card>
    );
  }

  // If current period (7d/30d) has no data, show empty state
  if (!currentPeriod) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Performance</CardTitle>
            {periodTabs}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No data available for the selected period.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { current, previous, isPartial, sinceDate } = currentPeriod;

  // Format the period label
  const periodLabel = period === '7d' ? 'Last 7 Days' : 'Last 30 Days';
  const comparisonLabel = period === '7d' ? 'vs previous 7 days' : 'vs previous 30 days';

  // Format since date for partial periods
  const formatSinceDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <CardTitle>{periodLabel}</CardTitle>
            {isPartial && sinceDate && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                Since {formatSinceDate(sinceDate)}
              </span>
            )}
          </div>
          {periodTabs}
        </div>
        {previous && <p className="text-sm text-muted-foreground">{comparisonLabel}</p>}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RevenueCard
            value={formatCurrency(current.revenue, currency)}
            previousValue={previous ? formatCurrency(previous.revenue, currency) : undefined}
            change={changes.revenue}
            sparklineData={revenueSparkline}
            description={`Total ${periodLabel.toLowerCase()}`}
          />
          <DonationsRadialCard
            singleCount={current.singleCount}
            recurringCount={current.recurringCount}
            donorsChange={changes.donors}
            description="One-time vs recurring"
          />
          <AvgGiftBarCard
            avgGiftSingle={avgGifts.single}
            avgGiftRecurring={avgGifts.recurring}
            avgGiftChange={changes.avgGift}
            currency={currency}
            description="By donation type"
          />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Empty state when no metrics data is available
 */
export function UnifiedMetricsEmpty() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          No fundraising data available. This page may not have an associated EN campaign, or the EN
          Public API token may not be configured.
        </p>
      </CardContent>
    </Card>
  );
}
