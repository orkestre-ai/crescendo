import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLanguageModelV3 } from 'ai/test';
import { allTools } from '@/lib/ai/tools';
import { BUILTIN_BLOCKS } from '../blocks/builtin';
import { EMAILS_REMOVED, resolveBlockData, runLedger } from '../blocks/resolve';
import {
  BUILTIN_REPORT_DEFINITIONS,
  builtinDefinitionUpdates,
  type ReportDefinitionSeed,
  type StoredBuiltin,
} from '../definitions';
import {
  AUTO_VARIABLE_NAMES,
  buildReportPrompt,
  inputFieldsSchema,
  parseInputFields,
  promptVariables,
  resolveInputDefaults,
  validateRunInputs,
  type AutoVariables,
  type ReportInputField,
} from '../definitions/inputs';
import {
  definitionCreateSchema,
  definitionKey,
  definitionUpdateSchema,
  REPORT_TOOL_CHOICES,
} from '../definitions/schema';
import { reportFileName } from '../filename';
import { runReport, startReportRun } from '../runner';
import { memoryStore } from '../store';
import { createReportTools } from '../tools';
import type { DefinitionSnapshot } from '../types';

const FIELDS: ReportInputField[] = [
  { key: 'campaign', label: 'Campaign', type: 'text', required: true },
  { key: 'notes', label: 'Notes', type: 'textarea', required: false },
  { key: 'start', label: 'Start date', type: 'date', required: true, default: '{{year}}-11-15' },
  { key: 'asOf', label: 'As of', type: 'date', required: false, default: '{{today}}' },
  { key: 'days', label: 'Days', type: 'number', required: false, default: '90' },
  {
    key: 'period',
    label: 'Period',
    type: 'select',
    required: true,
    options: ['Month', 'Quarter'],
  },
];

const AUTO: AutoVariables = {
  today: '2026-11-27',
  organizationName: 'Example Organisation',
  timeZone: 'America/Toronto',
  currency: 'CAD',
  preparedBy: 'Sam Rivera',
};

const snapshot = (prompt: string): DefinitionSnapshot => ({
  key: 'test',
  name: 'Test',
  prompt,
  enabledTools: [],
  maxSteps: 10,
  maxMinutes: 10,
});

const errorsOf = (fields: ReportInputField[], values: Record<string, string>) => {
  const result = validateRunInputs(resolveInputDefaults(fields, '2026-11-27'), values);
  return result.ok ? {} : result.errors;
};

// --- inputs ---

test('validateRunInputs: a filled form comes back trimmed, one value per field', () => {
  const result = validateRunInputs(resolveInputDefaults(FIELDS, '2026-11-27'), {
    campaign: '  Year-end  ',
    period: 'Quarter',
    days: '30',
    somethingElse: 'dropped',
  });
  assert.deepEqual(result, {
    ok: true,
    values: {
      campaign: 'Year-end',
      notes: '',
      start: '2026-11-15',
      asOf: '2026-11-27',
      days: '30',
      period: 'Quarter',
    },
  });
});

test('validateRunInputs: a required field left empty is an error naming the field', () => {
  assert.deepEqual(errorsOf(FIELDS, { start: '2026-11-15' }), {
    campaign: 'Campaign is required.',
    period: 'Period is required.',
  });
  // Only spaces is empty too; an optional field may be left out.
  assert.equal(
    errorsOf(FIELDS, { campaign: '   ', period: 'Month', start: '2026-11-15' }).campaign,
    'Campaign is required.'
  );
});

test('validateRunInputs: a date must be a real day written YYYY-MM-DD', () => {
  const ok = { campaign: 'A', period: 'Month' };
  for (const bad of ['15 November 2026', '2026-11-31', '2026-13-01', '20261115', 'yesterday']) {
    assert.match(errorsOf(FIELDS, { ...ok, start: bad }).start, /must be a date, as YYYY-MM-DD/);
  }
  assert.deepEqual(errorsOf(FIELDS, { ...ok, start: '2028-02-29' }), {});
});

test('validateRunInputs: a number must be a number, a choice must be on the list', () => {
  const ok = { campaign: 'A', period: 'Month', start: '2026-11-15' };
  assert.equal(errorsOf(FIELDS, { ...ok, days: 'ninety' }).days, 'Days must be a number.');
  assert.deepEqual(errorsOf(FIELDS, { ...ok, days: '-7.5' }), {});
  assert.equal(
    errorsOf(FIELDS, { ...ok, period: 'Year' }).period,
    'Period must be one of: Month, Quarter.'
  );
});

test('validateRunInputs: one line of text is capped shorter than several lines', () => {
  const ok = { period: 'Month', start: '2026-11-15' };
  const long = 'x'.repeat(501);
  assert.equal(errorsOf(FIELDS, { ...ok, campaign: long }).campaign, 'Campaign is too long.');
  assert.deepEqual(errorsOf(FIELDS, { ...ok, campaign: 'A', notes: long }), {});
  assert.equal(
    errorsOf(FIELDS, { ...ok, campaign: 'A', notes: 'x'.repeat(5001) }).notes,
    'Notes is too long.'
  );
});

test('resolveInputDefaults: a default may use {{today}} and {{year}}, and nothing else', () => {
  const [start, asOf, other] = resolveInputDefaults(
    [
      { key: 'start', label: 'Start', type: 'date', required: true, default: '{{year}}-11-15' },
      { key: 'asOf', label: 'As of', type: 'date', required: true, default: '{{today}}' },
      { key: 'who', label: 'Who', type: 'text', required: false, default: '{{preparedBy}}' },
    ],
    '2027-01-04'
  );
  assert.equal(start.default, '2027-11-15');
  assert.equal(asOf.default, '2027-01-04');
  assert.equal(other.default, '');
  // A field with no default is given none.
  assert.equal(resolveInputDefaults([FIELDS[0]], '2027-01-04')[0].default, undefined);
});

test('inputFieldsSchema: keys are single words, unique, and not names Crescendo fills in', () => {
  const field = (key: string, extra: Partial<ReportInputField> = {}) => ({
    key,
    label: 'A field',
    type: 'text',
    required: false,
    ...extra,
  });
  const messages = (fields: unknown[]) => {
    const parsed = inputFieldsSchema.safeParse(fields);
    return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
  };

  assert.deepEqual(messages([field('campaignStart'), field('form_2')]), []);
  assert.match(messages([field('campaign start')])[0], /A key is one word/);
  assert.match(messages([field('2026start')])[0], /A key is one word/);
  assert.match(messages([field('a'), field('a')])[0], /Two fields have the key "a"/);
  for (const name of AUTO_VARIABLE_NAMES) {
    assert.match(messages([field(name)])[0], /is filled in by Crescendo/, name);
  }
  assert.match(messages([field('period', { type: 'select' })])[0], /needs at least one choice/);
  assert.deepEqual(messages([field('period', { type: 'select', options: ['Month'] })]), []);

  // What is stored is read back; anything else reads as no fields.
  assert.deepEqual(parseInputFields(FIELDS), FIELDS);
  assert.deepEqual(parseInputFields('not a list'), []);
  assert.deepEqual(parseInputFields([{ key: 'two words' }]), []);
});

// --- prompts ---

test('buildReportPrompt: inputs and Crescendo own variables are filled in, figure tokens are left', () => {
  const prompt = buildReportPrompt(
    snapshot(
      'For {{organizationName}}, by {{preparedBy}}, on {{today}} ({{year}}), in {{timeZone}} and {{currency}}. Campaign: {{campaign}}. Notes: {{notes}}. Write {{fig:revenue_2026}} and {{ fig:gifts }}.'
    ),
    { campaign: 'Year-end', notes: '' },
    AUTO
  );
  assert.equal(
    prompt,
    'For Example Organisation, by Sam Rivera, on 2026-11-27 (2026), in America/Toronto and CAD. Campaign: Year-end. Notes: . Write {{fig:revenue_2026}} and {{ fig:gifts }}.'
  );
});

test('buildReportPrompt: an input cannot stand in for a variable Crescendo fills in', () => {
  const prompt = buildReportPrompt(
    snapshot('{{today}} {{currency}} {{organizationName}} {{year}}'),
    { today: '1999-01-01', currency: 'XXX', organizationName: 'Someone else', year: '1999' },
    AUTO
  );
  assert.equal(prompt, '2026-11-27 CAD Example Organisation 2026');
});

test('promptVariables: every {{name}} once, and never a figure token', () => {
  assert.deepEqual(
    promptVariables('{{a}} and {{b}}, {{a}} again, {{fig:revenue}}, {{ spaced }}, {{two words}}'),
    ['a', 'b']
  );
});

// --- the seeded definitions ---

test('built-in definitions: the year-end giving review is first and can be started', () => {
  assert.equal(BUILTIN_REPORT_DEFINITIONS[0].key, 'year-end-giving-review');
  assert.equal(BUILTIN_REPORT_DEFINITIONS[0].enabled, true);
  const keys = BUILTIN_REPORT_DEFINITIONS.map((definition) => definition.key);
  assert.equal(new Set(keys).size, keys.length);
});

for (const definition of BUILTIN_REPORT_DEFINITIONS) {
  test(`built-in definition ${definition.key}: its tools exist and a definition may enable them`, () => {
    assert.ok(definition.enabledTools.length > 0);
    for (const key of definition.enabledTools) {
      assert.ok(key in allTools, `"${key}" is not in the tool registry`);
      assert.ok(
        REPORT_TOOL_CHOICES.some((tool) => tool.key === key),
        `"${key}" is not a tool a definition may enable`
      );
    }
  });

  test(`built-in definition ${definition.key}: its input fields are valid, with single-word keys`, () => {
    const parsed = inputFieldsSchema.safeParse(definition.inputs);
    assert.ok(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues));
    for (const field of definition.inputs) assert.match(field.key, /^\w+$/);
    // The whole definition is one the API would accept.
    assert.ok(definitionCreateSchema.safeParse(definition).success);
  });

  test(`built-in definition ${definition.key}: every {{variable}} is an input or filled in by Crescendo`, () => {
    const known = new Set<string>([
      ...AUTO_VARIABLE_NAMES,
      ...definition.inputs.map((field) => field.key),
    ]);
    for (const name of promptVariables(definition.prompt)) {
      assert.ok(known.has(name), `{{${name}}} in the prompt is not an input or an auto variable`);
    }
    // And every input is used: a field nobody reads is a question asked for nothing.
    for (const field of definition.inputs) {
      assert.ok(
        promptVariables(definition.prompt).includes(field.key),
        `the input "${field.key}" is not used in the prompt`
      );
    }
  });

  test(`built-in definition ${definition.key}: its defaults fill a form that passes`, () => {
    const fields = resolveInputDefaults(definition.inputs, '2026-11-27');
    // Give every required field without a default a value of its type.
    const values = Object.fromEntries(
      fields
        .filter((field) => field.required && !field.default)
        .map((field) => [
          field.key,
          field.type === 'date'
            ? '2026-12-01'
            : field.type === 'number'
              ? '1'
              : field.type === 'select'
                ? field.options![0]
                : 'x',
        ])
    );
    const result = validateRunInputs(fields, values);
    assert.ok(result.ok, JSON.stringify(result));
    const prompt = buildReportPrompt({ ...definition }, result.values, AUTO);
    assert.deepEqual(promptVariables(prompt), []);
  });
}

test('year-end giving review: the prompt keeps the analysis and leaves out what Crescendo does', () => {
  const { prompt, enabledTools, inputs } = BUILTIN_REPORT_DEFINITIONS[0];
  assert.deepEqual(enabledTools, ['ga4_report', 'ga4_funnel', 'en_fundraising']);
  assert.deepEqual(
    inputs.map((field) => field.key),
    [
      'campaignStart',
      'givingTuesday',
      'givingTuesdayLastYear',
      'donationForm',
      'donationFormLastYear',
      'trackingChanges',
    ]
  );
  assert.equal(inputs[0].default, '{{year}}-11-15');

  // Parts a to f of the analysis, and all three doubt checks.
  for (const part of ['a.', 'b.', 'c.', 'd.', 'e.', 'f.']) {
    assert.match(prompt, new RegExp(`^${part.replace('.', '\\.')} `, 'm'), part);
  }
  assert.doesNotMatch(prompt, /^g\. /m);
  assert.match(prompt, /more than 15%/);
  assert.match(prompt, /whole of last year's year-end/);
  assert.match(prompt, /anything that looks broken/);

  // The donation event comes from an event report, and a broken property stops the run.
  assert.match(prompt, /Report eventName with eventCount and purchaseRevenue/);
  assert.match(prompt, /Do not rely on a list of key events/);
  assert.equal(prompt.match(/needs_attention/g)?.length, 2);

  // Every block it names exists, in the order of the document.
  const blocks = BUILTIN_BLOCKS.map((block) => block.key);
  const named = [...prompt.matchAll(/\b[a-z]+_[a-z]+\b/g)]
    .map((match) => match[0])
    .filter((word) => blocks.includes(word));
  for (const key of [
    'report_header',
    'priority_cards',
    'stat_tiles',
    'bar_chart',
    'data_table',
    'line_chart',
    'funnel_steps',
    'definition_list',
  ]) {
    assert.ok(named.includes(key), `the prompt does not name the block ${key}`);
  }
  const order = [
    'Five things to look at before the next peak day',
    "Last year's year-end",
    'Giving Tuesday and 31 December, hour by hour',
    'This campaign against last year',
    'Search and AI assistants',
    'Donation forms',
    'Money without a source',
    'About these figures',
  ].map((heading) => prompt.indexOf(`section "${heading}"`));
  assert.ok(!order.includes(-1), `a section is missing: ${order}`);
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b)
  );

  // The personal-data count is Crescendo's figure, never typed.
  assert.match(prompt, /\{\{fig:emails_removed\}\}/);

  // Gone: the ledger file, the re-run step, the page rules, Google Ads, the Admin API.
  for (const gone of [
    /ledger file/i,
    /Markdown file/i,
    /inline CSS/i,
    /Chart\.js/i,
    /Google Ads/i,
    /run_conversions_report/,
    /list_key_events/,
    /list_property_annotations/,
    /get_property_details/,
    /analytics-mcp/,
    /ga4_query/,
    /pagePathFilter/,
  ]) {
    assert.doesNotMatch(prompt, gone);
  }
});

// --- keeping built-ins current ---

const seed = (over: Partial<ReportDefinitionSeed> = {}): ReportDefinitionSeed => ({
  key: 'smoke',
  name: 'Smoke',
  description: 'A test',
  prompt: 'The current prompt',
  inputs: [{ key: 'campaign', label: 'Campaign', type: 'text', required: true }],
  enabledTools: ['ga4_report'],
  maxSteps: 20,
  maxMinutes: 10,
  enabled: false,
  ...over,
});

const row = (from: ReportDefinitionSeed, over: Partial<StoredBuiltin> = {}): StoredBuiltin => ({
  id: `id-${from.key}`,
  key: from.key,
  sortOrder: 0,
  editedAt: null,
  name: from.name,
  description: from.description,
  prompt: from.prompt,
  inputs: from.inputs,
  enabledTools: from.enabledTools,
  maxSteps: from.maxSteps,
  maxMinutes: from.maxMinutes,
  ...over,
});

test('builtinDefinitionUpdates: a built-in nobody edited takes the code version', () => {
  const current = seed();
  const stale = row(current, { prompt: 'An older prompt', maxSteps: 10 });
  assert.deepEqual(builtinDefinitionUpdates([current], [stale]), [
    { id: 'id-smoke', data: { prompt: 'The current prompt', maxSteps: 20 } },
  ]);
});

test('builtinDefinitionUpdates: a built-in a person edited is not overwritten', () => {
  const current = seed();
  const edited = row(current, {
    prompt: 'Their own prompt',
    editedAt: new Date('2026-11-20T12:00:00Z'),
  });
  assert.deepEqual(builtinDefinitionUpdates([current], [edited]), []);
  // Its place in the list still follows the code.
  assert.deepEqual(builtinDefinitionUpdates([seed({ key: 'first' }), current], [edited]), [
    { id: 'id-smoke', data: { sortOrder: 1 } },
  ]);
});

test('builtinDefinitionUpdates: nothing is written when the row already matches', () => {
  const current = seed();
  assert.deepEqual(builtinDefinitionUpdates([current], [row(current)]), []);
  // The database gives JSON back with its keys in another order and no undefined.
  const reordered = row(current, {
    inputs: [{ type: 'text', required: true, label: 'Campaign', key: 'campaign' }],
  });
  const withUndefined = seed({
    inputs: [{ key: 'campaign', label: 'Campaign', type: 'text', required: true, help: undefined }],
  });
  assert.deepEqual(builtinDefinitionUpdates([withUndefined], [reordered]), []);
});

test('builtinDefinitionUpdates: whether a built-in is enabled is never changed', () => {
  const current = seed({ enabled: true });
  const updates = builtinDefinitionUpdates([current], [row(current, { prompt: 'Old' })]);
  assert.deepEqual(Object.keys(updates[0].data), ['prompt']);
  // A definition the code does not ship is left alone.
  assert.deepEqual(builtinDefinitionUpdates([current], [row(seed({ key: 'other' }))]), []);
});

// --- the definition API's shapes ---

test('definition schemas: a new definition takes the usual guards, a change touches only what it names', () => {
  const created = definitionCreateSchema.parse({
    name: '  Spring appeal  ',
    prompt: 'Review the spring appeal.',
    enabledTools: ['ga4_report'],
  });
  assert.deepEqual(created, {
    name: 'Spring appeal',
    description: '',
    prompt: 'Review the spring appeal.',
    inputs: [],
    enabledTools: ['ga4_report'],
    maxSteps: 500,
    maxMinutes: 120,
    enabled: true,
  });

  // Turning a report off must not reset the rest of it.
  assert.deepEqual(definitionUpdateSchema.parse({ enabled: false }), { enabled: false });

  const refused = (body: unknown) => !definitionCreateSchema.safeParse(body).success;
  assert.ok(refused({ ...created, enabledTools: [] }));
  assert.ok(refused({ ...created, enabledTools: ['page_performance'] }));
  assert.ok(refused({ ...created, enabledTools: ['ga4_query'] }));
  assert.ok(refused({ ...created, maxSteps: 0 }));
  assert.ok(refused({ ...created, prompt: '' }));
});

test('definitionKey: a name becomes a key', () => {
  assert.equal(definitionKey('Spring appeal: review!'), 'spring-appeal-review');
  assert.equal(definitionKey('  Été 2026 '), 'ete-2026');
  assert.equal(definitionKey('???'), 'report');
});

// --- the organisation, in file names and in the prompt ---

test('reportFileName: the organisation in Settings comes first, the title area second', () => {
  const run = {
    id: 'run1',
    definitionId: null,
    definitionSnapshot: snapshot(''),
    status: 'COMPLETED' as const,
    statusReason: null,
    title: 'Test',
    preparedBy: null,
    inputs: {},
    blocks: [
      {
        id: 'b1',
        block: 'report_header',
        version: 1,
        data: { organisation: 'Header Organisation' },
      },
    ],
    warnings: [],
    usage: null,
    stepCount: 0,
    redactedEmailCount: 0,
    cancelRequested: false,
    timeZone: 'America/Toronto',
    currencyCode: 'CAD',
    startedAt: null,
    completedAt: new Date('2026-12-02T15:00:00Z'),
    createdAt: new Date('2026-12-02T14:00:00Z'),
  };
  assert.equal(
    reportFileName(run, 'pdf', 'Example Organisation'),
    'example-organisation-test-2026-12-02.pdf'
  );
  // No name in Settings: the report's own title area names it.
  for (const unset of [undefined, null, '', '   ']) {
    assert.equal(reportFileName(run, 'pdf', unset), 'header-organisation-test-2026-12-02.pdf');
  }
  // Neither: the definition and the day.
  assert.equal(reportFileName({ ...run, blocks: [] }, 'csv', null), 'test-2026-12-02.csv');
});

test('runReport: the organisation name and the inputs reach the prompt', async () => {
  const store = memoryStore();
  const model = new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [
        {
          type: 'tool-call' as const,
          toolCallId: 'call-1',
          toolName: 'needs_attention',
          input: JSON.stringify({ reason: 'Stopping here.' }),
        },
      ],
      finishReason: { unified: 'tool-calls' as const, raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 5, text: 5, reasoning: 0 },
      },
      warnings: [],
    }),
  });
  const { runId } = await startReportRun(
    {
      definition: snapshot(
        'A review for {{organizationName}} of {{campaign}}, prepared by {{preparedBy}} in {{year}}.'
      ),
      inputs: { campaign: 'the spring appeal' },
      preparedBy: 'Sam Rivera',
    },
    { store }
  );
  await runReport(runId, {
    store,
    model,
    now: () => new Date('2026-11-26T17:00:00Z'),
    tools: {},
    property: async () => ({ timeZone: 'America/Toronto', currencyCode: 'CAD' }),
    organizationName: 'Example Organisation',
  });

  assert.equal((await store.getRun(runId))?.status, 'NEEDS_ATTENTION');
  const sent = JSON.stringify(model.doGenerateCalls[0].prompt);
  assert.match(
    sent,
    /A review for Example Organisation of the spring appeal, prepared by Sam Rivera in 2026\./
  );
  // The preamble tells the model about the one figure Crescendo keeps.
  assert.match(sent, /\{\{fig:emails_removed\}\}/);
});

// --- the figure Crescendo keeps itself ---

test('emails_removed: every run has the figure, and wording can use it', async () => {
  const run = { id: 'run1', redactedEmailCount: 1234, currencyCode: 'CAD' };
  const ledger = runLedger(run, [], []);
  assert.deepEqual(
    ledger.figures.map((figure) => [figure.key, figure.value, figure.display, figure.unit]),
    [[EMAILS_REMOVED, 1234, '1,234', 'count']]
  );
  assert.deepEqual(
    resolveBlockData({ text: 'Crescendo removed {{fig:emails_removed}} addresses.' }, ledger),
    { text: 'Crescendo removed 1,234 addresses.' }
  );
});

test('emails_removed: the model cannot record it, and a block may use it from the first step', async () => {
  const store = memoryStore();
  const { runId } = await startReportRun({ definition: snapshot('x'), inputs: {} }, { store });
  await store.updateRun(runId, { redactedEmailCount: 3 });
  const { tools } = createReportTools(store, runId, {}, { currencyCode: 'CAD' });
  const call = (name: string, input: unknown) =>
    tools[name].execute!(input, { toolCallId: 'call', messages: [] }) as Promise<{
      error?: string;
      id?: string;
    }>;

  const refused = await call('record_figure', {
    key: 'emails_removed',
    label: 'Mine',
    unit: 'count',
    source: { kind: 'stated', value: 99, reason: 'I counted.' },
  });
  assert.match(refused.error!, /Crescendo keeps "emails_removed" itself/);
  assert.deepEqual(await store.listFigures(runId), []);

  const added = await call('add_block', {
    block: 'definition_list',
    data: {
      items: [
        {
          term: 'Personal data.',
          text: 'Crescendo removed {{fig:emails_removed}} email addresses.',
        },
      ],
    },
  });
  assert.equal(added.id, 'b1');
});

// --- the list of runs, and deleting one ---

test('memoryStore: runs are listed newest first, and a deleted run takes its ledger with it', async () => {
  const store = memoryStore();
  const first = await store.createRun({
    definitionId: null,
    definitionSnapshot: snapshot('one'),
    title: 'First',
    preparedBy: null,
    inputs: {},
  });
  await store.updateRun(first.id, { status: 'COMPLETED' });
  const second = await store.createRun({
    definitionId: null,
    definitionSnapshot: snapshot('two'),
    title: 'Second',
    preparedBy: 'Sam Rivera',
    inputs: {},
  });
  await store.appendEvent(first.id, 'note', 'A note');
  await store.appendEvent(second.id, 'note', 'Another');

  assert.deepEqual(
    (await store.listRuns()).map((run) => run.title),
    ['Second', 'First']
  );

  await store.deleteRun(first.id);
  assert.deepEqual(
    (await store.listRuns()).map((run) => run.title),
    ['Second']
  );
  assert.equal(await store.getRun(first.id), null);
  assert.deepEqual(await store.listEvents(first.id), []);
  assert.equal((await store.listEvents(second.id)).length, 1);
  await assert.rejects(store.deleteRun(first.id), /No report run with id/);

  // A deleted run's id is not handed to the next run.
  const third = await store.createRun({
    definitionId: null,
    definitionSnapshot: snapshot('three'),
    title: 'Third',
    preparedBy: null,
    inputs: {},
  });
  assert.notEqual(third.id, second.id);
});
