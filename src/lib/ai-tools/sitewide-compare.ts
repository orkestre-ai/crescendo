import { prisma } from '@/lib/db';
import { createAiToolLogger } from '@/lib/logging/journeys';
import type { ToolSkill } from './types';

export const sitewideCompareTool: ToolSkill = {
  schema: {
    name: 'sitewide_compare',
    description:
      "Compare this page's performance metrics against sitewide averages across all tracked pages. Returns both sets of metrics plus the delta and percentile ranking.",
    input_schema: {
      type: 'object' as const,
      properties: {
        pageId: {
          type: 'string',
          description: 'The page ID to compare',
        },
        days: {
          type: 'number',
          description: 'Number of days to look back (default 30)',
        },
      },
      required: ['pageId'],
    },
  },

  instructions: `Use this tool when the user asks how a page compares to others, whether performance is above or below average, or to contextualize a metric relative to the portfolio.

Returns the page's average metrics vs sitewide averages for the specified period, plus a percentile ranking showing where this page sits in the portfolio.`,

  async execute(params) {
    const toolLog = createAiToolLogger('sitewide_compare');
    const start = Date.now();

    const { pageId, days = 30 } = params as { pageId: string; days?: number };
    const since = new Date();
    since.setDate(since.getDate() - days);

    try {
      const [pageSnapshots, allSnapshots] = await Promise.all([
        prisma.performanceSnapshot.findMany({
          where: { pageId, date: { gte: since } },
          select: {
            pageViews: true,
            bounceRate: true,
            conversions: true,
            revenue: true,
            conversionRate: true,
            avgSessionDuration: true,
          },
        }),
        prisma.performanceSnapshot.findMany({
          where: { date: { gte: since } },
          select: {
            pageId: true,
            pageViews: true,
            bounceRate: true,
            conversions: true,
            revenue: true,
            conversionRate: true,
            avgSessionDuration: true,
          },
        }),
      ]);

      if (pageSnapshots.length === 0) {
        toolLog.sitewideCompare(0, 0);
        toolLog.executed(pageId, Date.now() - start, 0);
        return {
          data: null,
          summary: 'No performance data found for this page',
          error: 'No snapshots in the requested period',
        };
      }

      const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
      const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

      const pageMetrics = {
        totalPageViews: sum(pageSnapshots.map((s) => s.pageViews)),
        avgConversionRate: avg(
          pageSnapshots.map((s) => s.conversionRate).filter((r): r is number => r !== null)
        ),
        avgBounceRate: avg(
          pageSnapshots.map((s) => s.bounceRate).filter((r): r is number => r !== null)
        ),
        totalRevenue: sum(pageSnapshots.map((s) => s.revenue).filter((r): r is number => r !== null)),
        totalConversions: sum(pageSnapshots.map((s) => s.conversions)),
      };

      // Group all snapshots by page to compute per-page averages
      const byPage = new Map<string, typeof allSnapshots>();
      for (const s of allSnapshots) {
        const arr = byPage.get(s.pageId) || [];
        arr.push(s);
        byPage.set(s.pageId, arr);
      }

      const pageConversionRates = [...byPage.entries()].map(([, snaps]) =>
        avg(snaps.map((s) => s.conversionRate).filter((r): r is number => r !== null))
      );
      const pageRevenues = [...byPage.entries()].map(([, snaps]) =>
        sum(snaps.map((s) => s.revenue).filter((r): r is number => r !== null))
      );

      const sitewideMetrics = {
        avgConversionRate: avg(pageConversionRates),
        avgBounceRate: avg(
          allSnapshots.map((s) => s.bounceRate).filter((r): r is number => r !== null)
        ),
        avgRevenue: avg(pageRevenues),
        totalPages: byPage.size,
      };

      // Percentile: what % of pages does this page outperform?
      const conversionPercentile =
        (pageConversionRates.filter((r) => r < pageMetrics.avgConversionRate).length /
          pageConversionRates.length) *
        100;
      const revenuePercentile =
        (pageRevenues.filter((r) => r < pageMetrics.totalRevenue).length / pageRevenues.length) * 100;

      const durationMs = Date.now() - start;
      toolLog.sitewideCompare(byPage.size, 5); // 5 core metrics computed
      toolLog.executed(pageId, durationMs, byPage.size);

      return {
        data: {
          pageMetrics,
          sitewideMetrics,
          percentiles: {
            conversion: Math.round(conversionPercentile),
            revenue: Math.round(revenuePercentile),
          },
          period: `${days} days`,
          totalPagesCompared: byPage.size,
        },
        summary: `Page ranks in ${Math.round(conversionPercentile)}th percentile for conversion and ${Math.round(revenuePercentile)}th percentile for revenue across ${byPage.size} pages`,
      };
    } catch (err) {
      toolLog.error(pageId, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  },
};
