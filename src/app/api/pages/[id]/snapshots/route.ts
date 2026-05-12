import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getENPublicClientAsync, isENPublicConfiguredAsync } from '@/lib/en-public-client';
import { rootLogger } from '@/lib/logging';
import { getReportingCurrency } from '@/lib/settings';
import { getPeriodDatesForCampaign } from '@/lib/date-utils';
import type { PeriodType } from '@prisma/client';

/**
 * POST /api/pages/[id]/snapshots
 *
 * Manually collect FundraisingSnapshots (7-day, 30-day periods) for a specific page.
 * This is used by the debug tools to refresh period-based fundraising data.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Validate page exists
    const page = await prisma.fundraisingPage.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        enPageId: true,
        enCreatedAt: true,
        fundraisingHighestDonation: true,
        fundraisingAverageDonation: true,
        fundraisingSupporters: true,
      },
    });

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Check if EN Public API is configured
    if (!(await isENPublicConfiguredAsync())) {
      return NextResponse.json(
        { error: 'EN Public API token not configured. Add EN_PUBLIC_TOKEN to your environment.' },
        { status: 400 }
      );
    }

    // Check if page has enPageId
    if (!page.enPageId) {
      return NextResponse.json(
        { error: 'Page does not have an EN page ID. Sync from EN first.' },
        { status: 400 }
      );
    }

    const enPublicClient = await getENPublicClientAsync();
    if (!enPublicClient) {
      return NextResponse.json(
        { error: 'Failed to initialize EN Public API client' },
        { status: 500 }
      );
    }

    // Get reporting currency
    const currency = await getReportingCurrency();

    // Calculate date ranges
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const periods: Array<{
      type: PeriodType;
      start: Date;
      end: Date;
    }> = [
      {
        type: 'LAST_7_DAYS',
        start: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000),
        end: today,
      },
      {
        type: 'PREV_7_DAYS',
        start: new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000),
        end: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
      },
      {
        type: 'LAST_30_DAYS',
        start: new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000),
        end: today,
      },
    ];

    // Add LIFETIME period using campaign creation date
    const lifetimeDates = getPeriodDatesForCampaign('LIFETIME', page.enCreatedAt);
    if (lifetimeDates) {
      periods.push({
        type: 'LIFETIME' as PeriodType,
        start: lifetimeDates.start,
        end: lifetimeDates.end,
      });
    }

    const results: Array<{
      periodType: PeriodType;
      success: boolean;
      totalAmount?: number;
      donationCount?: number;
      error?: string;
    }> = [];

    for (const period of periods) {
      const startDate = period.start.toISOString().split('T')[0];
      const endDate = period.end.toISOString().split('T')[0];

      try {
        const summary = await enPublicClient.fetchFundraisingSummaryByPage(
          page.enPageId,
          startDate,
          endDate,
          currency
        );

        await prisma.fundraisingSnapshot.upsert({
          where: {
            pageId_periodType_periodStart_periodEnd: {
              pageId: page.id,
              periodType: period.type,
              periodStart: period.start,
              periodEnd: period.end,
            },
          },
          update: {
            totalAmount: summary?.totalAmount ?? 0,
            donationCount: summary?.donationCount ?? 0,
            singleCount: summary?.singleCount ?? 0,
            singleAmount: summary?.singleAmount ?? 0,
            recurringCount: summary?.recurringCount ?? 0,
            recurringAmount: summary?.recurringAmount ?? 0,
            currency,
            fetchedAt: new Date(),
            ...(period.type === 'LIFETIME'
              ? {
                  highestDonation: page.fundraisingHighestDonation ?? null,
                  averageDonation: page.fundraisingAverageDonation ?? null,
                  supporters: page.fundraisingSupporters ?? null,
                }
              : {}),
          },
          create: {
            pageId: page.id,
            periodType: period.type,
            periodStart: period.start,
            periodEnd: period.end,
            totalAmount: summary?.totalAmount ?? 0,
            donationCount: summary?.donationCount ?? 0,
            singleCount: summary?.singleCount ?? 0,
            singleAmount: summary?.singleAmount ?? 0,
            recurringCount: summary?.recurringCount ?? 0,
            recurringAmount: summary?.recurringAmount ?? 0,
            currency,
            fetchedAt: new Date(),
            ...(period.type === 'LIFETIME'
              ? {
                  highestDonation: page.fundraisingHighestDonation ?? null,
                  averageDonation: page.fundraisingAverageDonation ?? null,
                  supporters: page.fundraisingSupporters ?? null,
                }
              : {}),
          },
        });

        results.push({
          periodType: period.type,
          success: true,
          totalAmount: summary?.totalAmount ?? 0,
          donationCount: summary?.donationCount ?? 0,
        });
      } catch (error) {
        results.push({
          periodType: period.type,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: successCount > 0,
      message: `Collected ${successCount}/${periods.length} period snapshots`,
      results,
      currency,
    });
  } catch (error) {
    rootLogger.error({ err: error instanceof Error ? error : new Error(String(error)), route: '/api/pages/[id]/snapshots' }, 'Error collecting fundraising snapshots');
    return NextResponse.json({ error: 'Failed to collect fundraising snapshots' }, { status: 500 });
  }
}
