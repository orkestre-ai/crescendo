import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-helpers';
import { TOOL_KEYS } from '@/config/exploration-constants';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'exploration', route: '/api/explorations/[id]' });

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  prompt: z.string().min(1).optional(),
  icon: z.string().optional(),
  enabled: z.boolean().optional(),
  enabledTools: z
    .array(z.enum(TOOL_KEYS as unknown as [string, ...string[]]))
    .min(1, 'At least one tool must be selected')
    .optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const exploration = await prisma.exploration.findUnique({
      where: { id },
    });
    if (!exploration) {
      return errorResponse(
        new Error('Exploration not found'),
        'Exploration not found'
      );
    }
    return successResponse(exploration);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to fetch exploration');
    return errorResponse(error, 'Failed to fetch exploration');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const exploration = await prisma.exploration.update({
      where: { id },
      data: parsed,
    });

    logger.info({ explorationId: id }, 'Updated exploration');

    return successResponse(exploration);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to update exploration');
    return errorResponse(error, 'Failed to update exploration');
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.exploration.delete({ where: { id } });

    logger.info({ explorationId: id }, 'Deleted exploration');

    return successResponse({ deleted: true });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to delete exploration');
    return errorResponse(error, 'Failed to delete exploration');
  }
}
