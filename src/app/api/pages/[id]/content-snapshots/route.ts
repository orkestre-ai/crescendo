import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rootLogger } from '@/lib/logging';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const snapshots = await prisma.contentSnapshot.findMany({
      where: { pageId: id },
      orderBy: { validFrom: 'desc' },
      select: {
        id: true,
        contentHash: true,
        validFrom: true,
        validTo: true,
        capturedAt: true,
        metaTitle: true,
        appealText: true,
        narrativeText: true,
        screenshotUrl: true,
        mobileScreenshotUrl: true,
        diagnostics: true,
        enModifiedAt: true,
      },
      take: 50,
    });

    return NextResponse.json(snapshots);
  } catch (error) {
    rootLogger.error({ err: error instanceof Error ? error : new Error(String(error)), route: '/api/pages/[id]/content-snapshots' }, 'Failed to fetch content snapshots');
    return NextResponse.json(
      { error: 'Failed to fetch content snapshots' },
      { status: 500 }
    );
  }
}
