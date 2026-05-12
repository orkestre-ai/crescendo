import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/explorations/history' });

export async function DELETE() {
  try {
    const { count } = await prisma.pageInsight.deleteMany({
      where: { mode: 'explore' },
    });
    return NextResponse.json({ success: true, deleted: count });
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error : new Error(String(error)) },
      'Failed to delete exploration history'
    );
    return NextResponse.json({ error: 'Failed to delete exploration history' }, { status: 500 });
  }
}
