import { z } from 'zod';
import { prisma } from '@/lib/db';
import { daysBetween } from '@/lib/en-daily';
import { createAiToolLogger } from '@/lib/logging/journeys';
import { assertAbsoluteDate } from './ga4-report';
import type { ToolSkill } from './types';

/**
 * en_fundraising: daily Engaging Networks giving from EnDailyGiving, shaped
 * like a ga4_report result (headers and string cells) so the report ledger,
 * recheck and blocks read it the same way. It never calls Engaging Networks.
 */

export const EN_DIMENSIONS = ['date', 'nthDay', 'page', 'dateRange'] as const;
export const EN_METRICS = [
  'totalAmount',
  'donationCount',
  'singleAmount',
  'singleCount',
  'recurringAmount',
  'recurringCount',
] as const;

export type EnDimension = (typeof EN_DIMENSIONS)[number];
export type EnMetric = (typeof EN_METRICS)[number];

export interface EnFundraisingInput {
  dateRanges: { startDate: string; endDate: string; name?: string }[];
  dimensions?: EnDimension[];
  metrics?: EnMetric[];
  /** EN page ids. Default: every page. */
  pageIds?: string[];
  limit?: number;
}

export interface EnFundraisingResult {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  truncated: boolean;
  /** YYYY-MM-DD dates in the ranges with no stored row at all: not fetched, not zero. */
  missingDays: string[];
  currency: string;
}

/** One stored day of one page. `date` is YYYY-MM-DD. */
export type EnGivingRow = {
  date: string;
  enPageId: string;
  pageName: string;
  currency: string;
} & Record<EnMetric, number>;

export interface EnFundraisingStore {
  /** Stored rows in the range with a gift or an amount, for these EN page ids when given. */
  givingRows(startDate: string, endDate: string, enPageIds?: string[]): Promise<EnGivingRow[]>;
  /** The dates in the range with at least one stored row, with the currency of those rows. */
  fetchedDays(
    startDate: string,
    endDate: string,
    enPageIds?: string[]
  ): Promise<{ date: string; currency: string }[]>;
}

export const EN_FUNDRAISING_DEFAULT_LIMIT = 1000;
export const EN_FUNDRAISING_MAX_LIMIT = 5000;

const AMOUNTS = new Set<EnMetric>(['totalAmount', 'singleAmount', 'recurringAmount']);
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

// Days since the start of the range, four digits as GA4 writes nthDay: "0000".
const nthDay = (date: string, start: string) =>
  String(Math.round((Date.parse(date) - Date.parse(start)) / 86_400_000)).padStart(4, '0');

function where(startDate: string, endDate: string, enPageIds?: string[]) {
  return {
    date: { gte: new Date(`${startDate}T00:00:00Z`), lte: new Date(`${endDate}T00:00:00Z`) },
    ...(enPageIds && { page: { enPageId: { in: enPageIds } } }),
  };
}

const dbStore: EnFundraisingStore = {
  async givingRows(startDate, endDate, enPageIds) {
    const rows = await prisma.enDailyGiving.findMany({
      where: {
        ...where(startDate, endDate, enPageIds),
        OR: [{ donationCount: { not: 0 } }, { totalAmount: { not: 0 } }],
      },
      select: {
        date: true,
        currency: true,
        totalAmount: true,
        donationCount: true,
        singleAmount: true,
        singleCount: true,
        recurringAmount: true,
        recurringCount: true,
        page: { select: { enPageId: true, name: true } },
      },
    });
    return rows.map(({ date, page, ...rest }) => ({
      ...rest,
      date: isoDay(date),
      enPageId: page.enPageId,
      pageName: page.name,
    }));
  },
  async fetchedDays(startDate, endDate, enPageIds) {
    const days = await prisma.enDailyGiving.groupBy({
      by: ['date', 'currency'],
      where: where(startDate, endDate, enPageIds),
    });
    return days.map(({ date, currency }) => ({ date: isoDay(date), currency }));
  },
};

// Cents, written without float noise, so a re-run gives the same text.
const cell = (metric: EnMetric, value: number) =>
  String(AMOUNTS.has(metric) ? Math.round(value * 100) / 100 : value);

/**
 * Engaging Networks can record monthly transactions with no money on them,
 * such as charges to sustainers imported from another system. Counted, they
 * add gifts worth nothing and pull the average gift down, so a page-day whose
 * monthly transactions carry no amount loses them from every count.
 */
export function withoutUnpaidMonthly(row: EnGivingRow): EnGivingRow {
  if (!row.recurringCount || row.recurringAmount) return row;
  return {
    ...row,
    donationCount: row.donationCount - row.recurringCount,
    recurringCount: 0,
  };
}

/**
 * Sum stored days into rows. Without the page dimension every fetched day
 * (or each range, without the date dimension) has a row even when nothing
 * came in; with it, only pages with gifts appear, as GA4 leaves out empty rows.
 */
export async function runEnFundraising(
  input: EnFundraisingInput,
  store: EnFundraisingStore = dbStore
): Promise<EnFundraisingResult> {
  if (input.dateRanges.length < 1 || input.dateRanges.length > 4) {
    throw new Error('Give one to four date ranges.');
  }
  for (const range of input.dateRanges) {
    assertAbsoluteDate(range.startDate, 'startDate');
    assertAbsoluteDate(range.endDate, 'endDate');
    if (range.startDate > range.endDate) {
      throw new Error(`startDate ${range.startDate} is after endDate ${range.endDate}.`);
    }
  }

  const dimensions = [...new Set(input.dimensions ?? [])];
  if (input.dateRanges.length > 1 && !dimensions.includes('dateRange'))
    dimensions.push('dateRange');
  const metrics = input.metrics?.length ? [...new Set(input.metrics)] : [...EN_METRICS];
  const byDate = dimensions.includes('date');
  const byNthDay = dimensions.includes('nthDay');
  const byDay = byDate || byNthDay;
  const byPage = dimensions.includes('page');
  const pageIds = input.pageIds?.length ? input.pageIds : undefined;

  const headers = [
    ...dimensions.flatMap((d) => (d === 'page' ? ['pageId', 'pageName'] : [d])),
    ...metrics,
  ];

  type Group = {
    order: number;
    date: string;
    values: Record<string, string>;
    sums: Record<EnMetric, number>;
  };
  const groups = new Map<string, Group>();
  const missing = new Set<string>();
  const currencies = new Set<string>();

  for (const [order, range] of input.dateRanges.entries()) {
    const rangeName = range.name || `date_range_${order}`;
    const [giving, fetched] = await Promise.all([
      store.givingRows(range.startDate, range.endDate, pageIds),
      store.fetchedDays(range.startDate, range.endDate, pageIds),
    ]);

    const fetchedDates = new Set(fetched.map((day) => day.date));
    for (const day of fetched) currencies.add(day.currency);
    for (const date of daysBetween(range.startDate, range.endDate)) {
      if (!fetchedDates.has(date)) missing.add(date);
    }

    const group = (date: string, page?: { enPageId: string; pageName: string }) => {
      const values: Record<string, string> = {};
      // GA4 writes a day as YYYYMMDD; so does this, so the two join on "date".
      if (byDate) values.date = date.replaceAll('-', '');
      if (byNthDay) values.nthDay = nthDay(date, range.startDate);
      if (byPage && page) Object.assign(values, { pageId: page.enPageId, pageName: page.pageName });
      if (dimensions.includes('dateRange')) values.dateRange = rangeName;
      const key = `${order}\u0000${JSON.stringify(values)}`;
      let found = groups.get(key);
      if (!found) {
        const sums = Object.fromEntries(EN_METRICS.map((m) => [m, 0])) as Record<EnMetric, number>;
        found = { order, date: byDay ? date : '', values, sums };
        groups.set(key, found);
      }
      return found;
    };

    if (!byPage) {
      if (byDay) [...fetchedDates].forEach((date) => group(date));
      else group('');
    }
    for (const stored of giving) {
      const row = withoutUnpaidMonthly(stored);
      if (!row.donationCount && !row.totalAmount) continue;
      const found = group(row.date, row);
      for (const metric of EN_METRICS) found.sums[metric] += row[metric];
    }
  }

  const sorted = [...groups.values()].sort(
    (a, b) =>
      a.order - b.order ||
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      b.sums.totalAmount - a.sums.totalAmount ||
      (a.values.pageId ?? '').localeCompare(b.values.pageId ?? '')
  );

  const limit = Math.min(
    Math.max(Math.trunc(input.limit ?? EN_FUNDRAISING_DEFAULT_LIMIT), 1),
    EN_FUNDRAISING_MAX_LIMIT
  );
  const rows = sorted.slice(0, limit).map(({ values, sums }) => ({
    ...values,
    ...Object.fromEntries(metrics.map((metric) => [metric, cell(metric, sums[metric])])),
  }));

  return {
    headers,
    rows,
    totalRows: sorted.length,
    truncated: sorted.length > rows.length,
    missingDays: [...missing].sort(),
    currency: [...currencies].sort().join(', '),
  };
}

export const enFundraisingInputSchema: z.ZodType<EnFundraisingInput> = z.object({
  dateRanges: z
    .array(
      z.object({
        startDate: z.string().describe('YYYY-MM-DD. Relative dates are rejected'),
        endDate: z.string().describe('YYYY-MM-DD. Relative dates are rejected'),
        name: z.string().optional().describe('A label for this range in the dateRange column'),
      })
    )
    .min(1)
    .max(4)
    .describe('One to four date ranges. More than one adds a dateRange column'),
  dimensions: z
    .array(z.enum(EN_DIMENSIONS))
    .optional()
    .describe(
      '"date" (one row per day, YYYYMMDD), "nthDay" (the day\'s place in its range, "0000" up), "page" (pageId and pageName), "dateRange". None: one total row'
    ),
  metrics: z.array(z.enum(EN_METRICS)).optional().describe('Default: all six'),
  pageIds: z
    .array(z.string())
    .optional()
    .describe('Engaging Networks page ids to keep. Default: every donation page'),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      `Rows to return. Default ${EN_FUNDRAISING_DEFAULT_LIMIT}, maximum ${EN_FUNDRAISING_MAX_LIMIT}`
    ),
});

export const enFundraisingTool: ToolSkill = {
  schema: {
    name: 'en_fundraising',
    description:
      'Daily giving as Engaging Networks recorded it, for every donation page: amounts and gift counts, split into one-time and monthly, by date, page and date range.',
    input_schema: z.toJSONSchema(enFundraisingInputSchema) as Record<string, unknown>,
  },

  instructions: `Use this tool for money and gift counts. Engaging Networks processed the gifts, so it counts gifts GA4 misses (ad blockers, payments finished on another domain) and splits one-time from monthly. It has no traffic, channels or devices: use GA4 for those.

Metrics: totalAmount and donationCount are every gift; singleAmount and singleCount are one-time gifts; recurringAmount and recurringCount are monthly gifts that Engaging Networks recorded with an amount, mostly on the live donation forms. Monthly transactions it records with no amount, such as charges to imported sustainers, are left out of every count, donationCount included. So the monthly figures are not the whole monthly program: call them "monthly gifts recorded on donation pages" and never present them as total monthly giving. Amounts are in the currency named in "currency". Amounts and counts add up across days and pages.

Dates must be absolute (YYYY-MM-DD). Give up to four date ranges; more than one adds a "dateRange" column, named from each range's name or date_range_0, date_range_1 and so on. The "date" column is written YYYYMMDD, as in GA4, so a dataset can join this query to a ga4_report query on "date". The "nthDay" dimension is the day's place in its own range, from "0000", as in GA4: with two ranges of the same length it lines this year's days up with last year's, so a dataset can join the two on "nthDay". The "page" dimension adds "pageId" (the Engaging Networks page id) and "pageName"; pages closed since are included.

Without the page dimension every stored day has a row, with zeros when nothing came in. With it, only pages with gifts have rows. Rows come sorted by date range, then date, then amount, largest first. When "truncated" is true the list is cut off at "limit".

"missingDays" lists the dates (YYYY-MM-DD) in your ranges that Crescendo has not fetched from Engaging Networks. Those days are unknown, not zero: name them in a flag and never read them as no gifts. Today is always missing until tomorrow morning.`,

  async execute(params) {
    const toolLog = createAiToolLogger('en_fundraising');
    const start = Date.now();
    const input = params as unknown as EnFundraisingInput;
    const dates = input.dateRanges.map((r) => `${r.startDate} to ${r.endDate}`).join(' and ');

    try {
      const data = await runEnFundraising(input);
      toolLog.executed('sitewide', Date.now() - start, data.rows.length);

      const flags = [
        data.truncated && 'truncated',
        data.missingDays.length && `${data.missingDays.length} missing days`,
      ].filter(Boolean);
      return {
        data,
        summary: `${data.rows.length} of ${data.totalRows} rows returned for ${data.headers.join(', ')} (${dates})${flags.length ? ` [${flags.join(', ')}]` : ''}`,
      };
    } catch (err) {
      toolLog.error('sitewide', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  },
};
