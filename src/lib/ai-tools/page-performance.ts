import { prisma } from '@/lib/db';
import { createAiToolLogger } from '@/lib/logging/journeys';
import type { ToolSkill } from './types';

export const pagePerformanceTool: ToolSkill = {
  schema: {
    name: 'page_performance',
    description:
      "Retrieve this page's performance metrics for a specific date range, or compare two date ranges side-by-side.",
    input_schema: {
      type: 'object' as const,
      properties: {
        pageId: {
          type: 'string',
          description: 'The page ID',
        },
        startDate: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        endDate: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
        compareStartDate: {
          type: 'string',
          description: 'Optional: start date of comparison period',
        },
        compareEndDate: {
          type: 'string',
          description: 'Optional: end date of comparison period',
        },
      },
      required: ['pageId', 'startDate', 'endDate'],
    },
  },

  instructions: `Use this tool for custom date ranges or period-over-period comparisons beyond the pre-loaded 7-day and 30-day metrics.

For general current performance, refer to the pre-loaded metrics in the system prompt first — only call this tool for:
- Custom date ranges (e.g., "last 90 days", "Q1 2026")
- Period-over-period comparison (e.g., "this month vs last month")
- Daily-level data within a range`,

  async execute(params) {
    const toolLog = createAiToolLogger('page_performance');
    const start = Date.now();

    const { pageId, startDate, endDate, compareStartDate, compareEndDate } = params as {
      pageId: string;
      startDate: string;
      endDate: string;
      compareStartDate?: string;
      compareEndDate?: string;
    };

    try {
      const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
      const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

      const computeMetrics = async (s: string, end: string) => {
        const snapshots = await prisma.performanceSnapshot.findMany({
          where: {
            pageId,
            date: { gte: new Date(s), lte: new Date(end) },
          },
          orderBy: { date: 'asc' },
          select: {
            date: true,
            pageViews: true,
            bounceRate: true,
            conversions: true,
            revenue: true,
            conversionRate: true,
            avgSessionDuration: true,
          },
        });

        return {
          days: snapshots.length,
          totalPageViews: sum(snapshots.map((snap) => snap.pageViews)),
          totalConversions: sum(snapshots.map((snap) => snap.conversions)),
          totalRevenue: sum(snapshots.map((snap) => snap.revenue).filter((r): r is number => r !== null)),
          avgConversionRate: avg(
            snapshots.map((snap) => snap.conversionRate).filter((r): r is number => r !== null)
          ),
          avgBounceRate: avg(
            snapshots.map((snap) => snap.bounceRate).filter((r): r is number => r !== null)
          ),
          avgSessionDuration: avg(
            snapshots.map((snap) => snap.avgSessionDuration).filter((r): r is number => r !== null)
          ),
          dailyData: snapshots,
        };
      };

      const primary = await computeMetrics(startDate, endDate);

      if (!compareStartDate || !compareEndDate) {
        const durationMs = Date.now() - start;
        const trendDirection = primary.days >= 2 ? 'single-period' : 'insufficient';
        toolLog.pagePerformance(pageId, trendDirection, primary.days);
        toolLog.executed(pageId, durationMs, primary.days);

        return {
          data: { period: { startDate, endDate }, metrics: primary },
          summary: `${primary.days} days of data: ${primary.totalPageViews} views, ${primary.totalConversions} conversions, $${primary.totalRevenue.toFixed(2)} revenue`,
        };
      }

      const comparison = await computeMetrics(compareStartDate, compareEndDate);
      const delta = (a: number, b: number) => (b !== 0 ? ((a - b) / b) * 100 : 0);

      const durationMs = Date.now() - start;
      const revDelta = delta(primary.totalRevenue, comparison.totalRevenue);
      const trendDirection = revDelta > 0 ? 'up' : revDelta < 0 ? 'down' : 'flat';
      toolLog.pagePerformance(pageId, trendDirection, primary.days + comparison.days);
      toolLog.executed(pageId, durationMs, primary.days + comparison.days);

      return {
        data: {
          primary: { period: { startDate, endDate }, metrics: primary },
          comparison: {
            period: { startDate: compareStartDate, endDate: compareEndDate },
            metrics: comparison,
          },
          deltas: {
            pageViews: delta(primary.totalPageViews, comparison.totalPageViews),
            conversions: delta(primary.totalConversions, comparison.totalConversions),
            revenue: delta(primary.totalRevenue, comparison.totalRevenue),
            conversionRate: delta(primary.avgConversionRate, comparison.avgConversionRate),
            bounceRate: delta(primary.avgBounceRate, comparison.avgBounceRate),
          },
        },
        summary: `Comparing ${startDate}–${endDate} vs ${compareStartDate}–${compareEndDate}: conversion rate ${delta(primary.avgConversionRate, comparison.avgConversionRate) >= 0 ? '+' : ''}${delta(primary.avgConversionRate, comparison.avgConversionRate).toFixed(1)}%, revenue ${delta(primary.totalRevenue, comparison.totalRevenue) >= 0 ? '+' : ''}${delta(primary.totalRevenue, comparison.totalRevenue).toFixed(1)}%`,
      };
    } catch (err) {
      toolLog.error(pageId, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  },
};
