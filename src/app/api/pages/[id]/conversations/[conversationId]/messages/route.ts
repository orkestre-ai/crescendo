import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/pages/[id]/conversations/[conversationId]/messages' });

const messagesPairSchema = z.object({
  userContent: z.string().min(1).max(50000),
  assistantContent: z.string().min(1).max(200000),
  toolCalls: z.unknown().optional(),
  usage: z.unknown().optional(),
});

// POST /api/pages/:id/conversations/:conversationId/messages — persist a user+assistant message pair
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const body = await request.json();
    const parsed = messagesPairSchema.parse(body);

    const [userMsg, assistantMsg] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          role: 'user',
          content: parsed.userContent,
        },
      }),
      prisma.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: parsed.assistantContent,
          toolCalls: parsed.toolCalls
            ? JSON.parse(JSON.stringify(parsed.toolCalls))
            : undefined,
          usage: parsed.usage
            ? JSON.parse(JSON.stringify(parsed.usage))
            : undefined,
        },
      }),
    ]);

    // Touch conversation updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    logger.debug({ conversationId }, 'Persisted message pair');

    return successResponse(
      { userMessage: userMsg, assistantMessage: assistantMsg },
      201
    );
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to persist messages');
    return errorResponse(error, 'Failed to persist messages');
  }
}
