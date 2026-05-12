/**
 * Quick read-only check of current scraped state for the test pages.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const { prisma } = await import('@/lib/db');
  const rows = await prisma.fundraisingPage.findMany({
    where: { enPageId: { in: ['61749', '108609', '114639'] } },
    select: {
      enPageId: true,
      name: true,
      url: true,
      headline: true,
      donationAmounts: true,
      lastScrapedAt: true,
      campaignBaseUrl: true,
      campaignStatus: true,
    },
  });
  console.log(JSON.stringify(rows, null, 2));

  console.log('\n--- aggregate scraped-content health ---');
  const total = await prisma.fundraisingPage.count();
  const scraped = await prisma.fundraisingPage.count({
    where: { lastScrapedAt: { not: null } },
  });
  const withHeadline = await prisma.fundraisingPage.count({
    where: { headline: { not: null } },
  });
  const withAmounts = await prisma.fundraisingPage.count({
    where: { donationAmounts: { isEmpty: false } },
  });
  console.log({ total, scraped, withHeadline, withAmounts });
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
