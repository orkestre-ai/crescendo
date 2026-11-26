import type { PeriodType } from '@prisma/client';
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

Each page comes with:
- pageId: the Crescendo page ID that page_performance, sitewide_compare, snapshot_compare and page_content_audit expect.
- status: PAUSED pages are not live in Engaging Networks. Say so before reporting a problem on one.
- enGifts: totals from Engaging Networks for the last 7 days, the 7 days before, the last 30 days and lifetime, each with its dates, currency, and one-time and monthly gifts counted separately. These come from the fundraising platform, not GA4, so use them to check GA4's gift counts for the same dates. There is no daily or last-year history.`,

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
            .map((s) => [
              PERIOD_KEYS[s.periodType],
              {
                from: day(s.periodStart),
                to: day(s.periodEnd),
                currency: s.currency,
                amount: s.totalAmount,
                gifts: s.donationCount,
                oneTimeGifts: s.singleCount,
                oneTimeAmount: s.singleAmount,
                monthlyGifts: s.recurringCount,
                monthlyAmount: s.recurringAmount,
              },
            ])
        ),
      }));

      const found = new Set(pages.map((p) => p.enPageId));
      const notFound = (enPageIds ?? []).filter((id) => !found.has(id));

      toolLog.executed(target, Date.now() - start, rows.length);

      return {
        data: { pages: rows, notFound },
        summary: `${rows.length} page${rows.length === 1 ? '' : 's'} returned${
          notFound.length ? `; not in Crescendo: ${notFound.join(', ')}` : ''
        }`,
      };
    } catch (err) {
      toolLog.error(target, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  },
};
