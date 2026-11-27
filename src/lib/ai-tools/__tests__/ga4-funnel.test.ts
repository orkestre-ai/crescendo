import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFunnelRequest,
  ga4FunnelInputSchema,
  shapeFunnelResponse,
  type Ga4FunnelInput,
} from '../ga4-funnel';
import { RelativeDateError } from '../ga4-report';

const PROPERTY = 'properties/123456789';

const base: Ga4FunnelInput = {
  steps: [
    {
      name: 'Opened the form',
      eventName: 'page_view',
      params: [{ name: 'page_location', match: 'contains', value: '/donate/1' }],
    },
    { name: 'Donated', eventName: 'purchase' },
  ],
  dateRange: { startDate: '2026-11-01', endDate: '2026-11-25' },
};

// --- buildFunnelRequest ---

test('buildFunnelRequest: names the property and the date range', () => {
  const request = buildFunnelRequest(base, PROPERTY);
  assert.equal(request.property, PROPERTY);
  assert.deepEqual(request.dateRanges, [{ startDate: '2026-11-01', endDate: '2026-11-25' }]);
});

test('buildFunnelRequest: a step filters on an event parameter, not on pagePath', () => {
  const request = buildFunnelRequest(base, PROPERTY);
  assert.deepEqual(request.funnel?.steps?.[0], {
    name: 'Opened the form',
    filterExpression: {
      funnelEventFilter: {
        eventName: 'page_view',
        funnelParameterFilterExpression: {
          funnelParameterFilter: {
            eventParameterName: 'page_location',
            stringFilter: { matchType: 'CONTAINS', value: '/donate/1' },
          },
        },
      },
    },
  });
  assert.equal(JSON.stringify(request).includes('pagePath'), false);
});

test('buildFunnelRequest: a step with no params is the event alone', () => {
  const request = buildFunnelRequest(base, PROPERTY);
  assert.deepEqual(request.funnel?.steps?.[1], {
    name: 'Donated',
    filterExpression: { funnelEventFilter: { eventName: 'purchase' } },
  });
});

test('buildFunnelRequest: several params on one step must all match', () => {
  const request = buildFunnelRequest(
    {
      ...base,
      steps: [
        {
          name: 'Opened the form',
          eventName: 'page_view',
          params: [
            { name: 'page_location', match: 'beginsWith', value: 'https://example.org/page/' },
            { name: 'page_title', match: 'exact', value: 'Donate' },
          ],
        },
        { name: 'Donated', eventName: 'purchase' },
      ],
    },
    PROPERTY
  );
  assert.deepEqual(
    request.funnel?.steps?.[0].filterExpression?.funnelEventFilter?.funnelParameterFilterExpression,
    {
      andGroup: {
        expressions: [
          {
            funnelParameterFilter: {
              eventParameterName: 'page_location',
              stringFilter: { matchType: 'BEGINS_WITH', value: 'https://example.org/page/' },
            },
          },
          {
            funnelParameterFilter: {
              eventParameterName: 'page_title',
              stringFilter: { matchType: 'EXACT', value: 'Donate' },
            },
          },
        ],
      },
    }
  );
});

test('buildFunnelRequest: closed by default, open when asked', () => {
  assert.equal(buildFunnelRequest(base, PROPERTY).funnel?.isOpenFunnel, false);
  assert.equal(
    buildFunnelRequest({ ...base, openFunnel: true }, PROPERTY).funnel?.isOpenFunnel,
    true
  );
});

test('buildFunnelRequest: a breakdown dimension is added only when given', () => {
  assert.equal('funnelBreakdown' in buildFunnelRequest(base, PROPERTY), false);
  assert.deepEqual(
    buildFunnelRequest({ ...base, breakdownDimension: 'deviceCategory' }, PROPERTY).funnelBreakdown,
    { breakdownDimension: { name: 'deviceCategory' } }
  );
});

test('buildFunnelRequest: rejects relative dates', () => {
  assert.throws(
    () =>
      buildFunnelRequest(
        { ...base, dateRange: { startDate: '28daysAgo', endDate: 'yesterday' } },
        PROPERTY
      ),
    (err: unknown) => err instanceof RelativeDateError && err.message.includes('"28daysAgo"')
  );
  assert.throws(
    () =>
      buildFunnelRequest(
        { ...base, dateRange: { startDate: '2026-11-01', endDate: 'yesterday' } },
        PROPERTY
      ),
    RelativeDateError
  );
});

test('ga4FunnelInputSchema: a funnel needs at least two steps', () => {
  assert.equal(ga4FunnelInputSchema.safeParse(base).success, true);
  assert.equal(ga4FunnelInputSchema.safeParse({ ...base, steps: [base.steps[0]] }).success, false);
});

// --- shapeFunnelResponse ---

const response = {
  funnelTable: {
    dimensionHeaders: [{ name: 'funnelStepName' }, { name: 'deviceCategory' }],
    metricHeaders: [
      { name: 'activeUsers' },
      { name: 'funnelStepCompletionRate' },
      { name: 'funnelStepAbandonments' },
      { name: 'funnelStepAbandonmentRate' },
    ],
    rows: [
      {
        dimensionValues: [{ value: '1. Opened the form' }, { value: 'mobile' }],
        metricValues: [{ value: '1200' }, { value: '0.05' }, { value: '1140' }, { value: '0.95' }],
      },
      {
        dimensionValues: [{ value: '2. Donated' }, { value: 'mobile' }],
        metricValues: [{ value: '60' }, { value: '1' }, { value: '0' }, { value: '0' }],
      },
    ],
  },
  // The visualization sub-report repeats the data in another layout; it is not read.
  funnelVisualization: {
    dimensionHeaders: [{ name: 'funnelStepName' }],
    metricHeaders: [{ name: 'activeUsers' }],
    rows: [{ dimensionValues: [{ value: 'ignored' }], metricValues: [{ value: '999' }] }],
  },
};

test('shapeFunnelResponse: flattens funnelTable into headers and rows', () => {
  const result = shapeFunnelResponse(response);
  assert.deepEqual(result.headers, [
    'funnelStepName',
    'deviceCategory',
    'activeUsers',
    'funnelStepCompletionRate',
    'funnelStepAbandonments',
    'funnelStepAbandonmentRate',
  ]);
  assert.deepEqual(result.rows, [
    {
      funnelStepName: '1. Opened the form',
      deviceCategory: 'mobile',
      activeUsers: '1200',
      funnelStepCompletionRate: '0.05',
      funnelStepAbandonments: '1140',
      funnelStepAbandonmentRate: '0.95',
    },
    {
      funnelStepName: '2. Donated',
      deviceCategory: 'mobile',
      activeUsers: '60',
      funnelStepCompletionRate: '1',
      funnelStepAbandonments: '0',
      funnelStepAbandonmentRate: '0',
    },
  ]);
  assert.equal(result.sampled, false);
  assert.equal(result.samplingNote, null);
  assert.equal(result.redactedEmails, 0);
});

test('shapeFunnelResponse: metric headers GA4 lists twice appear once', () => {
  // Seen on the live property on 2026-11-26: with a breakdown, metricHeaders
  // holds eight entries while each row holds four values.
  const result = shapeFunnelResponse({
    funnelTable: {
      ...response.funnelTable,
      metricHeaders: [...response.funnelTable.metricHeaders, ...response.funnelTable.metricHeaders],
    },
  });
  assert.deepEqual(result.headers, [
    'funnelStepName',
    'deviceCategory',
    'activeUsers',
    'funnelStepCompletionRate',
    'funnelStepAbandonments',
    'funnelStepAbandonmentRate',
  ]);
  assert.equal(result.rows[0].activeUsers, '1200');
  assert.equal(result.rows[0].funnelStepAbandonmentRate, '0.95');
});

test('shapeFunnelResponse: a sampled funnel states the share of events read', () => {
  const result = shapeFunnelResponse({
    funnelTable: {
      ...response.funnelTable,
      metadata: {
        samplingMetadatas: [{ samplesReadCount: '500000', samplingSpaceSize: '2000000' }],
      },
    },
  });
  assert.equal(result.sampled, true);
  assert.equal(
    result.samplingNote,
    'Sampled: GA4 estimated these figures from 25.0% of events (500000 of 2000000).'
  );
});

test('shapeFunnelResponse: email addresses in a breakdown value are removed and counted', () => {
  const result = shapeFunnelResponse({
    funnelTable: {
      dimensionHeaders: [{ name: 'funnelStepName' }, { name: 'pageLocation' }],
      metricHeaders: [{ name: 'activeUsers' }],
      rows: [
        {
          dimensionValues: [
            { value: '1. Opened the form' },
            { value: 'https://example.org/donate?e=jane%40example.org' },
          ],
          metricValues: [{ value: '3' }],
        },
      ],
    },
  });
  assert.equal(result.rows[0].pageLocation, 'https://example.org/donate?e=[email removed]');
  assert.equal(result.redactedEmails, 1);
});

test('shapeFunnelResponse: a response with no table is an empty result', () => {
  const result = shapeFunnelResponse({});
  assert.deepEqual(result.headers, []);
  assert.deepEqual(result.rows, []);
  assert.equal(result.sampled, false);
});
