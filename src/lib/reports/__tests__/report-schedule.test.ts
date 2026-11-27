import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_REPORT_DEFINITIONS } from '../definitions';
import { stopInterruptedRuns } from '../runner';
import { dueScheduledRuns, SCHEDULED_BY, startScheduledRuns, torontoClock } from '../schedule';
import { memoryStore } from '../store';
import type { ReportDefinition } from '../types';

const daily = (over: Partial<ReportDefinition> = {}): ReportDefinition => ({
  id: 'daily',
  key: 'daily',
  name: 'Daily report',
  description: '',
  prompt: 'From {{start}}.',
  inputs: [
    { key: 'start', label: 'Start', type: 'date', required: true, default: '{{year}}-11-15' },
  ],
  enabledTools: ['ga4_report'],
  maxSteps: 20,
  maxMinutes: 10,
  isDefault: true,
  enabled: true,
  sortOrder: 0,
  scheduleDailyAt: '07:00',
  ...over,
});

/** A store whose clock the test moves, and a run function that only records. */
function setup(definitions: ReportDefinition[] = [daily()]) {
  let clock = new Date('2026-12-01T00:00:00Z');
  const store = memoryStore({ definitions, now: () => clock });
  const ran: string[] = [];
  const tick = (iso: string) => {
    clock = new Date(iso);
    return startScheduledRuns(clock, {
      store,
      run: async (runId) => {
        ran.push(runId);
      },
    });
  };
  const due = (iso: string) =>
    dueScheduledRuns(new Date(iso), store).then((found) => found.map((d) => d.key));
  // A run ends as the runner would end it.
  const end = (runId: string, status: 'COMPLETED' | 'FAILED' = 'COMPLETED') =>
    store.updateRun(runId, { status, completedAt: clock });
  return { store, ran, tick, due, end };
}

test('torontoClock: the day and time in Toronto, in winter and in summer', () => {
  // EST is UTC-5: 03:00 UTC on 2 December is still 1 December in Toronto.
  assert.deepEqual(torontoClock(new Date('2026-12-02T03:00:00Z')), {
    day: '2026-12-01',
    time: '22:00',
  });
  assert.deepEqual(torontoClock(new Date('2026-12-02T05:00:00Z')), {
    day: '2026-12-02',
    time: '00:00',
  });
  // EDT is UTC-4.
  assert.deepEqual(torontoClock(new Date('2026-07-01T11:00:00Z')), {
    day: '2026-07-01',
    time: '07:00',
  });
});

test('dueScheduledRuns: due from its time in Toronto, not before, in either season', async () => {
  const { due } = setup();
  assert.deepEqual(await due('2026-12-01T11:59:00Z'), []); // 06:59 EST
  assert.deepEqual(await due('2026-12-01T12:00:00Z'), ['daily']); // 07:00 EST
  assert.deepEqual(await due('2026-07-01T10:59:00Z'), []); // 06:59 EDT
  assert.deepEqual(await due('2026-07-01T11:00:00Z'), ['daily']); // 07:00 EDT
  // 07:00 UTC is 02:00 in Toronto: the UTC day has turned but the time has not come.
  assert.deepEqual(await due('2026-12-02T07:00:00Z'), []);
});

test('startScheduledRuns: once a day, marked as the schedule, with the defaults of the day in Toronto', async () => {
  const { store, ran, tick, end } = setup();

  assert.deepEqual(await tick('2026-12-01T11:50:00Z'), []);
  const [runId] = await tick('2026-12-01T12:00:00Z');
  assert.deepEqual(ran, [runId]);

  const run = (await store.getRun(runId))!;
  assert.equal(run.trigger, 'schedule');
  assert.equal(run.preparedBy, SCHEDULED_BY);
  assert.equal(run.preparedBy, 'Crescendo (daily)');
  assert.equal(run.definitionId, 'daily');
  assert.deepEqual(run.inputs, { start: '2026-11-15' });

  // While it runs, and after it has finished, the same day starts nothing.
  assert.deepEqual(await tick('2026-12-01T12:10:00Z'), []);
  await end(runId);
  assert.deepEqual(await tick('2026-12-01T18:00:00Z'), []);
  // Late evening in Toronto is past midnight UTC, and still the same day.
  assert.deepEqual(await tick('2026-12-02T04:50:00Z'), []);
  // The next morning it runs again.
  assert.deepEqual(await tick('2026-12-02T11:50:00Z'), []);
  assert.equal((await tick('2026-12-02T12:00:00Z')).length, 1);
  assert.equal(ran.length, 2);
});

test('startScheduledRuns: a run a person started does not count; another scheduled one would', async () => {
  const { store, tick, end } = setup();
  // 06:00 in Toronto on the same day, before the scheduled time.
  assert.deepEqual(await tick('2026-12-01T11:00:00Z'), []);
  const manual = await store.createRun({
    definitionId: 'daily',
    definitionSnapshot: daily(),
    title: 'Daily report',
    preparedBy: 'Sam Rivera',
    inputs: {},
  });
  assert.equal(manual.trigger, 'manual');
  assert.equal(torontoClock(manual.createdAt).day, '2026-12-01');
  await end(manual.id);

  assert.equal((await tick('2026-12-01T12:00:00Z')).length, 1);
});

test('startScheduledRuns: a busy runner starts nothing, and the report waits for the next tick', async () => {
  const { store, ran, tick, due, end } = setup();
  const other = await store.createRun({
    definitionId: null,
    definitionSnapshot: daily({ key: 'other' }),
    title: 'Year-end review',
    preparedBy: null,
    inputs: {},
  });

  assert.deepEqual(await tick('2026-12-01T12:00:00Z'), []);
  assert.deepEqual(ran, []);
  assert.deepEqual(await due('2026-12-01T12:05:00Z'), ['daily']);
  assert.deepEqual(await tick('2026-12-01T12:10:00Z'), []);

  await end(other.id);
  assert.equal((await tick('2026-12-01T12:20:00Z')).length, 1);
  assert.equal(ran.length, 1);
});

test('startScheduledRuns: two due reports start one at a time', async () => {
  const { ran, tick, end } = setup([daily(), daily({ id: 'second', key: 'second', sortOrder: 1 })]);
  const [first] = await tick('2026-12-01T12:00:00Z');
  assert.equal(ran.length, 1);
  await end(first);
  assert.equal((await tick('2026-12-01T12:10:00Z')).length, 1);
  assert.equal(ran.length, 2);
  assert.deepEqual(await tick('2026-12-01T12:20:00Z'), []);
});

test('startScheduledRuns: a run a restart stopped is tried once more that day, not again', async () => {
  const { store, tick } = setup();
  const [first] = await tick('2026-12-01T12:00:00Z');
  assert.equal(await stopInterruptedRuns(store), 1);

  const [second] = await tick('2026-12-01T12:10:00Z');
  assert.ok(second);
  assert.notEqual(second, first);
  assert.equal(await stopInterruptedRuns(store), 1);

  assert.deepEqual(await tick('2026-12-01T12:20:00Z'), []);
  // The next day starts afresh.
  assert.equal((await tick('2026-12-02T12:00:00Z')).length, 1);
});

test('startScheduledRuns: a run that failed is not retried the same day', async () => {
  const { tick, end } = setup();
  const [runId] = await tick('2026-12-01T12:00:00Z');
  await end(runId, 'FAILED');
  assert.deepEqual(await tick('2026-12-01T12:10:00Z'), []);
});

test('startScheduledRuns: not scheduled, turned off, or missing a required value: never started', async () => {
  const { ran, tick } = setup([
    daily({ id: 'a', key: 'a', scheduleDailyAt: null }),
    daily({ id: 'b', key: 'b', enabled: false }),
    daily({
      id: 'c',
      key: 'c',
      inputs: [{ key: 'start', label: 'Start', type: 'date', required: true }],
    }),
  ]);
  assert.deepEqual(await tick('2026-12-01T12:00:00Z'), []);
  assert.deepEqual(await tick('2026-12-01T23:00:00Z'), []);
  assert.deepEqual(ran, []);
});

test('the daily year-end report is scheduled at 07:00 and its defaults alone fill its form', async () => {
  const seed = BUILTIN_REPORT_DEFINITIONS.find((d) => d.key === 'year-end-daily')!;
  assert.equal(seed.scheduleDailyAt, '07:00');
  const { store, tick } = setup([
    {
      ...seed,
      id: 'yed',
      description: '',
      isDefault: true,
      sortOrder: 1,
      scheduleDailyAt: '07:00',
    },
  ]);
  const [runId] = await tick('2026-12-01T12:00:00Z');
  assert.deepEqual((await store.getRun(runId))!.inputs, {
    campaignStart: '2026-11-15',
    campaignEnd: '2026-12-31',
    givingTuesday: '',
    givingTuesdayLastYear: '',
  });
});
