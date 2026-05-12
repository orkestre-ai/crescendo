import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  // Prisma 7 reads connection URLs from here instead of schema.prisma.
  // Migrations use the non-pooled URL; runtime PrismaClient uses POSTGRES_PRISMA_URL
  // via the @prisma/adapter-pg adapter in src/lib/db.ts.
  datasource: {
    url: process.env.POSTGRES_URL_NON_POOLING,
  },
  migrations: {
    seed: 'node --loader ts-node/esm prisma/seed.ts',
  },
});
