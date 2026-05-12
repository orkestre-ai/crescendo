'use client';

import { CollectionJob } from '@/types/api';

type JobStatus = CollectionJob['status'];
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format, formatDistanceToNow } from 'date-fns';

interface JobHistoryListProps {
  jobs: CollectionJob[];
}

export function JobHistoryList({ jobs }: JobHistoryListProps) {
  if (jobs.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-md border border-dashed">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No job history available</p>
        </div>
      </div>
    );
  }

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

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return '-';
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const durationMs = endTime - startTime;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Started</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Errors</TableHead>
            <TableHead>Triggered By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm">
                    {format(new Date(String(job.startedAt)), 'MMM d, HH:mm')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(String(job.startedAt)), { addSuffix: true })}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={getStatusColor(job.status)}>
                  {job.status === 'COMPLETED_WITH_ERRORS' ? 'Partial' : job.status}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-16 rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground">{job.progress}%</span>
                </div>
              </TableCell>
              <TableCell className="text-sm">
                {formatDuration(
                  String(job.startedAt),
                  job.completedAt ? String(job.completedAt) : null
                )}
              </TableCell>
              <TableCell>
                {job.errors && job.errors.length > 0 ? (
                  <Badge variant="destructive">{job.errors.length}</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{job.triggeredBy}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
