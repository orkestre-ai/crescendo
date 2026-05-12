'use client';

import { useEffect, useState } from 'react';
import { clog } from '@/lib/client-logger';
import { CollectionJob } from '@/types/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Database, Sparkles, CheckCircle, RefreshCw, Globe } from 'lucide-react';

export function JobStatusIndicator() {
  const [currentJob, setCurrentJob] = useState<CollectionJob | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrentJob();
    const interval = setInterval(() => {
      fetchCurrentJob();
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const fetchCurrentJob = async () => {
    try {
      const response = await fetch('/api/jobs?status=PROCESSING&limit=10');
      if (!response.ok) {
        setCurrentJob(null);
        return;
      }

      const data = await response.json();

      // Filter to only show jobs updated in the last 5 minutes
      const STALE_THRESHOLD_MS = 5 * 60 * 1000;
      const now = Date.now();
      const activeJobs = (data.jobs || []).filter((job: CollectionJob) => {
        const updatedAt = new Date(job.updatedAt).getTime();
        return now - updatedAt < STALE_THRESHOLD_MS;
      });

      if (activeJobs.length > 0) {
        // Show most recently updated job
        const sortedJobs = activeJobs.sort(
          (a: CollectionJob, b: CollectionJob) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        setCurrentJob(sortedJobs[0]);
      } else {
        // Check for pending jobs
        const pendingResponse = await fetch('/api/jobs?status=PENDING&limit=1');
        if (pendingResponse.ok) {
          const pendingData = await pendingResponse.json();
          if (pendingData.jobs && pendingData.jobs.length > 0) {
            setCurrentJob(pendingData.jobs[0]);
          } else {
            setCurrentJob(null);
          }
        } else {
          setCurrentJob(null);
        }
      }
    } catch (error) {
      clog.warn('job-status-indicator', 'fetch-error', {
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
      });
      setCurrentJob(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null;
  }

  if (!currentJob) {
    return null;
  }

  const getPhaseInfo = (phase: string) => {
    switch (phase) {
      case 'SYNCING':
        return { label: 'Syncing Pages', icon: RefreshCw };
      case 'SCRAPING':
        return { label: 'Scraping Content', icon: Globe };
      case 'COLLECTING':
        return { label: 'Collecting Data', icon: Database };
      case 'FILLING_MISSING':
        return { label: 'Filling Missing Data', icon: Database };
      case 'GENERATING_RECS':
        return { label: 'Generating Recommendations', icon: Sparkles };
      case 'FINALIZING':
        return { label: 'Finalizing', icon: CheckCircle };
      default:
        return { label: phase, icon: Loader2 };
    }
  };

  const phaseInfo = getPhaseInfo(currentJob.phase);
  const PhaseIcon = phaseInfo.icon;

  return (
    <Card className="border-info/30 bg-info-light">
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-info/10 p-2">
              <PhaseIcon className="h-5 w-5 text-info animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-medium text-info-text">{phaseInfo.label}</p>
              <p className="text-xs text-info-text/80">
                {currentJob.processedPages} / {currentJob.totalPages} pages processed
              </p>
            </div>
          </div>

          <Badge variant="info" size="sm">
            {currentJob.status === 'PROCESSING'
              ? 'Processing'
              : currentJob.status === 'PENDING'
                ? 'Pending'
                : currentJob.status === 'COMPLETED_WITH_ERRORS'
                  ? 'Completed with Errors'
                  : currentJob.status}
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-bold text-info-text">{currentJob.progress}%</p>
          </div>
          <div className="h-2 w-32 rounded-full bg-info/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-info transition-all duration-300"
              style={{ width: `${currentJob.progress}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
