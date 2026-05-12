'use client';

import { useState } from 'react';
import { clog } from '@/lib/client-logger';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { JobStatusCard } from '@/components/job-status/job-status-card';
import { CollectionJob } from '@/types/api';
import {
  FileSearch,
  Sparkles,
  Loader2,
  ChevronDown,
  Bug,
  History,
  DollarSign,
  AlertCircle,
  Calendar,
} from 'lucide-react';

type DebugAction = 'SCRAPE' | 'RECOMMEND';
type SpecialAction = 'BACKFILL_GA4' | 'FETCH_FUNDRAISING' | 'REFRESH_SNAPSHOTS';

interface DebugButtonsProps {
  pageId: string;
  pageName: string;
  campaignId?: number | null;
  isENPublicConfigured?: boolean;
}

interface ActionConfig {
  action: DebugAction;
  label: string;
  description: string;
  icon: React.ReactNode;
  endpoint: string;
}

interface BackfillResult {
  success: boolean;
  daysBackfilled?: number;
  daysWithData?: number;
  error?: string;
}

interface FundraisingResult {
  success: boolean;
  data?: {
    campaignId: number;
    campaignName: string;
    totalDonated: number;
    highestDonation: number;
    averageDonation: number;
    registrations: number;
    supporters: number;
    pageHits: number;
    fetchedAt: string;
  };
  error?: string;
}

interface SnapshotResult {
  success: boolean;
  message?: string;
  results?: Array<{
    periodType: string;
    success: boolean;
    totalAmount?: number;
    donationCount?: number;
    error?: string;
  }>;
  error?: string;
}

export function DebugButtons({
  pageId,
  pageName,
  campaignId,
  isENPublicConfigured = true,
}: DebugButtonsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<DebugAction | SpecialAction | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showBackfillModal, setShowBackfillModal] = useState(false);
  const [showFundraisingModal, setShowFundraisingModal] = useState(false);
  const [currentJob, setCurrentJob] = useState<CollectionJob | null>(null);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [fundraisingResult, setFundraisingResult] = useState<FundraisingResult | null>(null);
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);
  const [snapshotResult, setSnapshotResult] = useState<SnapshotResult | null>(null);

  const ACTIONS: ActionConfig[] = [
    {
      action: 'SCRAPE',
      label: 'Scrape Content',
      description: 'Extract headlines, CTAs, and donation amounts from page HTML',
      icon: <FileSearch className="h-4 w-4" />,
      endpoint: `/api/pages/${pageId}/scrape`,
    },
    {
      action: 'RECOMMEND',
      label: 'Generate Recs',
      description: 'Create AI-powered optimization recommendations',
      icon: <Sparkles className="h-4 w-4" />,
      endpoint: `/api/pages/${pageId}/recommend`,
    },
  ];

  const handleRunAction = async (config: ActionConfig) => {
    try {
      setActiveAction(config.action);

      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to run ${config.label}`);
      }

      const data = await response.json();
      // The per-page endpoints return { jobId, status, message }
      // Fetch the full job to display in the status card
      const jobResponse = await fetch(`/api/jobs/${data.jobId}`);
      if (jobResponse.ok) {
        const jobData = await jobResponse.json();
        setCurrentJob(jobData.job);
      }
      setShowModal(true);
      setActiveAction(null);

      // Start polling for job status
      if (data.jobId) {
        startPolling(data.jobId);
      }
    } catch (error) {
      clog.error('debug-buttons', 'action-trigger-failed', { action: config.label, error: error instanceof Error ? error.message : String(error) });
      alert(`Failed to run ${config.label}. ${error instanceof Error ? error.message : ''}`);
      setActiveAction(null);
    }
  };

  const handleBackfillGA4 = async () => {
    try {
      setActiveAction('BACKFILL_GA4');

      const response = await fetch(`/api/pages/${pageId}/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setBackfillResult({
          success: false,
          error: data.error || 'Failed to backfill GA4 data',
        });
      } else {
        setBackfillResult({
          success: true,
          daysBackfilled: data.result?.daysBackfilled,
          daysWithData: data.result?.daysWithData,
        });
      }

      setShowBackfillModal(true);
      setActiveAction(null);
    } catch (error) {
      clog.error('debug-buttons', 'ga4-backfill-failed', { error: error instanceof Error ? error.message : String(error) });
      setBackfillResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      setShowBackfillModal(true);
      setActiveAction(null);
    }
  };

  const startPolling = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) {
          clearInterval(interval);
          return;
        }

        const data = await response.json();
        setCurrentJob(data.job);

        // Stop polling if job is complete or failed
        if (
          data.job.status === 'COMPLETED' ||
          data.job.status === 'COMPLETED_WITH_ERRORS' ||
          data.job.status === 'FAILED'
        ) {
          clearInterval(interval);

          // Refresh the page after completion
          if (data.job.status === 'COMPLETED' || data.job.status === 'COMPLETED_WITH_ERRORS') {
            setTimeout(() => {
              window.location.reload();
            }, 2000);
          }
        }
      } catch (error) {
        clog.error('debug-buttons', 'poll-error', { error: error instanceof Error ? error.message : String(error) });
        clearInterval(interval);
      }
    }, 1000); // Poll every 1 second for debug jobs (they're fast)
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setCurrentJob(null);
  };

  const handleCloseBackfillModal = () => {
    setShowBackfillModal(false);
    setBackfillResult(null);
    // Refresh the page if backfill was successful
    if (backfillResult?.success) {
      window.location.reload();
    }
  };

  const handleFetchFundraising = async () => {
    try {
      setActiveAction('FETCH_FUNDRAISING');

      const response = await fetch(`/api/pages/${pageId}/fundraising`);
      const data = await response.json();

      if (!response.ok) {
        setFundraisingResult({
          success: false,
          error: data.error || 'Failed to fetch fundraising data',
        });
      } else {
        setFundraisingResult({
          success: true,
          data: data.data,
        });
      }

      setShowFundraisingModal(true);
      setActiveAction(null);
    } catch (error) {
      clog.error('debug-buttons', 'fetch-fundraising-failed', { error: error instanceof Error ? error.message : String(error) });
      setFundraisingResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      setShowFundraisingModal(true);
      setActiveAction(null);
    }
  };

  const handleCloseFundraisingModal = () => {
    setShowFundraisingModal(false);
    setFundraisingResult(null);
    // Refresh the page if fetch was successful
    if (fundraisingResult?.success) {
      window.location.reload();
    }
  };

  const handleRefreshSnapshots = async () => {
    try {
      setActiveAction('REFRESH_SNAPSHOTS');

      const response = await fetch(`/api/pages/${pageId}/snapshots`, {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok) {
        setSnapshotResult({
          success: false,
          error: data.error || 'Failed to refresh period data',
        });
      } else {
        setSnapshotResult({
          success: data.success,
          message: data.message,
          results: data.results,
        });
      }

      setShowSnapshotModal(true);
      setActiveAction(null);
    } catch (error) {
      clog.error('debug-buttons', 'refresh-snapshots-failed', { error: error instanceof Error ? error.message : String(error) });
      setSnapshotResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      setShowSnapshotModal(true);
      setActiveAction(null);
    }
  };

  const handleCloseSnapshotModal = () => {
    setShowSnapshotModal(false);
    setSnapshotResult(null);
    // Refresh the page if successful
    if (snapshotResult?.success) {
      window.location.reload();
    }
  };

  const isLoading = activeAction !== null;

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Bug className="h-4 w-4" />
            Debug Tools
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground mb-4">
              Run individual actions for this page only.
            </p>
            <div className="flex flex-wrap gap-2">
              {ACTIONS.map((config) => (
                <Button
                  key={config.action}
                  variant="secondary"
                  size="sm"
                  onClick={() => handleRunAction(config)}
                  disabled={isLoading}
                  title={config.description}
                  className="gap-2"
                >
                  {activeAction === config.action ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    config.icon
                  )}
                  {config.label}
                </Button>
              ))}

              {/* Backfill GA4 - Special Action */}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBackfillGA4}
                disabled={isLoading}
                title="Backfill 90 days of historical GA4 data for this page"
                className="gap-2 border-dashed border-2"
              >
                {activeAction === 'BACKFILL_GA4' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <History className="h-4 w-4" />
                )}
                Backfill GA4
              </Button>

              {/* Fetch Fundraising Data - Special Action */}
              {!isENPublicConfigured ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled
                  title="EN Public API token not configured. Add EN_PUBLIC_TOKEN to your environment."
                  className="gap-2 border-dashed border-2 opacity-50"
                >
                  <AlertCircle className="h-4 w-4" />
                  Not Configured
                </Button>
              ) : !campaignId ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled
                  title="Page does not have a campaign ID. Sync from EN first."
                  className="gap-2 border-dashed border-2 opacity-50"
                >
                  <DollarSign className="h-4 w-4" />
                  No Campaign ID
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleFetchFundraising}
                  disabled={isLoading}
                  title="Fetch fundraising totals from EN Public API"
                  className="gap-2 border-dashed border-2"
                >
                  {activeAction === 'FETCH_FUNDRAISING' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <DollarSign className="h-4 w-4" />
                  )}
                  Fetch Fundraising
                </Button>
              )}

              {/* Refresh Period Snapshots - Special Action */}
              {!isENPublicConfigured ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled
                  title="EN Public API token not configured. Add EN_PUBLIC_TOKEN to your environment."
                  className="gap-2 border-dashed border-2 opacity-50"
                >
                  <AlertCircle className="h-4 w-4" />
                  Not Configured
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRefreshSnapshots}
                  disabled={isLoading}
                  title="Refresh 7-day, 30-day, and lifetime period data from EN Public API"
                  className="gap-2 border-dashed border-2"
                >
                  {activeAction === 'REFRESH_SNAPSHOTS' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Calendar className="h-4 w-4" />
                  )}
                  Refresh Period Data
                </Button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Job Status Modal */}
      <Dialog open={showModal} onOpenChange={handleCloseModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Debug Job In Progress</DialogTitle>
            <DialogDescription>
              Running single-page debug job for &quot;{pageName}&quot;
            </DialogDescription>
          </DialogHeader>
          {currentJob && <JobStatusCard job={currentJob} />}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCloseModal}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Backfill Result Modal */}
      <Dialog open={showBackfillModal} onOpenChange={handleCloseBackfillModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {backfillResult?.success ? 'GA4 Backfill Complete' : 'GA4 Backfill Failed'}
            </DialogTitle>
            <DialogDescription>
              {backfillResult?.success
                ? `Historical GA4 data has been loaded for "${pageName}"`
                : `Failed to backfill GA4 data for "${pageName}"`}
            </DialogDescription>
          </DialogHeader>

          {backfillResult?.success ? (
            <div className="space-y-2 py-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Days backfilled:</span>
                <span className="font-medium">{backfillResult.daysBackfilled}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Days with data:</span>
                <span className="font-medium">{backfillResult.daysWithData}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                The page will refresh to show the updated metrics and trends.
              </p>
            </div>
          ) : (
            <div className="py-4">
              <p className="text-sm text-destructive">
                {backfillResult?.error || 'An unknown error occurred'}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCloseBackfillModal}>
              {backfillResult?.success ? 'Close & Refresh' : 'Close'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fundraising Result Modal */}
      <Dialog open={showFundraisingModal} onOpenChange={handleCloseFundraisingModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {fundraisingResult?.success ? 'Fundraising Data Fetched' : 'Fetch Failed'}
            </DialogTitle>
            <DialogDescription>
              {fundraisingResult?.success
                ? `Fundraising data has been updated for "${pageName}"`
                : `Failed to fetch fundraising data for "${pageName}"`}
            </DialogDescription>
          </DialogHeader>

          {fundraisingResult?.success && fundraisingResult.data ? (
            <div className="space-y-2 py-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Campaign:</span>
                <span className="font-medium">{fundraisingResult.data.campaignName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Donated:</span>
                <span className="font-medium text-success">
                  $
                  {fundraisingResult.data.totalDonated.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Registrations:</span>
                <span className="font-medium">
                  {fundraisingResult.data.registrations.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Supporters:</span>
                <span className="font-medium">
                  {fundraisingResult.data.supporters.toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                The page will refresh to show the updated fundraising totals.
              </p>
            </div>
          ) : (
            <div className="py-4">
              <p className="text-sm text-destructive">
                {fundraisingResult?.error || 'An unknown error occurred'}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCloseFundraisingModal}>
              {fundraisingResult?.success ? 'Close & Refresh' : 'Close'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Period Snapshot Result Modal */}
      <Dialog open={showSnapshotModal} onOpenChange={handleCloseSnapshotModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {snapshotResult?.success ? 'Period Data Refreshed' : 'Refresh Failed'}
            </DialogTitle>
            <DialogDescription>
              {snapshotResult?.success
                ? `Period-based fundraising data has been updated for "${pageName}"`
                : `Failed to refresh period data for "${pageName}"`}
            </DialogDescription>
          </DialogHeader>

          {snapshotResult?.success && snapshotResult.results ? (
            <div className="space-y-3 py-4">
              {snapshotResult.results.map((result) => (
                <div key={result.periodType} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {result.periodType.replace(/_/g, ' ')}:
                  </span>
                  {result.success ? (
                    <span className="font-medium text-success">
                      $
                      {result.totalAmount?.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      ({result.donationCount} donations)
                    </span>
                  ) : (
                    <span className="text-destructive text-xs">{result.error}</span>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-2">
                The page will refresh to show the updated data.
              </p>
            </div>
          ) : (
            <div className="py-4">
              <p className="text-sm text-destructive">
                {snapshotResult?.error || 'An unknown error occurred'}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCloseSnapshotModal}>
              {snapshotResult?.success ? 'Close & Refresh' : 'Close'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
