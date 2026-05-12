'use client';

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { clog } from '@/lib/client-logger';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Loader2,
  RefreshCw,
  Trash2,
  ChevronDown,
  Database,
  FileText,
  BarChart3,
  DollarSign,
  Lightbulb,
  Clock,
  Info,
  Square,
} from 'lucide-react';
import { ClearDataDialog } from './clear-data-dialog';
import { JobStatusCard } from '@/components/job-status/job-status-card';
import type { CollectionJob } from '@/types/api';
import type { SettingsResponse } from '@/types/settings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DatabasePanelProps {
  settings: SettingsResponse;
  onSettingsUpdate: () => void;
}

interface JobRecord {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED' | 'CANCELLED';
  jobType: string;
  phase: string;
  progress: number;
  totalPages: number;
  processedPages: number;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  error?: string | null;
  errors?: Array<{ page?: string; error?: string; timestamp?: string }>;
}

interface DatabaseSummary {
  pages: number;
  contentSnapshots: number;
  performanceSnapshots: number;
  fundraisingSnapshots: number;
  activeRecommendations: number;
  totalJobs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(startedAt: string, completedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.round((end - start) / 1000);

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusBadgeVariant(
  status: string
): 'success' | 'destructive' | 'info' | 'secondary' | 'warning' {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'FAILED':
      return 'destructive';
    case 'PROCESSING':
      return 'info';
    case 'COMPLETED_WITH_ERRORS':
      return 'warning';
    case 'CANCELLED':
      return 'secondary';
    case 'PENDING':
    default:
      return 'secondary';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'COMPLETED_WITH_ERRORS':
      return 'Partial';
    default:
      return status.charAt(0) + status.slice(1).toLowerCase();
  }
}

function getJobTypeBadgeVariant(jobType: string): 'default' | 'secondary' | 'outline' {
  switch (jobType) {
    case 'SYNC':
      return 'default';
    case 'MANUAL_SCRAPE':
    case 'MANUAL_RECS':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getJobTypeLabel(jobType: string): string {
  switch (jobType) {
    case 'SYNC':
      return 'Sync';
    case 'MANUAL_SCRAPE':
      return 'Scrape';
    case 'MANUAL_RECS':
      return 'Recs';
    case 'BACKFILL':
      return 'Backfill';
    default:
      return jobType;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DatabasePanel({ settings: _settings, onSettingsUpdate }: DatabasePanelProps) {
  // Actions state
  const [isSyncing, setIsSyncing] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  // Active job polling
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<JobRecord | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop + Details
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Sync log
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // Database stats
  const [dbSummary, setDbSummary] = useState<DatabaseSummary | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs?limit=20');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
      }
    } catch (err) {
      clog.error('database-panel', 'fetch-jobs-failed', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsLoadingJobs(false);
    }
  }, []);

  const fetchDbSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/database/summary');
      if (res.ok) {
        const data: DatabaseSummary = await res.json();
        setDbSummary(data);
      }
    } catch (err) {
      clog.error('database-panel', 'fetch-summary-failed', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    fetchJobs();
    fetchDbSummary();
  }, [fetchJobs, fetchDbSummary]);

  // ---------------------------------------------------------------------------
  // Job polling
  // ---------------------------------------------------------------------------

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const pollJob = useCallback(
    async (jobId: string) => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;

        const data = await res.json();
        const job: JobRecord = data.job;
        setActiveJob(job);

        // Job finished?
        if (
          job.status === 'COMPLETED' ||
          job.status === 'COMPLETED_WITH_ERRORS' ||
          job.status === 'FAILED' ||
          job.status === 'CANCELLED'
        ) {
          stopPolling();
          setActiveJobId(null);
          setActiveJob(null);
          setIsSyncing(false);
          setIsStopping(false);
          setDetailsOpen(false);
          // Refresh data
          fetchJobs();
          fetchDbSummary();
          onSettingsUpdate();
        }
      } catch (err) {
        clog.error('database-panel', 'poll-job-failed', { error: err instanceof Error ? err.message : String(err) });
      }
    },
    [stopPolling, fetchJobs, fetchDbSummary, onSettingsUpdate]
  );

  useEffect(() => {
    if (!activeJobId) return;

    // Immediately poll
    pollJob(activeJobId);

    // Then poll every 2 seconds
    pollIntervalRef.current = setInterval(() => pollJob(activeJobId), 2000);

    return () => stopPolling();
  }, [activeJobId, pollJob, stopPolling]);

  // Check for existing active jobs on mount
  useEffect(() => {
    async function checkActiveJobs() {
      try {
        const res = await fetch('/api/jobs?status=PROCESSING&limit=1');
        if (res.ok) {
          const data = await res.json();
          if (data.jobs?.length > 0) {
            setActiveJobId(data.jobs[0].id);
            setIsSyncing(true);
          }
        }
      } catch {
        // ignore
      }
    }
    checkActiveJobs();
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSync = async () => {
    setIsSyncing(true);

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggeredBy: 'settings', jobType: 'SYNC' }),
      });
      const data = await res.json();

      if (res.ok && data.job?.id) {
        setActiveJobId(data.job.id);
      } else if (res.status === 409 && data.details?.jobId) {
        // Already running - start polling the existing job
        setActiveJobId(data.details.jobId as string);
      } else {
        clog.error('database-panel', 'sync-failed', { data });
        setIsSyncing(false);
      }
    } catch (err) {
      clog.error('database-panel', 'start-sync-failed', { error: err instanceof Error ? err.message : String(err) });
      setIsSyncing(false);
    }
  };

  const handleStopSync = async () => {
    if (!activeJobId) return;
    setStopConfirmOpen(false);
    setIsStopping(true);
    try {
      const res = await fetch(`/api/jobs/${activeJobId}/cancel`, { method: 'POST' });
      if (!res.ok) {
        clog.error('database-panel', 'cancel-failed', { status: res.status });
        setIsStopping(false);
      }
      // On success: polling sees status=CANCELLED and resets state.
    } catch (err) {
      clog.error('database-panel', 'cancel-error', {
        error: err instanceof Error ? err.message : String(err),
      });
      setIsStopping(false);
    }
  };

  const handleClearComplete = () => {
    setClearDialogOpen(false);
    fetchJobs();
    fetchDbSummary();
    onSettingsUpdate();
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Section 1: Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Database Actions</CardTitle>
          <CardDescription>Sync pages from Engaging Networks or clear stored data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button onClick={handleSync} disabled={isSyncing}>
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Pages
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => setClearDialogOpen(true)} disabled={isSyncing}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Job Progress (visible when a job is active) */}
      {activeJob && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Sync in Progress</CardTitle>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDetailsOpen(true)}
                  disabled={isStopping}
                >
                  <Info className="h-4 w-4 mr-1.5" />
                  Details
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setStopConfirmOpen(true)}
                  disabled={isStopping}
                >
                  {isStopping ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      Stopping…
                    </>
                  ) : (
                    <>
                      <Square className="h-4 w-4 mr-1.5" />
                      Stop
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Phase: <span className="font-medium text-foreground">{activeJob.phase}</span>
              </span>
              <span className="font-medium">{activeJob.progress}%</span>
            </div>
            <Progress value={activeJob.progress} />
            <div className="text-xs text-muted-foreground">
              {activeJob.processedPages} / {activeJob.totalPages} pages processed
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 3: Sync Log Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Sync Log</CardTitle>
              <CardDescription>Recent sync and collection jobs</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsLoadingJobs(true);
                fetchJobs();
              }}
              disabled={isLoadingJobs}
            >
              {isLoadingJobs ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingJobs && jobs.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading jobs...
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No jobs found. Run a sync to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Type</TableHead>
                  <TableHead className="w-[160px]">Started</TableHead>
                  <TableHead className="w-[90px]">Duration</TableHead>
                  <TableHead className="w-[80px]">Pages</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const hasError =
                    job.status === 'FAILED' && ((job.errors && job.errors.length > 0) || job.error);
                  const isExpanded = expandedJobId === job.id;

                  return (
                    <Fragment key={job.id}>
                      <TableRow
                        className={hasError ? 'cursor-pointer' : undefined}
                        onClick={() => {
                          if (hasError) {
                            setExpandedJobId(isExpanded ? null : job.id);
                          }
                        }}
                      >
                        <TableCell>
                          <Badge variant={getJobTypeBadgeVariant(job.jobType)} size="sm">
                            {getJobTypeLabel(job.jobType)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{formatTimestamp(job.startedAt)}</TableCell>
                        <TableCell className="text-xs">
                          {formatDuration(job.startedAt, job.completedAt)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {job.processedPages}/{job.totalPages}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Badge variant={getStatusBadgeVariant(job.status)} size="sm">
                              {getStatusLabel(job.status)}
                            </Badge>
                            {hasError && (
                              <ChevronDown
                                className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {hasError && isExpanded && (
                        <tr>
                          <td colSpan={5} className="px-4 pb-3 pt-0">
                            <div className="bg-destructive/10 text-destructive rounded-md p-3 text-xs">
                              {job.error && <div>{job.error}</div>}
                              {job.errors &&
                                job.errors.slice(0, 5).map((err, i) => (
                                  <div key={i} className="mt-1">
                                    {err.page && <span className="font-medium">{err.page}: </span>}
                                    {err.error}
                                  </div>
                                ))}
                              {job.errors && job.errors.length > 5 && (
                                <div className="mt-1 text-destructive">
                                  ...and {job.errors.length - 5} more errors
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Database Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Database Statistics</CardTitle>
          <CardDescription>Overview of stored data</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingStats ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading statistics...
            </div>
          ) : dbSummary ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard
                icon={<Database className="h-4 w-4" />}
                label="Total Pages"
                value={dbSummary.pages}
              />
              <StatCard
                icon={<FileText className="h-4 w-4" />}
                label="Content Snapshots"
                value={dbSummary.contentSnapshots}
              />
              <StatCard
                icon={<BarChart3 className="h-4 w-4" />}
                label="Performance Snapshots"
                value={dbSummary.performanceSnapshots}
              />
              <StatCard
                icon={<DollarSign className="h-4 w-4" />}
                label="Fundraising Snapshots"
                value={dbSummary.fundraisingSnapshots}
              />
              <StatCard
                icon={<Lightbulb className="h-4 w-4" />}
                label="Active Recommendations"
                value={dbSummary.activeRecommendations}
              />
              <StatCard
                icon={<Clock className="h-4 w-4" />}
                label="Total Jobs"
                value={dbSummary.totalJobs}
              />
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Unable to load database statistics.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clear Data Dialog */}
      <ClearDataDialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        onComplete={handleClearComplete}
      />

      {/* Job Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Job Details</DialogTitle>
          </DialogHeader>
          {activeJob && <JobStatusCard job={activeJob as unknown as CollectionJob} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stop Sync Confirmation */}
      <Dialog open={stopConfirmOpen} onOpenChange={setStopConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Stop this sync?</DialogTitle>
            <DialogDescription>
              The run will stop after the current chunk finishes — pages already processed are
              kept. You can start a new sync at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStopConfirmOpen(false)}>
              Keep Syncing
            </Button>
            <Button variant="destructive" onClick={handleStopSync}>
              <Square className="h-4 w-4 mr-1.5" />
              Stop Sync
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard sub-component
// ---------------------------------------------------------------------------

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">{icon}</div>
      <div>
        <div className="text-2xl font-semibold leading-none tracking-tight">
          {value.toLocaleString()}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  );
}
