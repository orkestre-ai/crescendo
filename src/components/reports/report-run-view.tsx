'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Download, Loader2 } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { describeSource } from '@/lib/reports/ledger-csv';
import {
  ACTIVE_STATUSES,
  type FigureSource,
  type RecheckStatus,
  type ReportEventType,
  type ReportRunStatus,
  type ReportUsage,
  type ReportWarning,
} from '@/lib/reports/types';
import { RUN_STATUS } from './status';

interface RunSummary {
  id: string;
  title: string;
  status: ReportRunStatus;
  statusReason: string | null;
  preparedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  warnings: ReportWarning[];
  stepCount: number;
  usage: ReportUsage | null;
  cancelRequested: boolean;
}

/** What the events route says about a run each time it is asked. */
interface Progress {
  status: ReportRunStatus;
  statusReason: string | null;
  stepCount: number;
  usage: ReportUsage | null;
  cancelRequested: boolean;
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

const POLL_MS = 2000;

const tokens = (count: number) => count.toLocaleString();

/** Steps and tokens so far. Tokens, not dollars: there is no price table. */
function usageLine(steps: number, usage: ReportUsage | null): string {
  const parts = [`${steps} ${steps === 1 ? 'step' : 'steps'}`];
  if (usage) {
    parts.push(
      `${tokens(usage.inputTokens)} input tokens`,
      `${tokens(usage.cachedInputTokens)} read from cache`,
      `${tokens(usage.outputTokens)} output tokens`
    );
  }
  return parts.join(' · ');
}

// The three files a report can be saved as. Each link is a plain download:
// the server names the file.
const DOWNLOADS = [
  { label: 'PDF', path: 'pdf' },
  { label: 'HTML', path: 'html?download=1' },
  { label: 'Ledger CSV', path: 'ledger.csv' },
];

/**
 * One report run: its status, the document in a sandboxed frame, and under
 * it the ledger, the queries, the activity log and the warnings. While the
 * run is in progress the page asks for new activity every two seconds and
 * shows the steps, tokens and notes so far, with a way to cancel.
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
  const router = useRouter();
  // What polling has learned since the page was rendered.
  const [progress, setProgress] = useState<Progress | null>(null);
  const [polled, setPolled] = useState<EventRow[]>([]);
  const [isCancelling, setIsCancelling] = useState(false);
  // Changed when the run ends, so the frame loads the finished document.
  const [frameKey, setFrameKey] = useState(0);

  const live: Progress = progress ?? run;
  const isActive = ACTIVE_STATUSES.includes(live.status);
  const lastSeq = events.length > 0 ? events[events.length - 1].seq : 0;
  const allEvents = [...events, ...polled.filter((event) => event.seq > lastSeq)];
  const notes = allEvents.filter((event) => event.type === 'note');
  const seen = useRef(0);
  seen.current = allEvents.length > 0 ? allEvents[allEvents.length - 1].seq : 0;

  useEffect(() => {
    if (!isActive) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/reports/runs/${run.id}/events?after=${seen.current}`);
        if (!res.ok || stopped) return;
        const json: { events: EventRow[]; run: Progress } = await res.json();
        if (json.events.length > 0) {
          setPolled((prev) => [
            ...prev,
            ...json.events.filter((event) => !prev.some((p) => p.seq === event.seq)),
          ]);
        }
        setProgress(json.run);
        if (!ACTIVE_STATUSES.includes(json.run.status)) {
          // The run has ended: load its ledger, queries and warnings, and the finished document.
          setFrameKey((key) => key + 1);
          router.refresh();
        }
      } catch {
        // A missed poll is made up by the next one.
      }
    };
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [isActive, run.id, router]);

  async function handleCancel() {
    if (!window.confirm('Cancel this report? Its queries, ledger and notes so far are kept.')) {
      return;
    }
    setIsCancelling(true);
    try {
      await fetch(`/api/reports/runs/${run.id}/cancel`, { method: 'POST' });
    } catch {
      setIsCancelling(false);
    }
  }

  const status = RUN_STATUS[live.status];
  const incomplete = INCOMPLETE[live.status];
  const cancelling = isCancelling || live.cancelRequested;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
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
        <div className="flex flex-wrap gap-2">
          {DOWNLOADS.map((file) => (
            <a
              key={file.path}
              href={`/api/reports/runs/${run.id}/${file.path}`}
              download
              className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Download className="h-4 w-4" />
              {file.label}
            </a>
          ))}
        </div>
      </div>

      {incomplete && (
        <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">{incomplete}</p>
            {live.statusReason && <p className="text-muted-foreground mt-1">{live.statusReason}</p>}
          </div>
        </div>
      )}

      {isActive ? (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="font-medium tabular-nums">
                {usageLine(live.stepCount, live.usage)}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Cancelling after this step...' : 'Cancel'}
            </Button>
          </div>
          {notes.length > 0 && (
            <ol className="max-h-72 space-y-2 overflow-y-auto border-t pt-3 text-sm">
              {notes.map((note) => (
                <li key={note.seq} className="flex gap-3">
                  <span className="text-muted-foreground w-36 shrink-0 text-xs tabular-nums">
                    {when(note.createdAt)}
                  </span>
                  <span className="min-w-0 whitespace-pre-wrap break-words">{note.message}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        live.stepCount > 0 && (
          <p className="text-muted-foreground text-sm tabular-nums">
            {usageLine(live.stepCount, live.usage)}
          </p>
        )
      )}

      <iframe
        key={frameKey}
        src={`/api/reports/runs/${run.id}/html?mode=screen`}
        title={run.title}
        sandbox="allow-scripts"
        className="h-[75vh] w-full rounded-lg border bg-background"
      />

      <Tabs defaultValue={ACTIVE_STATUSES.includes(run.status) ? 'activity' : 'ledger'}>
        <TabsList>
          <TabsTrigger value="ledger">Ledger ({figures.length})</TabsTrigger>
          <TabsTrigger value="queries">Queries ({queries.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity ({allEvents.length})</TabsTrigger>
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
          {allEvents.length === 0 ? (
            <p className="text-muted-foreground py-6 text-sm">Nothing has happened yet.</p>
          ) : (
            <ol className="divide-y text-sm">
              {allEvents.map((event) => (
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
