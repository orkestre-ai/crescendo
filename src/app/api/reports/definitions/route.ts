import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { errorResponse } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';
import { rootLogger } from '@/lib/logging';
import { ensureDefaultReportDefinitions } from '@/lib/reports/definitions';
import { definitionCreateSchema, definitionKey } from '@/lib/reports/definitions/schema';

const logger = rootLogger.child({ journey: 'report', route: '/api/reports/definitions' });

/**
 * GET /api/reports/definitions[?enabled=true]
 *
 * The report definitions, built-ins first. The built-ins are seeded on the
 * first read, and one nobody has edited is brought up to the code's version.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureDefaultReportDefinitions();
    const enabledOnly = request.nextUrl.searchParams.get('enabled') === 'true';
    const definitions = await prisma.reportDefinition.findMany({
      where: enabledOnly ? { enabled: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json({ definitions });
  } catch (error) {
    return errorResponse(error, 'Failed to load the report definitions');
  }
}

/**
 * POST /api/reports/definitions
 *
 * Add a definition. Its key is made from its name.
 */
export async function POST(request: NextRequest) {
  try {
    const body = definitionCreateSchema.parse(await request.json());

    const base = definitionKey(body.name);
    const taken = new Set(
      (
        await prisma.reportDefinition.findMany({
          where: { key: { startsWith: base } },
          select: { key: true },
        })
      ).map((row) => row.key)
    );
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;

    const last = await prisma.reportDefinition.aggregate({ _max: { sortOrder: true } });
    const definition = await prisma.reportDefinition.create({
      data: {
        ...body,
        key,
        inputs: body.inputs as unknown as Prisma.InputJsonValue,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    logger.info({ definitionId: definition.id, key }, 'Created report definition');
    return NextResponse.json({ definition }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'Failed to create the report definition');
  }
}
