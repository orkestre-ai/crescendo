'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatNumber } from '@/lib/currency-utils';
import { getTrackingStatusDescription } from '@/lib/tracking-utils';
import type { TrackingAccuracyProps } from '@/types/fundraising';
import type { TrackingAccuracyData } from '@/lib/tracking-utils';

/**
 * Info tooltip icon
 */
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className || 'h-4 w-4'}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

/**
 * Simple tooltip component
 * Using native CSS hover for simplicity - can be upgraded to Radix Tooltip if needed
 */
function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  return (
    <div className="relative group inline-flex items-center">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-sm bg-popover text-popover-foreground rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 w-64 z-50 pointer-events-none">
        {content}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-popover"></div>
      </div>
    </div>
  );
}

/**
 * Tracking rate visual indicator (circular progress style)
 */
function TrackingRateIndicator({
  rate,
  status,
  displayRate,
}: {
  rate: number | null;
  status: TrackingAccuracyData['status'];
  displayRate: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-20 h-20">
        {/* Background circle */}
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="16" fill="none" className="stroke-muted" strokeWidth="3" />
          {/* Progress circle */}
          {rate !== null && rate >= 0 && (
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              className="stroke-chart-1"
              strokeWidth="3"
              strokeDasharray={`${Math.min(rate, 100)} 100`}
              strokeLinecap="round"
            />
          )}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-chart-1">{displayRate}</span>
        </div>
      </div>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">
          {status === 'unknown'
            ? 'Unable to calculate'
            : rate !== null && rate > 100
              ? 'Over-tracking detected'
              : 'of transactions tracked'}
        </p>
      </div>
    </div>
  );
}

/**
 * Tracking Accuracy Section
 *
 * Compares GA4 conversion tracking to EN donation data to show
 * what percentage of transactions are being captured by analytics.
 */
export function TrackingAccuracy({
  trackingRate,
  ga4Count,
  enCount,
  revenueGap,
  currency,
  status = 'unknown',
  displayRate = 'Unknown',
}: TrackingAccuracyProps & {
  status?: TrackingAccuracyData['status'];
  displayRate?: string;
}) {
  const statusDescription = getTrackingStatusDescription(status);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Tracking Accuracy</CardTitle>
            <Tooltip content="Compares GA4 conversion events to EN donation records over the last 30 days. A lower rate may indicate GA4 tracking issues.">
              <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
            </Tooltip>
          </div>
          <span className="text-xs px-2 py-1 rounded bg-chart-1/10 text-chart-1">
            {status === 'good'
              ? 'Good'
              : status === 'warning'
                ? 'Needs Attention'
                : status === 'poor'
                  ? 'Low Coverage'
                  : 'Unknown'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <TrackingRateIndicator rate={trackingRate} status={status} displayRate={displayRate} />

        {/* Transaction counts comparison */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div>
            <p className="text-sm text-muted-foreground">GA4 Conversions</p>
            <p className="text-2xl font-semibold">{formatNumber(ga4Count)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">EN Donations</p>
            <p className="text-2xl font-semibold">{formatNumber(enCount)}</p>
          </div>
        </div>

        {/* Revenue gap */}
        {status !== 'unknown' && revenueGap > 0 && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">Estimated Untracked Revenue</p>
              <Tooltip content="Revenue from donations not captured by GA4. This is an estimate based on the tracking rate.">
                <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
              </Tooltip>
            </div>
            <p className="text-2xl font-semibold text-chart-2">
              {formatCurrency(revenueGap, currency)}
            </p>
          </div>
        )}

        {/* Status description */}
        <p className="text-sm text-muted-foreground pt-2">{statusDescription}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Empty state when tracking accuracy cannot be calculated
 */
export function TrackingAccuracyEmpty() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Tracking Accuracy</CardTitle>
          <Tooltip content="Compares GA4 conversion events to EN donation records to measure tracking coverage.">
            <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Unable to calculate tracking accuracy. Both GA4 and EN data are required for comparison.
          Ensure GA4 is configured and donations have been recorded.
        </p>
      </CardContent>
    </Card>
  );
}
