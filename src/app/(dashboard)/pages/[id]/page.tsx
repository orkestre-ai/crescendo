import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-detail/page-header';
import { PageNavigation } from '@/components/page-detail/page-navigation';
import { PageTabs } from '@/components/page-detail/page-tabs';
import { DebugButtons } from '@/components/page-detail/debug-buttons';
import { prisma } from '@/lib/db';
import { rootLogger } from '@/lib/logging';

import { getScrapableUrl, isLiveCampaign } from '@/lib/url-utils';
import { isENPublicConfiguredAsync } from '@/lib/en-public-client';
import { getReportingCurrency, getAiSettings } from '@/lib/settings';
import {
  fetchPeriodSnapshots,
  snapshotToPerformanceData,
  snapshotToComparisonData,
  isPeriodPartial,
} from '@/lib/snapshot-utils';
import { calculateTrackingAccuracy } from '@/lib/tracking-utils';

async function getPageDetail(id: string) {
  try {
    // Query database directly instead of making HTTP call
    const page = await prisma.fundraisingPage.findUnique({
      where: { id },
      include: {
        snapshots: {
          orderBy: { date: 'desc' },
        },
        recommendations: {
          where: { status: 'ACTIVE' },
          orderBy: { confidence: 'desc' },
        },
      },
    });

    if (!page) {
      return null;
    }

    // Fetch latest content snapshot
    const latestContentSnapshot = await prisma.contentSnapshot.findFirst({
      where: { pageId: page.id },
      orderBy: { validFrom: 'desc' },
      select: {
        id: true,
        contentHash: true,
        metaTitle: true,
        appealText: true,
        narrativeText: true,
        screenshotUrl: true,
        mobileScreenshotUrl: true,
        diagnostics: true,
        validFrom: true,
        validTo: true,
        enModifiedAt: true,
        capturedAt: true,
      },
    });

    // Fetch fundraising snapshots, reporting currency, and AI settings in parallel
    const [fundraisingSnapshotsMap, reportingCurrency, aiSettings] =
      await Promise.all([
        fetchPeriodSnapshots(page.id, ['LAST_7_DAYS', 'PREV_7_DAYS', 'LAST_30_DAYS', 'LIFETIME']),
        getReportingCurrency(),
        getAiSettings(),
      ]);

    // Extract snapshots for recent performance
    const last7DaysSnapshot = fundraisingSnapshotsMap.get('LAST_7_DAYS');
    const prev7DaysSnapshot = fundraisingSnapshotsMap.get('PREV_7_DAYS');
    const last30DaysSnapshot = fundraisingSnapshotsMap.get('LAST_30_DAYS');
    const lifetimeSnapshot = fundraisingSnapshotsMap.get('LIFETIME');

    // Build recent performance data (7-day)
    let recentPerformance = null;
    if (last7DaysSnapshot) {
      recentPerformance = {
        current: snapshotToPerformanceData(last7DaysSnapshot),
        previous: prev7DaysSnapshot ? snapshotToComparisonData(prev7DaysSnapshot) : undefined,
        isPartialPeriod: isPeriodPartial(last7DaysSnapshot.periodStart, page.enCreatedAt),
      };
    }

    // Build 30-day summary data
    let thirtyDaySummary = null;
    if (last30DaysSnapshot) {
      thirtyDaySummary = {
        revenue: last30DaysSnapshot.totalAmount,
        donors: last30DaysSnapshot.donationCount,
        singleCount: last30DaysSnapshot.singleCount,
        singleAmount: last30DaysSnapshot.singleAmount,
        recurringCount: last30DaysSnapshot.recurringCount,
        recurringAmount: last30DaysSnapshot.recurringAmount,
        isPartialPeriod: isPeriodPartial(last30DaysSnapshot.periodStart, page.enCreatedAt),
        sinceDate: page.enCreatedAt || last30DaysSnapshot.periodStart,
      };
    }

    // Build lifetime totals data
    let lifetimeTotals = null;
    if (lifetimeSnapshot) {
      lifetimeTotals = {
        totalRevenue: lifetimeSnapshot.totalAmount,
        supporters: lifetimeSnapshot.supporters ?? lifetimeSnapshot.donationCount,
        highestDonation: lifetimeSnapshot.highestDonation ?? 0,
        averageDonation: lifetimeSnapshot.averageDonation ?? 0,
        sinceDate: page.enCreatedAt || lifetimeSnapshot.periodStart,
        registrations: page.fundraisingRegistrations ?? 0,
      };
    }

    // Calculate tracking accuracy (GA4 vs EN comparison over last 30 days)
    // Sum GA4 conversions from the last 30 days of performance snapshots
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const ga4Conversions = page.snapshots
      .filter((s) => s.date >= thirtyDaysAgo)
      .reduce((sum, s) => sum + s.conversions, 0);

    const enDonations = last30DaysSnapshot?.donationCount ?? null;
    const enRevenue = last30DaysSnapshot?.totalAmount ?? 0;

    const trackingAccuracyData = calculateTrackingAccuracy({
      ga4Conversions: page.snapshots.length > 0 ? ga4Conversions : null,
      enDonations,
      enRevenue,
      currency: reportingCurrency,
    });

    return {
      page,
      latestContentSnapshot,
      snapshots: page.snapshots,
      recommendations: page.recommendations,
      recentPerformance,
      thirtyDaySummary,
      lifetimeTotals,
      trackingAccuracy: trackingAccuracyData,
      reportingCurrency,
      contextProfiles: aiSettings.contextProfiles,
    };
  } catch (error) {
    rootLogger.error({ err: error instanceof Error ? error : new Error(String(error)), route: '/pages/[id]' }, 'Error fetching page details');
    throw error;
  }
}

async function getPageNavigation(currentId: string, liveOnly: boolean) {
  const allPages = await prisma.fundraisingPage.findMany({
    where: liveOnly ? { status: 'ACTIVE' } : undefined,
    select: {
      id: true,
      campaignStatus: true,
      fundraisingSnapshots: {
        where: { periodType: 'LAST_30_DAYS' },
        orderBy: { fetchedAt: 'desc' },
        take: 1,
        select: { totalAmount: true },
      },
    },
  });

  // Filter with isLiveCampaign (case-insensitive, matches dashboard behavior)
  const pages = liveOnly
    ? allPages.filter((p) => isLiveCampaign(p.campaignStatus))
    : allPages;

  // Sort by 30-day revenue descending (matches dashboard order)
  const sorted = pages.sort((a, b) => {
    const aRevenue = a.fundraisingSnapshots[0]?.totalAmount ?? 0;
    const bRevenue = b.fundraisingSnapshots[0]?.totalAmount ?? 0;
    return bRevenue - aRevenue;
  });

  const currentIndex = sorted.findIndex((p) => p.id === currentId);

  if (currentIndex === -1) {
    return { prevId: null, nextId: null, currentIndex: 0, total: sorted.length };
  }

  return {
    prevId: currentIndex > 0 ? sorted[currentIndex - 1].id : null,
    nextId: currentIndex < sorted.length - 1 ? sorted[currentIndex + 1].id : null,
    currentIndex: currentIndex + 1,
    total: sorted.length,
  };
}

export default async function PageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const liveOnly = query.live !== '0';
  const [data, nav] = await Promise.all([getPageDetail(id), getPageNavigation(id, liveOnly)]);

  if (!data) {
    notFound();
  }

  const {
    page,
    latestContentSnapshot,
    snapshots,
    recommendations,
    recentPerformance,
    thirtyDaySummary,
    lifetimeTotals,
    trackingAccuracy,
    reportingCurrency,
    contextProfiles,
  } = data;

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Page Navigation */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors font-medium">
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{page.name}</span>
        </nav>
        <PageNavigation
          prevId={nav.prevId}
          nextId={nav.nextId}
          currentIndex={nav.currentIndex}
          total={nav.total}
          liveOnly={liveOnly}
        />
      </div>

      {/* Page Header */}
      <PageHeader page={page} />

      {/* Tabbed Content: Metrics, Content, AI Recommendations */}
      <PageTabs
        page={page}
        snapshots={snapshots}
        reportingCurrency={reportingCurrency}
        recentPerformance={recentPerformance}
        thirtyDaySummary={thirtyDaySummary}
        lifetimeTotals={lifetimeTotals}
        trackingAccuracy={trackingAccuracy}
        contentSnapshot={latestContentSnapshot}
        recommendations={recommendations}
        pageId={page.id}
        contextProfiles={contextProfiles}
        aiProfileId={page.aiProfileId}
      />

      {/* Debug Tools */}
      <DebugButtons
        pageId={page.id}
        pageName={page.name}
        campaignId={page.campaignId}
        isENPublicConfigured={await isENPublicConfiguredAsync()}
      />

      {/* Actions */}
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="outline">← Back to Dashboard</Button>
        </Link>
        <a href={getScrapableUrl(page)} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary">View Live Page →</Button>
        </a>
      </div>
    </div>
  );
}
