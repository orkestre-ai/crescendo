import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { dbLogger } from './logging/journeys';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg(process.env.POSTGRES_PRISMA_URL!);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Prisma middleware: route queries through Pino for structured logging
(prisma as any).$use?.(async (params: any, next: any) => {
  const startTime = performance.now();

  try {
    const result = await next(params);
    const duration = Math.round(performance.now() - startTime);
    const model = params.model || 'unknown';
    const action = params.action;

    // Log all queries at DEBUG (file only)
    dbLogger.query(`${action} ${model}`, duration);

    // Warn on slow queries (>1000ms)
    if (duration > 1000) {
      dbLogger.slowQuery(`${action} ${model}`, duration);
    }

    return result;
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    dbLogger.raw.error(
      { err: error as Error, model: params.model, action: params.action, durationMs: duration },
      `Query failed: ${params.action} ${params.model || 'unknown'}`
    );
    throw error;
  }
});

export default prisma;
