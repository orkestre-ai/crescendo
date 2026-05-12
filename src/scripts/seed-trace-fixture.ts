/**
 * Seeds the trace database with a deterministic 10-page fixture.
 * Used by trace-diff verification. Never run against the dev DB.
 */

// Load .env.local BEFORE any module that reads env (Prisma, config/env).
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';

function assertTraceDb(): string {
  const traceUrl = process.env.TRACE_DATABASE_URL;
  if (!traceUrl) {
    throw new Error('TRACE_DATABASE_URL is not set. Refusing to seed.');
  }
  if (traceUrl === process.env.POSTGRES_URL) {
    throw new Error(
      'TRACE_DATABASE_URL must not equal POSTGRES_URL. Refusing to seed.'
    );
  }
  return traceUrl;
}

async function main() {
  const traceUrl = assertTraceDb();

  // Prisma reads POSTGRES_URL (and friends) at import time.
  // Override in-process before instantiating.
  process.env.POSTGRES_URL = traceUrl;
  process.env.POSTGRES_PRISMA_URL = traceUrl;
  process.env.POSTGRES_URL_NON_POOLING = traceUrl;
  process.env.DATABASE_URL = traceUrl;

  const prisma = new PrismaClient();

  try {
    // Clear existing rows in reverse-dependency order.
    await prisma.optimizationRecommendation.deleteMany();
    await prisma.fundraisingSnapshot.deleteMany();
    await prisma.contentSnapshot.deleteMany();
    await prisma.performanceSnapshot.deleteMany();
    await prisma.collectionJob.deleteMany();
    await prisma.fundraisingPage.deleteMany();

    // 10 pages — 6 live, 2 new, 2 paused.
    const pages = [
      { enPageId: '1001', name: 'Fixture Live 1', campaignStatus: 'live', status: 'ACTIVE' },
      { enPageId: '1002', name: 'Fixture Live 2', campaignStatus: 'live', status: 'ACTIVE' },
      { enPageId: '1003', name: 'Fixture Live 3', campaignStatus: 'live', status: 'ACTIVE' },
      { enPageId: '1004', name: 'Fixture Live 4', campaignStatus: 'live', status: 'ACTIVE' },
      { enPageId: '1005', name: 'Fixture Live 5', campaignStatus: 'live', status: 'ACTIVE' },
      { enPageId: '1006', name: 'Fixture Live 6', campaignStatus: 'live', status: 'ACTIVE' },
      { enPageId: '1007', name: 'Fixture New 1',  campaignStatus: 'new',  status: 'PAUSED' },
      { enPageId: '1008', name: 'Fixture New 2',  campaignStatus: 'new',  status: 'PAUSED' },
      { enPageId: '1009', name: 'Fixture Closed', campaignStatus: 'close', status: 'PAUSED' },
      { enPageId: '1010', name: 'Fixture Blocked', campaignStatus: 'block', status: 'PAUSED' },
    ] as const;

    for (const p of pages) {
      await prisma.fundraisingPage.create({
        data: {
          enPageId: p.enPageId,
          name: p.name,
          url: `https://example.com/fixture/${p.enPageId}`,
          enPageType: 'fundraising',
          pageType: 'DONATION',
          status: p.status,
          campaignStatus: p.campaignStatus,
          enCreatedAt: new Date('2025-01-01'),
          enModifiedAt: new Date('2025-06-01'),
          // Scalar arrays default to NOT NULL in the reconciled trace schema.
          // Provide empty arrays so the fixture works regardless of whether
          // prisma db push tightens nullability on subsequent re-pushes.
          trackingParameters: [],
          ctaButtons: [],
          donationAmounts: [],
          monthlyDonationAmounts: [],
        },
      });
    }

    const count = await prisma.fundraisingPage.count();
    console.log(`Seeded ${count} pages into trace DB: ${traceUrl}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
