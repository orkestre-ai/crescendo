'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CollectionJob } from '@/types/api';

interface ProgressIndicatorProps {
  jobId: string;
  onComplete?: () => void;
}

export function ProgressIndicator({ jobId, onComplete }: ProgressIndicatorProps) {
  const [job, setJob] = useState<CollectionJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line prefer-const -- captured by pollJobStatus before it's assigned below
    let interval: NodeJS.Timeout | undefined;

    const pollJobStatus = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch job status');
        }

        const data = await response.json();
        setJob(data.job);

        // Stop polling if job is completed, completed with errors, or failed
        if (
          data.job.status === 'COMPLETED' ||
          data.job.status === 'COMPLETED_WITH_ERRORS' ||
          data.job.status === 'FAILED'
        ) {
          clearInterval(interval);
          if (
            (data.job.status === 'COMPLETED' || data.job.status === 'COMPLETED_WITH_ERRORS') &&
            onComplete
          ) {
            onComplete();
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        clearInterval(interval);
      }
    };

    // Initial poll
    pollJobStatus();

    // Set up polling interval (every 2 seconds)
    interval = setInterval(pollJobStatus, 2000);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [jobId, onComplete]);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!job) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-info border-t-transparent rounded-full"></div>
            <span className="text-sm text-muted-foreground">Loading job status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusColor = () => {
    switch (job.status) {
      case 'COMPLETED':
        return 'text-success';
      case 'COMPLETED_WITH_ERRORS':
        return 'text-warning';
      case 'FAILED':
        return 'text-destructive';
      case 'PROCESSING':
        return 'text-info';
      default:
        return 'text-muted-foreground';
    }
  };

  const getPhaseText = () => {
    switch (job.phase) {
      case 'SYNCING':
        return 'Syncing pages from Engaging Networks';
      case 'SCRAPING':
        return 'Scraping page content';
      case 'COLLECTING':
        return 'Collecting GA4 metrics';
      case 'GENERATING_RECS':
        return 'Generating AI recommendations';
      case 'FINALIZING':
        return 'Finalizing';
      default:
        return 'Processing';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className={getStatusColor()}>
          {job.status === 'COMPLETED' && 'Data Collection Complete'}
          {job.status === 'COMPLETED_WITH_ERRORS' && 'Completed with Errors'}
          {job.status === 'FAILED' && 'Data Collection Failed'}
          {job.status === 'PROCESSING' && 'Collecting Data...'}
          {job.status === 'PENDING' && 'Starting...'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">{getPhaseText()}</span>
            <span className="font-medium">{job.progress}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-info transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          <p>
            Processed: {job.processedPages} / {job.totalPages} pages
          </p>
          {job.errors && job.errors.length > 0 && (
            <p className="text-destructive mt-2">
              {job.errors.length} {job.errors.length === 1 ? 'error' : 'errors'} encountered
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
