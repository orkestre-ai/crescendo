/**
 * Type definitions for UnifiedMetricsSection component
 */

import type { ReportingCurrency } from '@/types/fundraising';

/**
 * Period range selector values
 */
export type PeriodRange = '7d' | '30d' | 'allTime';

/**
 * Aggregated period data for a metric set
 */
export interface PeriodData {
  revenue: number;
  donors: number;
  singleCount: number;
  singleAmount: number;
  recurringCount: number;
  recurringAmount: number;
  avgGift: number;
}

/**
 * Comparison data for previous period (subset of PeriodData)
 * EN API only provides these metrics for period comparison
 */
export interface PeriodComparisonData {
  revenue: number;
  donors: number;
  avgGift: number;
}

/**
 * Data point for sparkline visualization
 */
export interface SparklinePoint {
  value: number;
}

/**
 * Daily snapshot data used for sparklines
 */
export interface DailySnapshot {
  date: Date;
  revenue: number;
  pageViews: number;
  conversions: number;
}

/**
 * Period-specific data with comparison
 */
export interface PeriodMetrics {
  current: PeriodData;
  previous?: PeriodComparisonData;
  isPartial: boolean;
  sinceDate?: Date;
}

/**
 * Lifetime aggregate data for the All Time view
 */
export interface AllTimeData {
  totalRevenue: number;
  supporters: number;
  registrations: number;
  highestDonation: number;
  averageDonation: number;
  sinceDate: Date;
}

/**
 * Props for the UnifiedMetricsSection component
 */
export interface UnifiedMetricsProps {
  currency: ReportingCurrency;

  /** 7-day period data with optional comparison to previous 7 days */
  sevenDay: PeriodMetrics | null;

  /** 30-day period data with optional comparison to previous 30 days */
  thirtyDay: PeriodMetrics | null;

  /** Lifetime aggregate data for the All Time view */
  allTime: AllTimeData | null;

  /** Daily snapshots for sparklines (should contain at least 30 days) */
  dailySnapshots: DailySnapshot[];
}

/**
 * Props for individual MetricCard component
 */
export interface MetricCardProps {
  label: string;
  value: string;
  change?: number | null;
  positiveIsGood?: boolean;
  icon: React.ReactNode;
  sparklineData?: SparklinePoint[];
  sparklineColor?: string;
}

/**
 * Props for DeltaBadge component
 */
export interface DeltaBadgeProps {
  change: number | null;
  positiveIsGood?: boolean;
  size?: 'sm' | 'md';
}

/**
 * Props for Sparkline component
 */
export interface SparklineProps {
  data: SparklinePoint[];
  width?: number;
  height?: number;
  color?: string;
  showArea?: boolean;
}
