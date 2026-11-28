import type { BadgeProps } from '@/components/ui/badge';
import type { ReportRunStatus } from '@/lib/reports/types';

/** How each state of a run is named and coloured, wherever a run is listed. */
export const RUN_STATUS: Record<
  ReportRunStatus,
  { label: string; variant: BadgeProps['variant'] }
> = {
  QUEUED: { label: 'Queued', variant: 'secondary' },
  RUNNING: { label: 'Running', variant: 'info' },
  RECHECKING: { label: 'Rechecking', variant: 'info' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  NEEDS_ATTENTION: { label: 'Needs attention', variant: 'warning' },
  STOPPED: { label: 'Stopped', variant: 'warning' },
  CANCELLED: { label: 'Cancelled', variant: 'secondary' },
  FAILED: { label: 'Failed', variant: 'destructive' },
};
