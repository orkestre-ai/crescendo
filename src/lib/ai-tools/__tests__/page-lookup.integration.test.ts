import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getTestPrisma, resetTestTables, closeTestPrisma } from './test-db';
import { pageLookupTool } from '../page-lookup';

const prisma = getTestPrisma();

type Lookup = {
  pages: Array<{
    enPageId: string;
    pageId: string;
    status: string;
    enGifts: Record<string, { from: string; gifts: number; monthlyGifts: number; currency: string }>;
  }>;
  notFound: string[];
};

let liveId: string;

before(async () => {
  await resetTestTables(prisma);
  const live = await prisma.fundraisingPage.create({
    data: { enPageId: '1001', name: 'Live page', url: 'https://example.org/page/1001/donate/1', status: 'ACTIVE' },
  });
  liveId = live.id;
  await prisma.fundraisingPage.create({
    data: { enPageId: '1002', name: 'Paused page', url: 'https://example.org/page/1002/donate/1', status: 'PAUSED' },
  });
  const snapshot = (periodStart: string, periodEnd: string, donationCount: number, fetchedAt: string) => ({
    pageId: live.id,
    periodType: 'LAST_30_DAYS' as const,
    periodStart: new Date(periodStart),
    periodEnd: new Date(periodEnd),
    totalAmount: donationCount * 50,
    donationCount,
    singleCount: donationCount - 2,
    recurringCount: 2,
    fetchedAt: new Date(fetchedAt),
  });
  await prisma.fundraisingSnapshot.createMany({
    data: [
      snapshot('2026-10-27', '2026-11-25', 10, '2026-11-25T05:00:00Z'),
      snapshot('2026-10-28', '2026-11-26', 12, '2026-11-26T05:00:00Z'),
    ],
  });
});

after(async () => {
  await resetTestTables(prisma);
  await closeTestPrisma();
});

test('looks up pages by EN page number, including paused ones, and reports unknown numbers', async () => {
  const result = await pageLookupTool.execute({ enPageIds: ['1002', '1001', '9999'] });
  const data = result.data as Lookup;
  assert.deepEqual(data.pages.map((p) => [p.enPageId, p.status]), [['1001', 'ACTIVE'], ['1002', 'PAUSED']]);
  assert.deepEqual(data.notFound, ['9999']);
  assert.equal(data.pages[0].pageId, liveId);
});

test('returns only the newest snapshot of each period', async () => {
  const result = await pageLookupTool.execute({ enPageIds: ['1001'] });
  const { enGifts } = (result.data as Lookup).pages[0];
  assert.deepEqual(Object.keys(enGifts), ['last30Days']);
  assert.equal(enGifts.last30Days.from, '2026-10-28');
  assert.equal(enGifts.last30Days.gifts, 12);
  assert.equal(enGifts.last30Days.monthlyGifts, 2);
  assert.equal(enGifts.last30Days.currency, 'CAD');
});

test('lists live pages only when no page numbers are given', async () => {
  const result = await pageLookupTool.execute({});
  assert.deepEqual((result.data as Lookup).pages.map((p) => p.enPageId), ['1001']);
});
