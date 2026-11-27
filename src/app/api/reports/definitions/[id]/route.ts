import { isDeepStrictEqual } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { errorResponse } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';
import { rootLogger } from '@/lib/logging';
import { DEFINITION_CONTENT } from '@/lib/reports/definitions';
import { definitionUpdateSchema } from '@/lib/reports/definitions/schema';

const logger = rootLogger.child({ journey: 'report', route: '/api/reports/definitions/[id]' });

type Params = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: 'Report definition not found' }, { status: 404 });

/** GET /api/reports/definitions/[id] */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const definition = await prisma.reportDefinition.findUnique({ where: { id } });
    return definition ? NextResponse.json({ definition }) : notFound();
  } catch (error) {
    return errorResponse(error, 'Failed to load the report definition');
  }
}

/**
 * PATCH /api/reports/definitions/[id]
 *
 * Change a definition. A change to its content marks it as edited, and a
 * built-in that is edited is no longer updated from the code. Turning it on
 * or off is not an edit. Runs already made keep the prompt they started with.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = definitionUpdateSchema.parse(await request.json());
    const current = await prisma.reportDefinition.findUnique({ where: { id } });
    if (!current) return notFound();

    const edited = DEFINITION_CONTENT.some(
      (field) => body[field] !== undefined && !isDeepStrictEqual(body[field], current[field])
    );
    const definition = await prisma.reportDefinition.update({
      where: { id },
      data: {
        ...body,
        inputs: body.inputs as unknown as Prisma.InputJsonValue | undefined,
        ...(edited && { editedAt: new Date() }),
      },
    });
    logger.info({ definitionId: id, edited }, 'Updated report definition');
    return NextResponse.json({ definition });
  } catch (error) {
    return errorResponse(error, 'Failed to update the report definition');
  }
}

/**
 * DELETE /api/reports/definitions/[id]
 *
 * Remove a definition. Its past runs are kept. A built-in comes back in its
 * original form the next time the definitions are read.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const current = await prisma.reportDefinition.findUnique({ where: { id } });
    if (!current) return notFound();
    await prisma.reportDefinition.delete({ where: { id } });
    logger.info({ definitionId: id, key: current.key }, 'Deleted report definition');
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete the report definition');
  }
}
