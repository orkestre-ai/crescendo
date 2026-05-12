export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getDashboardSummary } from '@/lib/dashboard-summary';
import { getEnApiKey, getReportingCurrency } from '@/lib/settings';
import { formatCurrency, formatNumber } from '@/lib/currency-utils';
import { PageList } from '@/components/dashboard/page-list';
import { RefreshButton } from '@/components/dashboard/refresh-button';
import { JobStatusIndicator } from '@/components/dashboard/job-status-indicator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { TrendingUp, DollarSign, FileText, Rocket } from 'lucide-react';
import { HelpButton } from '@/components/help/help-button';
import type { PageWithLatestSnapshot } from '@/types/api';
import type { ReportingCurrency } from '@/types/fundraising';

async function getDashboardData() {
  // Run summary helper and page list in parallel — they are independent.
  // Summary helper (F-02) provides livePages/activePages/totalUniquePages/
  // totalRevenue/totalDonations/lastCollectionAt via 5 parallel DB queries.
  const [pages, summary, enApiKey, reportingCurrency] = await Promise.all([
    // Page list: scoped select (F-03) drops 9 unused heavy columns.
    // Detail page has its own findUnique.
    prisma.fundraisingPage.findMany({
      select: {
        id: true,
        enPageId: true,
        name: true,
        url: true,
        enPageType: true,
        pageType: true,
        status: true,
        campaignId: true,
        title: true,
        subType: true,
        clientId: true,
        campaignBaseUrl: true,
        campaignStatus: true,
        defaultLocale: true,
        template: true,
        trackingParameters: true,
        enCreatedAt: true,
        enModifiedAt: true,
        lastSyncedAt: true,
        lastSyncStatus: true,
        headline: true,
        ctaButtons: true,
        donationAmounts: true,
        monthlyDonationAmounts: true,
        hasFeeCover: true,
        hasMonthlyGiving: true,
        currency: true,
        minDonationAmount: true,
        lastScrapedAt: true,
        pageNumber: true,
        pageCount: true,
        giftProcess: true,
        requiresPlaywright: true,
        aiProfileId: true,
        fundraisingTotalDonated: true,
        fundraisingHighestDonation: true,
        fundraisingAverageDonation: true,
        fundraisingRegistrations: true,
        fundraisingSupporters: true,
        fundraisingPageHits: true,
        fundraisingLastFetchedAt: true,
        createdAt: true,
        updatedAt: true,
        snapshots: {
          orderBy: { date: 'desc' },
          take: 1,
        },
        recommendations: {
          where: { status: 'ACTIVE' },
          select: { id: true },
        },
        fundraisingSnapshots: {
          where: {
            periodType: { in: ['LAST_30_DAYS', 'LAST_7_DAYS', 'PREV_7_DAYS'] },
          },
          orderBy: { fetchedAt: 'desc' },
          select: {
            periodType: true,
            totalAmount: true,
            donationCount: true,
            currency: true,
          },
        },
      },
    }),
    getDashboardSummary(),
    getEnApiKey(),
    getReportingCurrency(),
  ]);

  const isEnConfigured = enApiKey !== null;

  // Transform to API format
  const pagesWithMetrics: PageWithLatestSnapshot[] = pages.map((page) => {
    const latestSnapshot = page.snapshots[0];

    // Extract fundraising snapshots by period type (most recent of each)
    const snap30d = page.fundraisingSnapshots.find((s) => s.periodType === 'LAST_30_DAYS');
    const snap7d = page.fundraisingSnapshots.find((s) => s.periodType === 'LAST_7_DAYS');
    const snapPrev7d = page.fundraisingSnapshots.find((s) => s.periodType === 'PREV_7_DAYS');

    const fundraising30d = snap30d
      ? {
          totalAmount: snap30d.totalAmount,
          donationCount: snap30d.donationCount,
          currency: snap30d.currency as ReportingCurrency,
        }
      : null;

    const donationVelocity =
      snap7d && snapPrev7d
        ? {
            last7Days: snap7d.donationCount,
            prev7Days: snapPrev7d.donationCount,
            changePercent:
              snapPrev7d.donationCount > 0
                ? ((snap7d.donationCount - snapPrev7d.donationCount) / snapPrev7d.donationCount) * 100
                : null,
          }
        : null;

    return {
      id: page.id,
      enPageId: page.enPageId,
      name: page.name,
      url: page.url,
      enPageType: page.enPageType,
      pageType: page.pageType,
      status: page.status,
      campaignId: page.campaignId,
      title: page.title,
      subType: page.subType,
      clientId: page.clientId,
      campaignBaseUrl: page.campaignBaseUrl,
      campaignStatus: page.campaignStatus,
      defaultLocale: page.defaultLocale,
      template: page.template,
      trackingParameters: page.trackingParameters,
      enCreatedAt: page.enCreatedAt?.toISOString() || null,
      enModifiedAt: page.enModifiedAt?.toISOString() || null,
      lastSyncedAt: page.lastSyncedAt?.toISOString() || null,
      lastSyncStatus: page.lastSyncStatus,
      headline: page.headline,
      ctaButtons: page.ctaButtons,
      donationAmounts: page.donationAmounts,
      monthlyDonationAmounts: page.monthlyDonationAmounts,
      hasFeeCover: page.hasFeeCover,
      hasMonthlyGiving: page.hasMonthlyGiving,
      currency: page.currency,
      minDonationAmount: page.minDonationAmount,
      lastScrapedAt: page.lastScrapedAt?.toISOString() || null,
      pageNumber: page.pageNumber,
      pageCount: page.pageCount,
      giftProcess: page.giftProcess,
      requiresPlaywright: page.requiresPlaywright,
      aiProfileId: page.aiProfileId,
      fundraisingTotalDonated: page.fundraisingTotalDonated,
      fundraisingHighestDonation: page.fundraisingHighestDonation,
      fundraisingAverageDonation: page.fundraisingAverageDonation,
      fundraisingRegistrations: page.fundraisingRegistrations,
      fundraisingSupporters: page.fundraisingSupporters,
      fundraisingPageHits: page.fundraisingPageHits,
      fundraisingLastFetchedAt: page.fundraisingLastFetchedAt?.toISOString() || null,
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
      latestSnapshot: latestSnapshot
        ? {
            id: latestSnapshot.id,
            pageId: latestSnapshot.pageId,
            date: latestSnapshot.date.toISOString().split('T')[0],
            pageViews: latestSnapshot.pageViews,
            bounceRate: latestSnapshot.bounceRate,
            conversions: latestSnapshot.conversions,
            revenue: latestSnapshot.revenue,
            avgSessionDuration: latestSnapshot.avgSessionDuration,
            conversionRate: latestSnapshot.conversionRate,
            gaCollectedAt: latestSnapshot.gaCollectedAt?.toISOString() || null,
            enCollectedAt: latestSnapshot.enCollectedAt?.toISOString() || null,
            createdAt: latestSnapshot.createdAt.toISOString(),
            updatedAt: latestSnapshot.updatedAt.toISOString(),
          }
        : null,
      recommendationCount: page.recommendations.length,
      fundraising30d,
      donationVelocity,
    };
  });

  // Sort by revenue descending (highest first)
  const sortedPages = pagesWithMetrics.sort((a, b) => {
    const aRevenue = a.fundraising30d?.totalAmount ?? 0;
    const bRevenue = b.fundraising30d?.totalAmount ?? 0;
    return bRevenue - aRevenue;
  });

  return {
    pages: sortedPages,
    isEnConfigured,
    reportingCurrency,
    summary,
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [dashboardData, query] = await Promise.all([getDashboardData(), searchParams]);
  const { pages, isEnConfigured, reportingCurrency, summary } = dashboardData;
  const initialLiveOnly = query.live !== '0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Monitor performance and optimization recommendations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HelpButton />
          <RefreshButton disabled={!isEnConfigured} />
        </div>
      </div>

      {/* Job Status Indicator */}
      <JobStatusIndicator />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Live Pages
            </CardTitle>
            <div className="rounded-lg bg-primary/10 p-2">
              <FileText className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="text-3xl font-bold tracking-tight">{summary.livePages}</p>
              {summary.activePages > summary.livePages && (
                <p className="text-xs text-muted-foreground">
                  {summary.activePages} active (incl. new/tested)
                </p>
              )}
              {summary.totalUniquePages > summary.activePages && (
                <p className="text-xs text-muted-foreground">
                  {summary.totalUniquePages} total in database
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Donations
            </CardTitle>
            <div className="rounded-lg bg-primary/10 p-2">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="text-3xl font-bold tracking-tight">
                {formatNumber(summary.totalDonations)}
              </p>
              {summary.totalDonations > 0 && (
                <p className="text-xs text-muted-foreground">Last 30 days</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Revenue
            </CardTitle>
            <div className="rounded-lg bg-primary/10 p-2">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="text-3xl font-bold tracking-tight">
                {formatCurrency(summary.totalRevenue, reportingCurrency)}
              </p>
              {summary.totalRevenue > 0 && (
                <p className="text-xs text-muted-foreground">Last 30 days</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pages Table or Empty State */}
      {pages.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            {!isEnConfigured ? (
              <EmptyState
                icon={Rocket}
                title="Getting Started"
                description="Connect your Engaging Networks account to begin importing and optimizing your fundraising pages."
                action={{
                  label: 'Go to Settings',
                  href: '/settings',
                }}
              />
            ) : (
              <EmptyState
                icon={FileText}
                title="No Pages Found"
                description="Your Engaging Networks account is connected. Click 'Refresh Data' above to import your fundraising pages."
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 pb-0 py-0">
          <div className="flex items-center justify-between px-4 py-6 border-b">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold leading-none">Fundraising Pages</h3>
              <span className="text-xs text-muted-foreground">(last 30 days)</span>
            </div>
            {summary.lastCollectionAt && (
              <p className="text-xs text-muted-foreground">
                Last updated: {new Date(summary.lastCollectionAt).toLocaleString()}
              </p>
            )}
          </div>
          <CardContent className="p-0">
            <PageList pages={pages} initialLiveOnly={initialLiveOnly} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
