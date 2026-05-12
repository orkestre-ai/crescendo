'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { clog } from '@/lib/client-logger';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { JobStatusCard } from '@/components/job-status/job-status-card';
import { CollectionJob } from '@/types/api';
import { RefreshCw, Loader2, AlertTriangle } from 'lucide-react';

// Configuration for polling and stuck job detection
const POLLING_INTERVAL_MS = 2000; // Poll every 2 seconds
const STUCK_THRESHOLD_MS = 3 * 60 * 1000; // Consider stuck after 3 minutes of no progress (Playwright scraping averages ~37s/page, progress only updates at phase boundaries)
const MAX_CONSECUTIVE_FAILURES = 5; // Only stop after 5 failures IN A ROW
const CONTINUE_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000]; // Backoff delays

interface RefreshButtonProps {
  disabled?: boolean;
}

export function RefreshButton({ disabled = false }: RefreshButtonProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentJob, setCurrentJob] = useState<CollectionJob | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Keep track of last progress for stuck detection
  const lastProgressRef = useRef<{ progress: number; timestamp: number } | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Refs to avoid stale closures in setInterval callbacks
  const consecutiveFailuresRef = useRef(0);
  const continueJobRef = useRef<((jobId: string) => Promise<void>) | undefined>(undefined);

  // Sync refs to avoid stale closures in setInterval
  useEffect(() => {
    consecutiveFailuresRef.current = consecutiveFailures;
  }, [consecutiveFailures]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      setIsStuck(false);
      setConsecutiveFailures(0);
      setError(null);
      lastProgressRef.current = null;

      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ triggeredBy: 'user', jobType: 'SYNC' }),
      });

      // A sync is already running — attach to it instead of erroring
      if (response.status === 409) {
        const errorData = await response.json().catch(() => null);
        const activeJob = errorData?.details?.job;
        if (activeJob) {
          setCurrentJob(activeJob);
          setShowModal(true);
          setIsRefreshing(false);
          startPolling(activeJob.id);
          return;
        }
        // 409 without job payload — surface a meaningful message
        throw new Error(errorData?.message || 'A sync is already running.');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to create collection job');
      }

      const data = await response.json();
      setCurrentJob(data.job);
      setShowModal(true);
      setIsRefreshing(false);

      // Start polling for job status
      startPolling(data.job.id);
    } catch (err) {
      clog.error('refresh-button', 'trigger-failed', { error: err instanceof Error ? err.message : String(err) });
      setError(err instanceof Error ? err.message : 'Failed to trigger data collection. Please try again.');
      setIsRefreshing(false);
    }
  };

  const continueJob = useCallback(
    async (jobId: string) => {
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        clog.error('refresh-button', 'max-failures-reached', { consecutiveFailures });
        return;
      }

      try {
        // Apply backoff delay
        const backoffIndex = Math.min(consecutiveFailures, CONTINUE_BACKOFF_MS.length - 1);
        const delay = CONTINUE_BACKOFF_MS[backoffIndex];
        if (consecutiveFailures > 0) {
          clog.info('refresh-button', 'retry-backoff', { delayMs: delay, failureCount: consecutiveFailures });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        clog.info('refresh-button', 'process-attempt', { consecutiveFailures });

        const response = await fetch(`/api/jobs/${jobId}/process`, {
          method: 'POST',
        });

        if (!response.ok) {
          clog.error('refresh-button', 'continue-failed', { status: response.status });
          setConsecutiveFailures((prev) => prev + 1);
          return;
        }

        // Success - reset failure count
        setConsecutiveFailures(0);
        setIsStuck(false);
        lastProgressRef.current = { progress: currentJob?.progress || 0, timestamp: Date.now() };

        clog.info('refresh-button', 'continue-success');
      } catch (error) {
        clog.error('refresh-button', 'continue-error', { error: error instanceof Error ? error.message : String(error) });
        setConsecutiveFailures((prev) => prev + 1);
      }
    },
    [consecutiveFailures, currentJob?.progress]
  );

  // Keep continueJob ref current for use inside setInterval
  useEffect(() => {
    continueJobRef.current = continueJob;
  }, [continueJob]);

  const startPolling = useCallback((jobId: string) => {
    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) {
          clearInterval(pollingIntervalRef.current!);
          pollingIntervalRef.current = null;
          return;
        }

        const data = await response.json();
        setCurrentJob(data.job);

        // Check for stuck job (no progress for STUCK_THRESHOLD_MS)
        const currentProgress = data.job.progress;
        const now = Date.now();

        if (data.job.status === 'PROCESSING') {
          if (lastProgressRef.current) {
            const timeSinceProgress = now - lastProgressRef.current.timestamp;
            const progressChanged = currentProgress !== lastProgressRef.current.progress;

            if (progressChanged) {
              // Progress made, reset
              lastProgressRef.current = { progress: currentProgress, timestamp: now };
              setIsStuck(false);
            } else if (timeSinceProgress > STUCK_THRESHOLD_MS) {
              // No progress for too long, job appears stuck
              clog.warn('refresh-button', 'job-stuck', { timeSinceProgressMs: timeSinceProgress });
              setIsStuck(true);

              // Also check the debug info from the response
              if (
                data.debug?.isStuck &&
                consecutiveFailuresRef.current < MAX_CONSECUTIVE_FAILURES
              ) {
                // Auto-trigger continuation for stuck jobs
                clog.info('refresh-button', 'auto-continue-triggered');
                continueJobRef.current?.(jobId);
              }
            }
          } else {
            // First poll, initialize
            lastProgressRef.current = { progress: currentProgress, timestamp: now };
          }
        }

        // Stop polling if job is complete, completed with errors, or failed
        if (
          data.job.status === 'COMPLETED' ||
          data.job.status === 'COMPLETED_WITH_ERRORS' ||
          data.job.status === 'FAILED'
        ) {
          clearInterval(pollingIntervalRef.current!);
          pollingIntervalRef.current = null;
          setIsStuck(false);

          // Refresh the page after completion (including partial success)
          if (data.job.status === 'COMPLETED' || data.job.status === 'COMPLETED_WITH_ERRORS') {
            setTimeout(() => {
              window.location.reload();
            }, 2000);
          }
        }
      } catch (error) {
        clog.error('refresh-button', 'poll-error', { error: error instanceof Error ? error.message : String(error) });
        clearInterval(pollingIntervalRef.current!);
        pollingIntervalRef.current = null;
      }
    }, POLLING_INTERVAL_MS);
  }, []);

  const handleCloseModal = () => {
    // Clear polling when modal is closed
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setShowModal(false);
    setCurrentJob(null);
    setIsStuck(false);
    setConsecutiveFailures(0);
    lastProgressRef.current = null;
  };

  const handleManualContinue = () => {
    if (currentJob) {
      continueJob(currentJob.id);
    }
  };

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <Button onClick={() => handleRefresh()} disabled={disabled || isRefreshing}>
          {isRefreshing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Sync Data
            </>
          )}
        </Button>
        {disabled && !isRefreshing && (
          <p className="text-xs text-muted-foreground">
            Connect Engaging Networks in Settings to enable
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <Dialog open={showModal} onOpenChange={handleCloseModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Data Collection In Progress</DialogTitle>
            <DialogDescription>
              Syncing pages, scraping content, and collecting metrics. AI recommendations
              are generated separately.
            </DialogDescription>
          </DialogHeader>

          {/* Stuck job warning */}
          {isStuck && (
            <div className="flex items-center gap-2 rounded-md bg-warning/10 border border-warning/20 p-3 text-sm text-warning">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Job appears to be stuck</p>
                <p className="text-warning">
                  {consecutiveFailures < MAX_CONSECUTIVE_FAILURES
                    ? 'Attempting to resume processing...'
                    : 'Multiple resume attempts failed. The job may have encountered an issue.'}
                </p>
              </div>
              {consecutiveFailures < MAX_CONSECUTIVE_FAILURES && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManualContinue}
                  className="flex-shrink-0"
                >
                  Retry
                </Button>
              )}
            </div>
          )}

          {currentJob && <JobStatusCard job={currentJob} />}

          <div className="flex justify-end gap-2">
            {isStuck && consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && currentJob && (
              <Button
                variant="outline"
                onClick={() => window.open(`/api/jobs/${currentJob.id}/debug`, '_blank')}
              >
                View Debug Info
              </Button>
            )}
            <Button variant="outline" onClick={handleCloseModal}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
