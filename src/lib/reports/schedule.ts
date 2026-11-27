import { rootLogger } from '@/lib/logging';
import { resolveInputDefaults, validateRunInputs } from './definitions/inputs';
import { SCHEDULE_TIME } from './definitions/schema';
import { ReportBusyError, runReport, startReportRun } from './runner';
import { prismaStore, type ReportStore } from './store';
import type { ReportDefinition, ReportRun } from './types';

const log = rootLogger.child({ journey: 'report', component: 'schedule' });

/** Schedules are read in this time zone: "07:00" is 7am in Toronto. */
export const SCHEDULE_TIME_ZONE = 'America/Toronto';

/** Who a run the schedule starts is prepared by. */
export const SCHEDULED_BY = 'Crescendo (daily)';

// stopInterruptedRuns writes this reason on a run a restart left behind.
const RESTART_REASON = 'Stopped because the server restarted';

/** The day and the time of day in Toronto, as YYYY-MM-DD and HH:MM. */
export function torontoClock(now: Date): { day: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: SCHEDULE_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

const interruptedByRestart = (run: ReportRun) =>
  run.status === 'STOPPED' && (run.statusReason ?? '').startsWith(RESTART_REASON);

/**
 * The enabled definitions whose daily time has passed today in Toronto and
 * that the schedule has not started today. A scheduled run that a server
 * restart stopped is tried once more; any other scheduled run today, however
 * it ended, means the definition is done for the day. Runs a person started
 * do not count.
 */
export async function dueScheduledRuns(now: Date, store: ReportStore): Promise<ReportDefinition[]> {
  const { day, time } = torontoClock(now);
  const scheduled = (await store.listDefinitions()).filter(
    (definition) =>
      definition.enabled &&
      definition.scheduleDailyAt !== null &&
      SCHEDULE_TIME.test(definition.scheduleDailyAt) &&
      definition.scheduleDailyAt <= time
  );
  if (scheduled.length === 0) return [];

  // Two days back covers the start of today in Toronto in any season.
  const recent = await store.listRunsSince(new Date(now.getTime() - 2 * 86_400_000));
  const today = recent.filter(
    (run) => run.trigger === 'schedule' && torontoClock(run.createdAt).day === day
  );
  return scheduled.filter((definition) => {
    const runs = today.filter((run) => run.definitionId === definition.id);
    return runs.length === 0 || (runs.length === 1 && interruptedByRestart(runs[0]));
  });
}

/**
 * One tick of the schedule: start the first due definition with its input
 * defaults. One report runs at a time, so while another is running nothing
 * starts and the definition stays due for the next tick. Returns the ids of
 * the runs started.
 */
export async function startScheduledRuns(
  now: Date = new Date(),
  deps: { store?: ReportStore; run?: (runId: string) => Promise<void> } = {}
): Promise<string[]> {
  const store = deps.store ?? prismaStore;
  const run = deps.run ?? ((runId: string) => runReport(runId));
  const started: string[] = [];

  for (const definition of await dueScheduledRuns(now, store)) {
    const checked = validateRunInputs(
      resolveInputDefaults(definition.inputs, torontoClock(now).day),
      {}
    );
    if (!checked.ok) {
      log.warn(
        { key: definition.key, errors: checked.errors, event: 'report.schedule.invalid_inputs' },
        'A scheduled report has required fields with no default; not started'
      );
      continue;
    }
    try {
      const { runId } = await startReportRun(
        {
          definitionId: definition.id,
          inputs: checked.values,
          preparedBy: SCHEDULED_BY,
          trigger: 'schedule',
        },
        { store }
      );
      log.info(
        { runId, key: definition.key, event: 'report.schedule.started' },
        'Scheduled report started'
      );
      // Runs in the background. runReport records its own failures on the run.
      void run(runId);
      started.push(runId);
    } catch (err) {
      if (!(err instanceof ReportBusyError)) throw err;
      log.info(
        { key: definition.key, busyRunId: err.runId, event: 'report.schedule.busy' },
        'Another report is running; the scheduled report waits for the next tick'
      );
      break;
    }
  }
  return started;
}
