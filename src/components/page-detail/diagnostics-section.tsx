'use client';

import type { PageDiagnostics } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface DiagnosticsSectionProps {
  diagnostics: PageDiagnostics | null;
}

function LoadTimeBubble({ loadTimeMs }: { loadTimeMs: number }) {
  const seconds = loadTimeMs / 1000;
  const formatted = seconds > 0 ? `${seconds.toFixed(1)}s` : '--';
  const color =
    seconds <= 0
      ? 'text-muted-foreground border-border'
      : seconds < 3
        ? 'text-success border-success/30 bg-success/5'
        : seconds <= 5
          ? 'text-warning border-warning/30 bg-warning/5'
          : 'text-destructive border-destructive/30 bg-destructive/5';

  return (
    <div className={`inline-flex flex-col items-center rounded-xl border px-4 py-2.5 ${color}`}>
      <span className="text-lg font-semibold leading-tight">{formatted}</span>
      <span className="text-[11px] font-medium opacity-70">Load Time</span>
    </div>
  );
}

function RequestsBubble({
  totalRequests,
  totalTransferSizeKb,
}: {
  totalRequests: number;
  totalTransferSizeKb: number;
}) {
  return (
    <div className="inline-flex flex-col items-center rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-foreground">
      <span className="text-lg font-semibold leading-tight">{totalRequests}</span>
      <span className="text-[11px] font-medium text-muted-foreground">
        {totalTransferSizeKb > 0 ? `Requests · ${totalTransferSizeKb} KB` : 'Requests'}
      </span>
    </div>
  );
}

function ErrorsBubble({ count }: { count: number }) {
  const color =
    count === 0
      ? 'text-success border-success/30 bg-success/5'
      : 'text-destructive border-destructive/30 bg-destructive/5';

  return (
    <div className={`inline-flex flex-col items-center rounded-xl border px-4 py-2.5 ${color}`}>
      <span className="text-lg font-semibold leading-tight">{count}</span>
      <span className="text-[11px] font-medium opacity-70">
        {count === 0 ? 'Issues' : count === 1 ? 'Issue' : 'Issues'}
      </span>
    </div>
  );
}

export function DiagnosticsSection({ diagnostics }: DiagnosticsSectionProps) {
  if (!diagnostics) return null;

  const errorCount = diagnostics.consoleErrors.length + diagnostics.jsExceptions.length;
  const warningCount = diagnostics.consoleWarnings.length;
  const failedCount = diagnostics.failedRequests.length;
  const totalIssues = errorCount + warningCount + failedCount;

  // Determine default tab
  const defaultTab =
    errorCount > 0
      ? 'errors'
      : warningCount > 0
        ? 'warnings'
        : failedCount > 0
          ? 'failed'
          : 'errors';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Page Diagnostics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Metric Bubbles */}
        <div className="flex flex-wrap gap-3">
          <LoadTimeBubble loadTimeMs={diagnostics.loadTimeMs} />
          <RequestsBubble
            totalRequests={diagnostics.totalRequests}
            totalTransferSizeKb={diagnostics.totalTransferSizeKb}
          />
          <ErrorsBubble count={errorCount + failedCount} />
        </div>

        {/* Detail Tabs */}
        {totalIssues === 0 ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed py-6 text-sm text-muted-foreground">
            No issues detected
          </div>
        ) : (
          <Tabs defaultValue={defaultTab}>
            <TabsList>
              <TabsTrigger value="errors" className="text-xs">
                Errors{errorCount > 0 ? ` (${errorCount})` : ''}
              </TabsTrigger>
              <TabsTrigger value="warnings" className="text-xs">
                Warnings{warningCount > 0 ? ` (${warningCount})` : ''}
              </TabsTrigger>
              <TabsTrigger value="failed" className="text-xs">
                Failed Requests{failedCount > 0 ? ` (${failedCount})` : ''}
              </TabsTrigger>
            </TabsList>

            {/* Console Errors + JS Exceptions */}
            <TabsContent value="errors">
              {errorCount === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No console errors or JS exceptions
                </p>
              ) : (
                <div className="space-y-2">
                  {diagnostics.consoleErrors.length > 0 && (
                    <ul className="space-y-1 rounded bg-destructive/10 p-3">
                      {diagnostics.consoleErrors.map((err, i) => (
                        <li
                          key={`ce-${i}`}
                          className="break-all font-mono text-xs text-destructive"
                        >
                          {err.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  {diagnostics.jsExceptions.length > 0 && (
                    <ul className="space-y-1 rounded bg-destructive/10 p-3">
                      {diagnostics.jsExceptions.map((ex, i) => (
                        <li
                          key={`je-${i}`}
                          className="break-all font-mono text-xs text-destructive"
                        >
                          {ex}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Console Warnings */}
            <TabsContent value="warnings">
              {warningCount === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No console warnings
                </p>
              ) : (
                <ul className="space-y-1 rounded bg-warning/10 p-3">
                  {diagnostics.consoleWarnings.map((warn, i) => (
                    <li key={`cw-${i}`} className="break-all font-mono text-xs text-warning">
                      {warn.text}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            {/* Failed Requests */}
            <TabsContent value="failed">
              {failedCount === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No failed requests</p>
              ) : (
                <ul className="space-y-1 rounded bg-destructive/10 p-3">
                  {diagnostics.failedRequests.map((req, i) => (
                    <li key={`fr-${i}`} className="break-all font-mono text-xs text-destructive">
                      {req.status ?? 'ERR'} {req.resourceType} — {req.url}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
