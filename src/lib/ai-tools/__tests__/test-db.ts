// Route the app's Prisma singleton at the test DB by mutating POSTGRES_PRISMA_URL
// and POSTGRES_URL_NON_POOLING before `@/lib/db` is first imported. Any test file
// that imports this module must do so BEFORE importing the code-under-test.
const testUrl = process.env.POSTGRES_TEST_URL;
if (!testUrl) {
  throw new Error(
    'POSTGRES_TEST_URL is not set. Refusing to run integration tests against dev DB.'
  );
}
process.env.POSTGRES_PRISMA_URL = testUrl;
process.env.POSTGRES_URL_NON_POOLING = testUrl;

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

let client: PrismaClient | null = null;

/**
 * Returns a Prisma client pointed at POSTGRES_TEST_URL.
 * Used by integration tests for seeding/asserting; the code-under-test uses
 * the standard `@/lib/db` singleton, which is routed at the same URL above.
 */
export function getTestPrisma(): PrismaClient {
  if (!client) {
    const adapter = new PrismaPg(testUrl!);
    client = new PrismaClient({ adapter });
  }
  return client;
}

/**
 * Truncate the tables involved in the ai-tools test suite.
 * Order matters: PageInsight has FK to FundraisingPage and Exploration.
 */
export async function resetTestTables(prisma: PrismaClient): Promise<void> {
  await prisma.pageInsight.deleteMany();
  await prisma.contentSnapshot.deleteMany();
  await prisma.performanceSnapshot.deleteMany();
  await prisma.fundraisingPage.deleteMany();
  await prisma.exploration.deleteMany();
}

export async function closeTestPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
