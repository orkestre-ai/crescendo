'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { clog } from '@/lib/client-logger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ACTIVE_STATUSES, type ReportRunStatus } from '@/lib/reports/types';
import { RUN_STATUS } from './status';

interface RunRow {
  id: string;
  title: string;
  definitionKey: string;
  definitionName: string;
  preparedBy: string | null;
  status: ReportRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

// The built-in report that runs each morning; its latest run is shown first.
const DAILY_KEY = 'year-end-daily';

/** How long a run took, or has taken so far: "42 min", "1 h 5 min". */
function duration(run: RunRow): string {
  if (!run.startedAt) return '';
  const end = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
  const minutes = Math.max(0, Math.round((end - new Date(run.startedAt).getTime()) / 60_000));
  if (minutes < 1) return 'under 1 min';
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** Past reports, newest first, and the way to start a new one. */
export function ReportRunsList() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const daily = runs?.find((run) => run.definitionKey === DAILY_KEY);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/reports/runs');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load the reports');
      setRuns(json.runs);
      setError(null);
    } catch (err) {
      clog.error('report-runs-list', 'fetch-runs-failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      setError('Failed to load the reports. Please try again.');
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  async function handleDelete(run: RunRow) {
    if (
      !window.confirm(
        `Delete "${run.title}" from ${when(run.startedAt ?? run.createdAt)}? Its document, ledger and queries are removed. This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/reports/runs/${run.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete the report');
      await fetchRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the report');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8" />
          <div>
            <h1 className="text-2xl font-semibold">Reports</h1>
            <p className="text-muted-foreground">
              Site-wide reviews that run in the background and check their own figures
            </p>
          </div>
        </div>
        <Button onClick={() => router.push('/reports/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New report
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {daily && (
        <Link
          href={`/reports/${daily.id}`}
          className="flex items-center justify-between gap-3 rounded-lg border p-4 hover:bg-muted/50"
        >
          <div>
            <p className="text-sm text-muted-foreground">Latest {daily.definitionName}</p>
            <p className="font-medium">
              {new Date(daily.startedAt ?? daily.createdAt).toLocaleDateString(undefined, {
                dateStyle: 'full',
              })}
            </p>
          </div>
          <Badge variant={RUN_STATUS[daily.status].variant} size="sm">
            {RUN_STATUS[daily.status].label}
          </Badge>
        </Link>
      )}

      {runs === null ? (
        !error && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        )
      ) : runs.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No reports yet. Click &quot;New report&quot; to start one.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report</TableHead>
              <TableHead>Prepared by</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell>
                  <Link href={`/reports/${run.id}`} className="font-medium hover:underline">
                    {run.title}
                  </Link>
                  {run.definitionName !== run.title && (
                    <div className="text-xs text-muted-foreground">{run.definitionName}</div>
                  )}
                </TableCell>
                <TableCell>{run.preparedBy}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {when(run.startedAt ?? run.createdAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{duration(run)}</TableCell>
                <TableCell>
                  <Badge variant={RUN_STATUS[run.status].variant} size="sm">
                    {RUN_STATUS[run.status].label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(run)}
                    disabled={ACTIVE_STATUSES.includes(run.status)}
                    title={
                      ACTIVE_STATUSES.includes(run.status)
                        ? 'Cancel this report before deleting it'
                        : undefined
                    }
                    aria-label={`Delete ${run.title}`}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
