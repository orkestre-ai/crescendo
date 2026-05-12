import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'exploration', route: '/api/explorations/reorder' });

const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderedIds } = reorderSchema.parse(body);

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.exploration.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    );

    logger.debug({ count: orderedIds.length }, 'Reordered explorations');

    return successResponse({ reordered: true });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to reorder explorations');
    return errorResponse(error, 'Failed to reorder explorations');
  }
}
