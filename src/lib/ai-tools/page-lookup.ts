import type { FundraisingSnapshot, PeriodType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { createAiToolLogger } from '@/lib/logging/journeys';
import type { ToolSkill } from './types';

const PERIOD_KEYS: Record<PeriodType, string> = {
  LAST_7_DAYS: 'last7Days',
  PREV_7_DAYS: 'previous7Days',
  LAST_30_DAYS: 'last30Days',
  LIFETIME: 'lifetime',
};

const day = (d: Date) => d.toISOString().slice(0, 10);

const period = (s: FundraisingSnapshot) => ({
  from: day(s.periodStart),
  to: day(s.periodEnd),
  currency: s.currency,
  amount: s.totalAmount,
  gifts: s.donationCount,
  oneTimeGifts: s.singleCount,
  oneTimeAmount: s.singleAmount,
  monthlyGifts: s.recurringCount,
  monthlyAmount: s.recurringAmount,
});

// Sum one period across pages. Pages are fetched together, so their dates match;
// if they ever differ, the widest range is reported.
function totalFor(snapshots: FundraisingSnapshot[]) {
  if (snapshots.length === 0) return null;
  const sum = (pick: (s: FundraisingSnapshot) => number) =>
    Math.round(snapshots.reduce((a, s) => a + pick(s), 0) * 100) / 100;
  return {
    from: day(new Date(Math.min(...snapshots.map((s) => s.periodStart.getTime())))),
    to: day(new Date(Math.max(...snapshots.map((s) => s.periodEnd.getTime())))),
    currency: snapshots[0].currency,
    pages: snapshots.length,
    amount: sum((s) => s.totalAmount),
    gifts: sum((s) => s.donationCount),
    oneTimeGifts: sum((s) => s.singleCount),
    oneTimeAmount: sum((s) => s.singleAmount),
    monthlyGifts: sum((s) => s.recurringCount),
    monthlyAmount: sum((s) => s.recurringAmount),
  };
}

export const pageLookupTool: ToolSkill = {
  schema: {
    name: 'page_lookup',
    description:
      'Look up fundraising pages by their Engaging Networks page number, or list every live page. Returns each page\'s name, status, Crescendo page ID and Engaging Networks gift totals.',
    input_schema: {
      type: 'object' as const,
      properties: {
        enPageIds: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Engaging Networks page numbers, e.g. "193608" from the address /page/193608/donate/1. Leave out to list every live page.',
        },
      },
      required: [],
    },
  },

  instructions: `Use this tool to turn a page number from a GA4 address (/page/193608/donate/1 is page 193608) into the page's name and status, or to list every live page.

With page numbers, each page comes with:
- pageId: the Crescendo page ID that page_performance, sitewide_compare, snapshot_compare and page_content_audit expect.
- status: PAUSED pages are not live in Engaging Networks. Say so before reporting a problem on one.
- enGifts: totals from Engaging Networks for the last 7 days, the 7 days before, the last 30 days and lifetime, each with its dates, currency, and one-time and monthly gifts counted separately.

With no page numbers, it returns a short row for every live page (number, name and last-30-days gifts) and "totals": the last-7-days and last-30-days gifts summed over all live pages, with their dates and currency. Use these totals as given. Don't add the rows up yourself.

Engaging Networks totals come from the fundraising platform, not GA4, so use them to check GA4's gift counts for the same dates. There is no daily or last-year history.`,

  async execute(params) {
    const toolLog = createAiToolLogger('page_lookup');
    const start = Date.now();
    const { enPageIds } = params as { enPageIds?: string[] };
    const target = enPageIds?.length ? enPageIds.join(',') : 'all live pages';

    try {
      const pages = await prisma.fundraisingPage.findMany({
        where: enPageIds?.length ? { enPageId: { in: enPageIds } } : { status: 'ACTIVE' },
        select: {
          id: true,
          enPageId: true,
          name: true,
          url: true,
          status: true,
          hasMonthlyGiving: true,
          lastScrapedAt: true,
        },
        orderBy: { enPageId: 'asc' },
      });

      // Newest snapshot of each period for each page
      const snapshots = await prisma.fundraisingSnapshot.findMany({
        where: { pageId: { in: pages.map((p) => p.id) } },
        orderBy: { fetchedAt: 'desc' },
        distinct: ['pageId', 'periodType'],
      });

      const found = new Set(pages.map((p) => p.enPageId));
      const notFound = (enPageIds ?? []).filter((id) => !found.has(id));
      const summary = `${pages.length} page${pages.length === 1 ? '' : 's'} returned${
        notFound.length ? `; not in Crescendo: ${notFound.join(', ')}` : ''
      }`;
      toolLog.executed(target, Date.now() - start, pages.length);

      // Listing every live page: short rows plus site-wide totals, to keep the result small
      if (!enPageIds?.length) {
        const last30 = new Map(
          snapshots.filter((s) => s.periodType === 'LAST_30_DAYS').map((s) => [s.pageId, s])
        );
        return {
          data: {
            totals: {
              last7Days: totalFor(snapshots.filter((s) => s.periodType === 'LAST_7_DAYS')),
              last30Days: totalFor([...last30.values()]),
            },
            pages: pages.map((page) => {
              const s = last30.get(page.id);
              return {
                enPageId: page.enPageId,
                name: page.name,
                last30Days: s
                  ? {
                      gifts: s.donationCount,
                      amount: s.totalAmount,
                      oneTimeGifts: s.singleCount,
                      monthlyGifts: s.recurringCount,
                    }
                  : null,
              };
            }),
          },
          summary,
        };
      }

      const rows = pages.map((page) => ({
        enPageId: page.enPageId,
        pageId: page.id,
        name: page.name,
        url: page.url,
        status: page.status,
        offersMonthlyGiving: page.hasMonthlyGiving,
        lastScraped: page.lastScrapedAt ? day(page.lastScrapedAt) : null,
        enGifts: Object.fromEntries(
          snapshots
            .filter((s) => s.pageId === page.id)
            .map((s) => [PERIOD_KEYS[s.periodType], period(s)])
        ),
      }));

      return { data: { pages: rows, notFound }, summary };
    } catch (err) {
      toolLog.error(target, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  },
};
