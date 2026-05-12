'use client';

import { CollectionJob } from '@/types/api';

type JobStatus = CollectionJob['status'];
type JobPhase = CollectionJob['phase'];
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface JobStatusCardProps {
  job: CollectionJob;
}

export function JobStatusCard({ job }: JobStatusCardProps) {
  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case 'COMPLETED':
        return 'default';
      case 'COMPLETED_WITH_ERRORS':
        return 'warning';
      case 'PROCESSING':
        return 'secondary';
      case 'FAILED':
        return 'destructive';
      case 'PENDING':
        return 'outline';
      case 'CANCELLED':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getPhaseLabel = (phase: JobPhase) => {
    switch (phase) {
      case 'SYNCING':
        return 'Syncing Pages';
      case 'SCRAPING':
        return 'Scraping Content';
      case 'COLLECTING':
        return 'Collecting GA4 Data';
      case 'FILLING_MISSING':
        return 'Filling Missing Data';
      case 'GENERATING_RECS':
        return 'Generating Recommendations';
      case 'FINALIZING':
        return 'Finalizing';
      default:
        return phase;
    }
  };

  const formatDuration = (start: string, end: string | null) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const durationMs = endTime - startTime;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Collection Job Status</CardTitle>
            {job.jobType && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {job.jobType === 'SYNC'
                  ? 'Sync'
                  : job.jobType === 'MANUAL_SCRAPE'
                    ? 'Manual Scrape'
                    : 'Manual Recs'}
              </span>
            )}
          </div>
          <Badge variant={getStatusColor(job.status)}>
            {job.status === 'COMPLETED_WITH_ERRORS' ? 'Completed with Errors' : job.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{job.progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>

        {/* Current Phase */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Current Phase</span>
          <span className="text-sm font-medium">{getPhaseLabel(job.phase)}</span>
        </div>

        {/* Pages Progress */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Pages</span>
          <span className="text-sm font-medium">
            {job.processedPages > 0
              ? `${job.processedPages} / ${job.totalPages}`
              : `${job.totalPages} pages`}
          </span>
        </div>

        {/* Duration */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Duration</span>
          <span className="text-sm font-medium">
            {formatDuration(
              String(job.startedAt),
              job.completedAt ? String(job.completedAt) : null
            )}
          </span>
        </div>

        {/* Started At */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Started</span>
          <span className="text-sm font-medium">{format(new Date(job.startedAt), 'PPp')}</span>
        </div>

        {/* Completed At */}
        {job.completedAt && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Completed</span>
            <span className="text-sm font-medium">{format(new Date(job.completedAt), 'PPp')}</span>
          </div>
        )}

        {/* Errors */}
        {job.errors && job.errors.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Errors</span>
              <Badge variant="destructive">{job.errors.length}</Badge>
            </div>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md bg-destructive/10 p-2">
              {job.errors.slice(0, 5).map((error, index) => {
                const err = error as any;
                return (
                  err && (
                    <div key={index} className="text-xs text-destructive">
                      {err.page && <span className="font-medium">{err.page}: </span>}
                      {err.error}
                    </div>
                  )
                );
              })}
              {job.errors.length > 5 && (
                <div className="text-xs text-muted-foreground">
                  +{job.errors.length - 5} more errors
                </div>
              )}
            </div>
          </div>
        )}

        {/* Triggered By */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Triggered By</span>
          <Badge variant="outline">{job.triggeredBy}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
