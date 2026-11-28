import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { BlockDef, BlockSeed } from '../types';
import { barChart } from './bar_chart';
import { dataTable } from './data_table';
import { definitionList } from './definition_list';
import { flag } from './flag';
import { funnelSteps } from './funnel_steps';
import { lineChart } from './line_chart';
import { priorityCards } from './priority_cards';
import { prose } from './prose';
import { reportHeader } from './report_header';
import { section } from './section';
import { statTiles } from './stat_tiles';

/**
 * The version of every built-in block. A run draws each block with the
 * version it recorded, so raise this when a built-in changes in a way that
 * would alter a report already sent; the old version's row is then kept.
 */
export const BUILTIN_VERSION = 1;

/** The built-in blocks, in the order a report tends to use them. */
export const BUILTIN_BLOCKS: BlockSeed[] = [
  reportHeader,
  section,
  priorityCards,
  statTiles,
  dataTable,
  lineChart,
  barChart,
  funnelSteps,
  flag,
  prose,
  definitionList,
];

/** The built-ins as stored blocks, for a store with no database. */
export function builtinBlockDefs(): BlockDef[] {
  return BUILTIN_BLOCKS.map((seed) => ({
    ...seed,
    version: BUILTIN_VERSION,
    isCurrent: true,
    origin: 'builtin',
    status: 'approved',
  }));
}

const json = (value: unknown) => value as Prisma.InputJsonValue;

let seeded: Promise<void> | null = null;

async function seedBuiltinBlocks(): Promise<void> {
  for (const seed of BUILTIN_BLOCKS) {
    const content = {
      name: seed.name,
      description: seed.description,
      dataSchema: json(seed.dataSchema),
      template: seed.template,
      css: seed.css,
      sampleData: json(seed.sampleData),
    };
    const where = { key_version: { key: seed.key, version: BUILTIN_VERSION } };
    const existing = await prisma.reportBlockDef.findUnique({ where });
    if (existing) {
      // The code is the source of a built-in version: keep its row in step.
      if (existing.origin === 'builtin') {
        await prisma.reportBlockDef.update({ where, data: content });
      }
      continue;
    }
    const newer = await prisma.reportBlockDef.count({
      where: { key: seed.key, version: { gt: BUILTIN_VERSION } },
    });
    if (newer === 0) {
      await prisma.reportBlockDef.updateMany({
        where: { key: seed.key },
        data: { isCurrent: false },
      });
    }
    await prisma.reportBlockDef.create({
      data: {
        ...content,
        key: seed.key,
        version: BUILTIN_VERSION,
        isCurrent: newer === 0,
        origin: 'builtin',
        status: 'approved',
      },
    });
  }
}

/**
 * Upsert the built-in blocks by key and version. Runs once per server
 * process, on the first read of the blocks.
 */
export function ensureBuiltinBlocks(): Promise<void> {
  seeded ??= seedBuiltinBlocks().catch((err) => {
    seeded = null;
    throw err;
  });
  return seeded;
}
