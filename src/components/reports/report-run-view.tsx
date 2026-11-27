'use client';

import { AlertTriangle } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  FigureSource,
  RecheckStatus,
  ReportEventType,
  ReportRunStatus,
  ReportWarning,
  RowMatch,
} from '@/lib/reports/types';

interface RunSummary {
  id: string;
  title: string;
  status: ReportRunStatus;
  statusReason: string | null;
  preparedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  warnings: ReportWarning[];
}

interface FigureRow {
  key: string;
  label: string;
  display: string;
  source: FigureSource;
  recheckStatus: RecheckStatus;
  previousValue: number | null;
}

interface QueryRow {
  key: string;
  tool: string;
  params: unknown;
  rowCount: number;
  sampled: boolean;
  samplingNote: string | null;
  recheck: { matched: boolean; error: string | null } | null;
}

interface EventRow {
  seq: number;
  type: ReportEventType;
  message: string;
  createdAt: string;
}

const STATUS: Record<ReportRunStatus, { label: string; variant: BadgeProps['variant'] }> = {
  QUEUED: { label: 'Queued', variant: 'secondary' },
  RUNNING: { label: 'Running', variant: 'info' },
  RECHECKING: { label: 'Rechecking', variant: 'info' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  NEEDS_ATTENTION: { label: 'Needs attention', variant: 'warning' },
  STOPPED: { label: 'Stopped', variant: 'warning' },
  CANCELLED: { label: 'Cancelled', variant: 'secondary' },
  FAILED: { label: 'Failed', variant: 'destructive' },
};

const RECHECK: Record<RecheckStatus, { label: string; variant: BadgeProps['variant'] }> = {
  matched: { label: 'Matched', variant: 'success' },
  corrected: { label: 'Corrected', variant: 'warning' },
  stated: { label: 'Stated, not checked', variant: 'secondary' },
  unchecked: { label: 'Not checked', variant: 'secondary' },
};

const INCOMPLETE: Partial<Record<ReportRunStatus, string>> = {
  QUEUED: 'This report has not started yet.',
  RUNNING: 'This report is still being written. What you see below is unfinished.',
  RECHECKING: 'The figures in this report are being checked a second time.',
  NEEDS_ATTENTION: 'This report stopped before it was finished and needs a person to look at it.',
  STOPPED: 'This report was stopped before it was finished.',
  CANCELLED: 'This report was cancelled before it was finished.',
  FAILED: 'This report failed before it was finished.',
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

const condition = (match: RowMatch) =>
  `${match.column} ${match.op} ${Array.isArray(match.value) ? match.value.join(', ') : match.value}`;

/** Where a figure comes from, in a line. */
function describeSource(source: FigureSource): string {
  switch (source.kind) {
    case 'cell':
      return `${source.column} in ${source.query}, where ${source.where.map(condition).join(' and ')}`;
    case 'aggregate':
      return `${source.agg} of ${source.column} in ${source.query}${
        source.where?.length ? `, where ${source.where.map(condition).join(' and ')}` : ''
      }`;
    case 'formula':
      return `${source.expr}, with ${Object.entries(source.refs)
        .map(([name, key]) => `${name} = ${key}`)
        .join(', ')}`;
    default:
      return `Stated: ${source.reason}`;
  }
}

/**
 * One report run: its status, the document in a sandboxed frame, and under
 * it the ledger, the queries, the activity log and the warnings.
 */
export function ReportRunView({
  run,
  figures,
  queries,
  events,
}: {
  run: RunSummary;
  figures: FigureRow[];
  queries: QueryRow[];
  events: EventRow[];
}) {
  const status = STATUS[run.status];
  const incomplete = INCOMPLETE[run.status];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{run.title}</h1>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {[
            run.preparedBy && `Prepared by ${run.preparedBy}`,
            run.startedAt && `Started ${when(run.startedAt)}`,
            run.completedAt && `Ended ${when(run.completedAt)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {incomplete && (
        <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">{incomplete}</p>
            {run.statusReason && <p className="text-muted-foreground mt-1">{run.statusReason}</p>}
          </div>
        </div>
      )}

      <iframe
        src={`/api/reports/runs/${run.id}/html?mode=screen`}
        title={run.title}
        sandbox="allow-scripts"
        className="h-[75vh] w-full rounded-lg border bg-background"
      />

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">Ledger ({figures.length})</TabsTrigger>
          <TabsTrigger value="queries">Queries ({queries.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity ({events.length})</TabsTrigger>
          <TabsTrigger value="warnings">Warnings ({run.warnings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          {figures.length === 0 ? (
            <p className="text-muted-foreground py-6 text-sm">No figures have been recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Figure</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Recheck</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {figures.map((figure) => (
                  <TableRow key={figure.key}>
                    <TableCell>
                      <div className="font-medium">{figure.label}</div>
                      <div className="text-muted-foreground font-mono text-xs">{figure.key}</div>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {figure.display}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {describeSource(figure.source)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={RECHECK[figure.recheckStatus].variant} size="sm">
                        {RECHECK[figure.recheckStatus].label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="queries">
          {queries.length === 0 ? (
            <p className="text-muted-foreground py-6 text-sm">No queries have been run.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead>Tool</TableHead>
                  <TableHead>Asked for</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead>Recheck</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queries.map((query) => (
                  <TableRow key={query.key}>
                    <TableCell className="font-mono text-sm">{query.key}</TableCell>
                    <TableCell>{query.tool}</TableCell>
                    <TableCell className="max-w-md">
                      <code className="text-muted-foreground block truncate text-xs">
                        {JSON.stringify(query.params)}
                      </code>
                      {query.sampled && (
                        <span className="text-warning text-xs">
                          Sampled{query.samplingNote ? `: ${query.samplingNote}` : ''}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{query.rowCount}</TableCell>
                    <TableCell>
                      {query.recheck ? (
                        <Badge
                          variant={
                            query.recheck.error
                              ? 'secondary'
                              : query.recheck.matched
                                ? 'success'
                                : 'warning'
                          }
                          size="sm"
                        >
                          {query.recheck.error
                            ? 'Could not be re-run'
                            : query.recheck.matched
                              ? 'Same rows'
                              : 'Rows changed'}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not yet</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="activity">
          {events.length === 0 ? (
            <p className="text-muted-foreground py-6 text-sm">Nothing has happened yet.</p>
          ) : (
            <ol className="divide-y text-sm">
              {events.map((event) => (
                <li key={event.seq} className="flex gap-3 py-2">
                  <span className="text-muted-foreground w-36 shrink-0 text-xs tabular-nums">
                    {when(event.createdAt)}
                  </span>
                  <span className="text-muted-foreground w-20 shrink-0 text-xs uppercase">
                    {event.type.replace('_', ' ')}
                  </span>
                  <span className="min-w-0 whitespace-pre-wrap break-words">{event.message}</span>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="warnings">
          {run.warnings.length === 0 ? (
            <p className="text-muted-foreground py-6 text-sm">No warnings.</p>
          ) : (
            <ul className="divide-y text-sm">
              {run.warnings.map((warning, i) => (
                <li key={i} className="flex gap-3 py-2">
                  <span className="text-muted-foreground w-20 shrink-0 text-xs uppercase">
                    {warning.kind}
                  </span>
                  <span className="min-w-0 break-words">{warning.message}</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
