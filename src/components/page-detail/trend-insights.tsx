'use client';

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { PerformanceSnapshot } from '@/types/api';

interface TrendInsightsProps {
  snapshots: PerformanceSnapshot[];
}

interface Insight {
  type: 'positive' | 'negative';
  message: string;
}

/**
 * Auto-generated trend insights based on 7-day performance changes.
 * Shows significant changes in conversion rate, revenue, traffic, and bounce rate.
 */
export function TrendInsights({ snapshots }: TrendInsightsProps) {
  const insights = useMemo(() => {
    if (snapshots.length < 2) return [];

    const latest = snapshots[0];
    const previous = snapshots[Math.min(7, snapshots.length - 1)];

    const change = (current: number, prev: number) =>
      prev === 0 ? 0 : ((current - prev) / prev) * 100;

    const changes = {
      conversionRate: change(latest.conversionRate, previous.conversionRate),
      revenue: change(latest.revenue, previous.revenue),
      pageViews: change(latest.pageViews, previous.pageViews),
      bounceRate: change(latest.bounceRate, previous.bounceRate),
    };

    const result: Insight[] = [];

    if (Math.abs(changes.conversionRate) >= 10) {
      result.push({
        type: changes.conversionRate > 0 ? 'positive' : 'negative',
        message: `Conversion rate ${changes.conversionRate > 0 ? 'increased' : 'decreased'} by ${Math.abs(changes.conversionRate).toFixed(1)}% over the past week`,
      });
    }

    if (Math.abs(changes.revenue) >= 15) {
      result.push({
        type: changes.revenue > 0 ? 'positive' : 'negative',
        message: `Revenue ${changes.revenue > 0 ? 'grew' : 'declined'} by ${Math.abs(changes.revenue).toFixed(1)}% compared to a week ago`,
      });
    }

    if (Math.abs(changes.pageViews) > 20) {
      result.push({
        type: changes.pageViews > 0 ? 'positive' : 'negative',
        message:
          changes.pageViews > 0
            ? `Traffic increased significantly by ${changes.pageViews.toFixed(1)}%`
            : `Traffic dropped by ${Math.abs(changes.pageViews).toFixed(1)}% - consider reviewing marketing efforts`,
      });
    }

    if (Math.abs(changes.bounceRate) > 10) {
      result.push({
        type: changes.bounceRate > 0 ? 'negative' : 'positive',
        message:
          changes.bounceRate > 0
            ? `Bounce rate increased by ${changes.bounceRate.toFixed(1)}% - page may need optimization`
            : `Bounce rate improved by ${Math.abs(changes.bounceRate).toFixed(1)}%`,
      });
    }

    return result;
  }, [snapshots]);

  if (insights.length === 0) return null;

  return (
    <div className="space-y-2">
      {insights.map((insight, index) => (
        <div
          key={index}
          className={`flex items-start gap-2 rounded-lg border p-3 ${
            insight.type === 'positive'
              ? 'bg-success/10 border-success/20'
              : 'bg-destructive/10 border-destructive/20'
          }`}
        >
          {insight.type === 'positive' ? (
            <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          )}
          <p
            className={`text-sm ${
              insight.type === 'positive' ? 'text-success' : 'text-destructive'
            }`}
          >
            {insight.message}
          </p>
        </div>
      ))}
    </div>
  );
}
