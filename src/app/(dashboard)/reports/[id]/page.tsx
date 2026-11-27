import { notFound } from 'next/navigation';
import { ReportRunView } from '@/components/reports/report-run-view';
import { prismaStore } from '@/lib/reports/store';

export const metadata = { title: 'Report' };

export default async function ReportRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await prismaStore.getRun(id);
  if (!run) notFound();

  const [figures, queries, events] = await Promise.all([
    prismaStore.listFigures(id),
    prismaStore.listQueries(id),
    prismaStore.listEvents(id),
  ]);

  return (
    <ReportRunView
      run={{
        id: run.id,
        title: run.title,
        status: run.status,
        statusReason: run.statusReason,
        preparedBy: run.preparedBy,
        startedAt: run.startedAt?.toISOString() ?? null,
        completedAt: run.completedAt?.toISOString() ?? null,
        warnings: run.warnings,
        stepCount: run.stepCount,
        usage: run.usage,
        cancelRequested: run.cancelRequested,
      }}
      figures={figures.map((figure) => ({
        key: figure.key,
        label: figure.label,
        display: figure.display,
        source: figure.source,
        recheckStatus: figure.recheckStatus,
        previousValue: figure.previousValue,
      }))}
      queries={queries.map((query) => ({
        key: query.key,
        tool: query.tool,
        params: query.params,
        rowCount: query.rowCount,
        sampled: query.sampled,
        samplingNote: query.samplingNote,
        recheck: query.recheck && {
          matched: query.recheck.matched,
          error: query.recheck.error ?? null,
        },
      }))}
      events={events.map((event) => ({
        seq: event.seq,
        type: event.type,
        message: event.message,
        createdAt: event.createdAt.toISOString(),
      }))}
    />
  );
}
