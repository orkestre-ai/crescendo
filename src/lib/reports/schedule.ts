import { rootLogger } from '@/lib/logging';
import { getTimeZone } from '@/lib/settings';
import { zonedClock } from '@/lib/time-zone';
import { resolveInputDefaults, validateRunInputs } from './definitions/inputs';
import { SCHEDULE_TIME } from './definitions/schema';
import { ReportBusyError, runReport, startReportRun } from './runner';
import { prismaStore, type ReportStore } from './store';
import type { ReportDefinition, ReportRun } from './types';

const log = rootLogger.child({ journey: 'report', component: 'schedule' });

/** Who a run the schedule starts is prepared by. */
export const SCHEDULED_BY = 'Crescendo (daily)';

// stopInterruptedRuns writes this reason on a run a restart left behind.
const RESTART_REASON = 'Stopped because the server restarted';

const interruptedByRestart = (run: ReportRun) =>
  run.status === 'STOPPED' && (run.statusReason ?? '').startsWith(RESTART_REASON);

/**
 * The enabled definitions whose daily time has passed today in the
 * organisation's time zone (an IANA name, from Settings) and
 * that the schedule has not started today. A scheduled run that a server
 * restart stopped is tried once more; any other scheduled run today, however
 * it ended, means the definition is done for the day. Runs a person started
 * do not count.
 */
export async function dueScheduledRuns(
  now: Date,
  store: ReportStore,
  timeZone: string
): Promise<ReportDefinition[]> {
  const { day, time } = zonedClock(now, timeZone);
  const scheduled = (await store.listDefinitions()).filter(
    (definition) =>
      definition.enabled &&
      definition.scheduleDailyAt !== null &&
      SCHEDULE_TIME.test(definition.scheduleDailyAt) &&
      definition.scheduleDailyAt <= time
  );
  if (scheduled.length === 0) return [];

  // Two days back covers the start of today in any time zone and season.
  const recent = await store.listRunsSince(new Date(now.getTime() - 2 * 86_400_000));
  const today = recent.filter(
    (run) => run.trigger === 'schedule' && zonedClock(run.createdAt, timeZone).day === day
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
  deps: {
    store?: ReportStore;
    run?: (runId: string) => Promise<void>;
    /** IANA time zone the daily times are read in. Defaults to the one in Settings. */
    timeZone?: string;
  } = {}
): Promise<string[]> {
  const store = deps.store ?? prismaStore;
  const timeZone = deps.timeZone ?? (await getTimeZone());
  const run = deps.run ?? ((runId: string) => runReport(runId));
  const started: string[] = [];

  for (const definition of await dueScheduledRuns(now, store, timeZone)) {
    const checked = validateRunInputs(
      resolveInputDefaults(definition.inputs, zonedClock(now, timeZone).day),
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
