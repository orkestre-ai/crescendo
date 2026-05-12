'use client';

import { useState } from 'react';
import { UnifiedMetricsSection } from '@/components/page-detail/unified-metrics';
import { TrendsChart } from '@/components/page-detail/trends-chart';

import {
  TrackingAccuracy,
  TrackingAccuracyEmpty,
} from '@/components/page-detail/tracking-accuracy';
import type { FundraisingPage, PerformanceSnapshot } from '@/types/api';
import type { ReportingCurrency } from '@/types/fundraising';
import type { TrackingAccuracyData } from '@/lib/tracking-utils';
import type {
  PeriodMetrics,
  PeriodRange,
  AllTimeData,
} from '@/components/page-detail/unified-metrics/types';

export interface MetricsTabProps {
  page: FundraisingPage;
  snapshots: PerformanceSnapshot[];
  reportingCurrency: ReportingCurrency;
  recentPerformance: {
    current: PeriodMetrics['current'];
    previous?: PeriodMetrics['previous'];
    isPartialPeriod: boolean;
  } | null;
  thirtyDaySummary: {
    revenue: number;
    donors: number;
    singleCount: number;
    singleAmount: number;
    recurringCount: number;
    recurringAmount: number;
    isPartialPeriod: boolean;
    sinceDate: Date;
  } | null;
  lifetimeTotals: {
    totalRevenue: number;
    supporters: number;
    highestDonation: number;
    averageDonation: number;
    sinceDate: Date;
    registrations: number;
  } | null;
  trackingAccuracy: TrackingAccuracyData;
}

export function MetricsTab({
  snapshots,
  reportingCurrency,
  recentPerformance,
  thirtyDaySummary,
  lifetimeTotals,
  trackingAccuracy,
}: MetricsTabProps) {
  const [period, setPeriod] = useState<PeriodRange>('7d');

  // Build allTime data from lifetimeTotals
  const allTimeData: AllTimeData | null = lifetimeTotals
    ? {
        totalRevenue: lifetimeTotals.totalRevenue,
        supporters: lifetimeTotals.supporters,
        registrations: lifetimeTotals.registrations,
        highestDonation: lifetimeTotals.highestDonation,
        averageDonation: lifetimeTotals.averageDonation,
        sinceDate: lifetimeTotals.sinceDate,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Zone 1: At a Glance */}
      <UnifiedMetricsSection
        currency={reportingCurrency}
        sevenDay={
          recentPerformance
            ? {
                current: recentPerformance.current,
                previous: recentPerformance.previous,
                isPartial: recentPerformance.isPartialPeriod,
              }
            : null
        }
        thirtyDay={
          thirtyDaySummary
            ? {
                current: {
                  revenue: thirtyDaySummary.revenue,
                  donors: thirtyDaySummary.donors,
                  singleCount: thirtyDaySummary.singleCount,
                  singleAmount: thirtyDaySummary.singleAmount,
                  recurringCount: thirtyDaySummary.recurringCount,
                  recurringAmount: thirtyDaySummary.recurringAmount,
                  avgGift:
                    thirtyDaySummary.donors > 0
                      ? thirtyDaySummary.revenue / thirtyDaySummary.donors
                      : 0,
                },
                isPartial: thirtyDaySummary.isPartialPeriod,
                sinceDate: thirtyDaySummary.sinceDate,
              }
            : null
        }
        allTime={allTimeData}
        dailySnapshots={snapshots.map((s) => ({
          date: s.date,
          revenue: s.revenue,
          pageViews: s.pageViews,
          conversions: s.conversions,
        }))}
        period={period}
        onPeriodChange={setPeriod}
      />

      {/* Zone 2: Deep Dive — Chart */}
      {snapshots.length > 0 && <TrendsChart snapshots={snapshots} period={period} />}

      {/* Zone 2: Tracking Accuracy */}
      {trackingAccuracy.status !== 'unknown' ? (
        <TrackingAccuracy
          trackingRate={trackingAccuracy.trackingRate}
          ga4Count={trackingAccuracy.ga4Count}
          enCount={trackingAccuracy.enCount}
          revenueGap={trackingAccuracy.revenueGap}
          currency={reportingCurrency}
          status={trackingAccuracy.status}
          displayRate={trackingAccuracy.displayRate}
        />
      ) : (
        <TrackingAccuracyEmpty />
      )}
    </div>
  );
}
