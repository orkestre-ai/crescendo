import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/pages/[id]/conversations/[conversationId]' });

// GET /api/pages/:id/conversations/:conversationId — get conversation with messages
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; conversationId: string }> }
) {
  try {
    const { conversationId } = await params;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      return errorResponse(new Error('Conversation not found'), 'Conversation not found');
    }

    return successResponse(conversation);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to fetch conversation');
    return errorResponse(error, 'Failed to fetch conversation');
  }
}

// DELETE /api/pages/:id/conversations/:conversationId — delete conversation + messages (cascade)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; conversationId: string }> }
) {
  try {
    const { conversationId } = await params;

    await prisma.conversation.delete({
      where: { id: conversationId },
    });

    logger.info({ conversationId }, 'Deleted conversation');

    return successResponse({ deleted: true });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to delete conversation');
    return errorResponse(error, 'Failed to delete conversation');
  }
}
