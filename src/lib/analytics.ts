import type { PerformanceTrend, TrendDataPoint } from '@/types';

// ============================================================================
// PERCENTAGE CHANGE CALCULATIONS
// ============================================================================

/**
 * Calculate percentage change between two values
 *
 * @param current - Current value
 * @param previous - Previous value for comparison
 * @returns Percentage change (-100 to +Infinity) or null if previous is 0
 *
 * @example
 * calculatePercentageChange(150, 100) // 50 (50% increase)
 * calculatePercentageChange(75, 100) // -25 (25% decrease)
 * calculatePercentageChange(100, 0) // null (cannot calculate from 0)
 */
export function calculatePercentageChange(current: number, previous: number): number | null {
  if (previous === 0) {
    // Cannot calculate percentage change from 0
    // Return null to indicate undefined change
    return current > 0 ? null : 0;
  }
  return ((current - previous) / previous) * 100;
}

/**
 * Format percentage change for display
 *
 * @param change - Percentage change value
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string like "+12.5%" or "-8.3%" or "—" for null
 */
export function formatPercentageChange(change: number | null, decimals: number = 1): string {
  if (change === null) {
    return '—';
  }
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(decimals)}%`;
}

// ============================================================================
// SNAPSHOT ANALYSIS
// ============================================================================

export interface SnapshotData {
  date: Date;
  conversionRate: number;
  pageViews: number;
  revenue: number;
  bounceRate: number;
}

export function calculateTrend(snapshots: SnapshotData[]): PerformanceTrend {
  if (snapshots.length < 7) {
    return 'insufficient_data';
  }

  // Sort by date ascending
  const sorted = [...snapshots].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Split into two halves for comparison
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  // Calculate average conversion rate for each half
  const avgFirst = firstHalf.reduce((sum, s) => sum + s.conversionRate, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((sum, s) => sum + s.conversionRate, 0) / secondHalf.length;

  // Calculate percentage change
  const percentChange = ((avgSecond - avgFirst) / avgFirst) * 100;

  // Thresholds for trend detection
  const IMPROVING_THRESHOLD = 10; // 10% improvement
  const DECLINING_THRESHOLD = -10; // 10% decline

  if (percentChange >= IMPROVING_THRESHOLD) {
    return 'improving';
  } else if (percentChange <= DECLINING_THRESHOLD) {
    return 'declining';
  } else {
    return 'stable';
  }
}

export function prepareTrendData(snapshots: SnapshotData[]): TrendDataPoint[] {
  return snapshots
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((snapshot) => ({
      date: snapshot.date.toISOString().split('T')[0], // YYYY-MM-DD format
      conversionRate: snapshot.conversionRate,
      pageViews: snapshot.pageViews,
      revenue: snapshot.revenue,
      bounceRate: snapshot.bounceRate,
    }));
}

export function calculateAverageMetrics(snapshots: SnapshotData[]): {
  avgConversionRate: number;
  avgPageViews: number;
  avgRevenue: number;
  avgBounceRate: number;
  totalPageViews: number;
  totalRevenue: number;
} {
  if (snapshots.length === 0) {
    return {
      avgConversionRate: 0,
      avgPageViews: 0,
      avgRevenue: 0,
      avgBounceRate: 0,
      totalPageViews: 0,
      totalRevenue: 0,
    };
  }

  const total = snapshots.reduce(
    (acc, s) => ({
      conversionRate: acc.conversionRate + s.conversionRate,
      pageViews: acc.pageViews + s.pageViews,
      revenue: acc.revenue + s.revenue,
      bounceRate: acc.bounceRate + s.bounceRate,
    }),
    { conversionRate: 0, pageViews: 0, revenue: 0, bounceRate: 0 }
  );

  const count = snapshots.length;

  return {
    avgConversionRate: total.conversionRate / count,
    avgPageViews: total.pageViews / count,
    avgRevenue: total.revenue / count,
    avgBounceRate: total.bounceRate / count,
    totalPageViews: total.pageViews,
    totalRevenue: total.revenue,
  };
}

export function detectAnomalies(snapshots: SnapshotData[], threshold = 2): Date[] {
  if (snapshots.length < 7) {
    return [];
  }

  const conversionRates = snapshots.map((s) => s.conversionRate);
  const mean = conversionRates.reduce((sum, val) => sum + val, 0) / conversionRates.length;

  // Calculate standard deviation
  const variance =
    conversionRates.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / conversionRates.length;
  const stdDev = Math.sqrt(variance);

  // Find anomalies (values beyond threshold standard deviations from mean)
  const anomalies: Date[] = [];
  snapshots.forEach((snapshot) => {
    const zScore = Math.abs((snapshot.conversionRate - mean) / stdDev);
    if (zScore > threshold) {
      anomalies.push(snapshot.date);
    }
  });

  return anomalies;
}

export function comparePeriods(
  current: SnapshotData[],
  previous: SnapshotData[]
): {
  conversionRateChange: number;
  pageViewsChange: number;
  revenueChange: number;
  bounceRateChange: number;
} {
  const currentMetrics = calculateAverageMetrics(current);
  const previousMetrics = calculateAverageMetrics(previous);

  const calculateChange = (curr: number, prev: number): number => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return ((curr - prev) / prev) * 100;
  };

  return {
    conversionRateChange: calculateChange(
      currentMetrics.avgConversionRate,
      previousMetrics.avgConversionRate
    ),
    pageViewsChange: calculateChange(currentMetrics.avgPageViews, previousMetrics.avgPageViews),
    revenueChange: calculateChange(currentMetrics.avgRevenue, previousMetrics.avgRevenue),
    bounceRateChange: calculateChange(currentMetrics.avgBounceRate, previousMetrics.avgBounceRate),
  };
}
