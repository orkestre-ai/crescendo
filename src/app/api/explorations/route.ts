import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-helpers';
import { TOOL_KEYS } from '@/config/exploration-constants';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'exploration', route: '/api/explorations' });

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).default(''),
  prompt: z.string().min(1, 'Prompt is required'),
  icon: z.string().default('BarChart3'),
  enabled: z.boolean().default(true),
  enabledTools: z
    .array(z.enum(TOOL_KEYS as unknown as [string, ...string[]]))
    .min(1, 'At least one tool must be selected'),
});

async function seedDefaults() {
  // Idempotent: only inserts QUICK_QUERIES defaults that don't already exist
  // (matched by name). skipDuplicates + @unique on name guards race conditions.
  const { QUICK_QUERIES } = await import('@/config/ai-queries');
  const expectedNames = QUICK_QUERIES.map((q) => q.label);
  const existing = await prisma.exploration.count({
    where: { name: { in: expectedNames } },
  });
  if (existing >= expectedNames.length) return;

  const allToolKeys = [...TOOL_KEYS];
  await prisma.exploration.createMany({
    data: QUICK_QUERIES.map((q, i) => ({
      name: q.label,
      description: q.description,
      prompt: q.prompt,
      icon: q.icon,
      enabled: true,
      sortOrder: i,
      isDefault: true,
      enabledTools: q.enabledTools ?? allToolKeys,
    })),
    skipDuplicates: true,
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const enabledOnly = searchParams.get('enabled') === 'true';

    await seedDefaults();

    const explorations = await prisma.exploration.findMany({
      where: enabledOnly ? { enabled: true } : undefined,
      orderBy: { sortOrder: 'asc' },
    });

    return successResponse(explorations);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to fetch explorations');
    return errorResponse(error, 'Failed to fetch explorations');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.parse(body);

    // Place new exploration at end of list
    const maxOrder = await prisma.exploration.aggregate({
      _max: { sortOrder: true },
    });
    const exploration = await prisma.exploration.create({
      data: {
        ...parsed,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    logger.info({ explorationId: exploration.id, name: parsed.name }, 'Created exploration');

    return successResponse(exploration, 201);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to create exploration');
    return errorResponse(error, 'Failed to create exploration');
  }
}
