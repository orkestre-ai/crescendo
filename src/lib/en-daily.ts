import pLimit from 'p-limit';
import { prisma } from './db';
import { getENPublicClientAsync, type ENPublicClient } from './en-public-client';
import { getReportingCurrency } from './settings';
import type { ReportingCurrency } from '@/types/fundraising';

/**
 * Daily Engaging Networks giving per donation page, stored in EnDailyGiving.
 * A row of zeros means the day was fetched and nothing came in; a missing
 * row means the day was not fetched.
 */

export type EnSummaryClient = Pick<ENPublicClient, 'fetchFundraisingSummaryByPage'>;

export interface EnDailyRow {
  pageId: string;
  date: string;
  totalAmount: number;
  donationCount: number;
  singleAmount: number;
  singleCount: number;
  recurringAmount: number;
  recurringCount: number;
  currency: string;
  fetchedAt: Date;
}

/** Where the collector reads pages and writes days. Tests pass an in-memory one. */
export interface EnDailyStore {
  /** Every donation page, any status; only these EN page ids when given. */
  pages(enPageIds?: string[]): Promise<{ id: string; enPageId: string }[]>;
  currency(): Promise<string>;
  save(row: EnDailyRow): Promise<void>;
}

export interface CollectEnDailyResult {
  pages: number;
  calls: number;
  daysWritten: number;
  /** Pages with nothing in the range: their days were written as zeros without per-day calls. */
  skippedPages: number;
  errors: { pageId: string; date?: string; message: string }[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Every date from `from` to `to`, both included, as YYYY-MM-DD. */
export function daysBetween(from: string, to: string): string[] {
  if (!DATE.test(from) || !DATE.test(to)) {
    throw new Error(`Dates must be YYYY-MM-DD; got "${from}" and "${to}".`);
  }
  const days: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

// A timeout, a dropped connection, rate limiting or a server error: worth one more try.
function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'AbortError' || err instanceof TypeError || /^HTTP (429|5\d\d)\b/.test(err.message)
  );
}

const dbStore: EnDailyStore = {
  pages: (enPageIds) =>
    prisma.fundraisingPage.findMany({
      where: { pageType: 'donation', ...(enPageIds && { enPageId: { in: enPageIds } }) },
      select: { id: true, enPageId: true },
      orderBy: { enPageId: 'asc' },
    }),
  currency: () => getReportingCurrency(),
  save: async ({ pageId, date, ...figures }) => {
    const day = new Date(`${date}T00:00:00Z`);
    await prisma.enDailyGiving.upsert({
      where: { pageId_date: { pageId, date: day } },
      update: figures,
      create: { pageId, date: day, ...figures },
    });
  },
};

/**
 * Fetch daily giving for every donation page from `from` to `to` (YYYY-MM-DD,
 * both included) and store one row per page per day. Each page is first asked
 * for the whole range; a page with nothing in it gets a zero row for every
 * day without per-day calls. Writing again over the same days replaces them.
 * A page or day that fails is recorded in `errors` and left unwritten.
 */
export async function collectEnDaily(opts: {
  from: string;
  to: string;
  /** EN page ids. Default: every donation page. */
  pageIds?: string[];
  concurrency?: number;
  client?: EnSummaryClient;
  store?: EnDailyStore;
}): Promise<CollectEnDailyResult> {
  const days = daysBetween(opts.from, opts.to);
  if (days.length === 0) throw new Error(`"${opts.from}" is after "${opts.to}".`);

  const store = opts.store ?? dbStore;
  const client = opts.client ?? (await getENPublicClientAsync());
  if (!client) throw new Error('The Engaging Networks public token is not configured.');

  const currency = await store.currency();
  const pages = await store.pages(opts.pageIds);
  const limit = pLimit(opts.concurrency ?? 4);
  const result: CollectEnDailyResult = {
    pages: pages.length,
    calls: 0,
    daysWritten: 0,
    skippedPages: 0,
    errors: [],
  };

  const fetchSummary = (enPageId: string, startDate: string, endDate: string) =>
    limit(async () => {
      const call = () => {
        result.calls++;
        return client.fetchFundraisingSummaryByPage(
          enPageId,
          startDate,
          endDate,
          currency as ReportingCurrency
        );
      };
      try {
        return await call();
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        return await call();
      }
    });

  const save = async (
    pageId: string,
    date: string,
    summary: Awaited<ReturnType<typeof fetchSummary>>
  ) => {
    await store.save({
      pageId,
      date,
      totalAmount: summary?.totalAmount ?? 0,
      donationCount: summary?.donationCount ?? 0,
      singleAmount: summary?.singleAmount ?? 0,
      singleCount: summary?.singleCount ?? 0,
      recurringAmount: summary?.recurringAmount ?? 0,
      recurringCount: summary?.recurringCount ?? 0,
      currency,
      fetchedAt: new Date(),
    });
    result.daysWritten++;
  };

  const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

  await Promise.all(
    pages.map(async (page) => {
      let range;
      try {
        range = await fetchSummary(page.enPageId, opts.from, opts.to);
      } catch (err) {
        result.errors.push({ pageId: page.enPageId, message: message(err) });
        return;
      }

      if (!range?.donationCount && !range?.totalAmount) {
        result.skippedPages++;
        for (const date of days) await save(page.id, date, null);
        return;
      }

      await Promise.all(
        days.map(async (date) => {
          try {
            await save(page.id, date, await fetchSummary(page.enPageId, date, date));
          } catch (err) {
            result.errors.push({ pageId: page.enPageId, date, message: message(err) });
          }
        })
      );
    })
  );

  return result;
}

/** Days in a Toronto calendar, so "yesterday" is the organisation's yesterday. */
export function torontoDate(now: Date, daysBack = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(now);
  return new Date(Date.parse(`${today}T00:00:00Z`) - daysBack * DAY_MS).toISOString().slice(0, 10);
}

/** What is stored for a range, to compare with the Engaging Networks interface. */
export async function enDailyTotals(from: string, to: string, enPageIds?: string[]) {
  const where = {
    date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
    ...(enPageIds && { page: { enPageId: { in: enPageIds } } }),
  };
  const sums = await prisma.enDailyGiving.aggregate({
    where,
    _sum: { totalAmount: true, donationCount: true },
    _count: true,
  });
  return {
    totalAmount: Math.round((sums._sum.totalAmount ?? 0) * 100) / 100,
    donationCount: sums._sum.donationCount ?? 0,
    rows: sums._count,
  };
}
