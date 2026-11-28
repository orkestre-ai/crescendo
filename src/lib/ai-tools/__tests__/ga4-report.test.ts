import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReportRequest,
  ga4FilterSchema,
  ga4ReportInputSchema,
  RelativeDateError,
  shapeReportResponse,
  type Ga4ReportInput,
} from '../ga4-report';
import { redactEmails } from '../redact';

const PROPERTY = 'properties/123456789';

const base: Ga4ReportInput = {
  dimensions: ['pagePath', 'deviceCategory'],
  metrics: ['sessions', 'purchaseRevenue'],
  dateRanges: [{ startDate: '2026-11-01', endDate: '2026-11-25' }],
};

// --- buildReportRequest ---

test('buildReportRequest: names the property, dimensions, metrics and dates', () => {
  const request = buildReportRequest(base, PROPERTY);
  assert.equal(request.property, PROPERTY);
  assert.deepEqual(request.dimensions, [{ name: 'pagePath' }, { name: 'deviceCategory' }]);
  assert.deepEqual(request.metrics, [{ name: 'sessions' }, { name: 'purchaseRevenue' }]);
  assert.deepEqual(request.dateRanges, [{ startDate: '2026-11-01', endDate: '2026-11-25' }]);
});

test('buildReportRequest: leaves filters, sorting and offset out when not asked for', () => {
  const request = buildReportRequest(base, PROPERTY);
  assert.equal('dimensionFilter' in request, false);
  assert.equal('metricFilter' in request, false);
  assert.equal('orderBys' in request, false);
  assert.equal('offset' in request, false);
});

test('buildReportRequest: limit defaults to 100', () => {
  assert.equal(buildReportRequest(base, PROPERTY).limit, 100);
});

test('buildReportRequest: limit is clamped to 1000 at most and 1 at least', () => {
  assert.equal(buildReportRequest({ ...base, limit: 250 }, PROPERTY).limit, 250);
  assert.equal(buildReportRequest({ ...base, limit: 5000 }, PROPERTY).limit, 1000);
  assert.equal(buildReportRequest({ ...base, limit: 0 }, PROPERTY).limit, 1);
  assert.equal(buildReportRequest({ ...base, limit: -3 }, PROPERTY).limit, 1);
});

test('buildReportRequest: passes offset through', () => {
  assert.equal(buildReportRequest({ ...base, offset: 200 }, PROPERTY).offset, 200);
});

test('buildReportRequest: two date ranges keep their names', () => {
  const request = buildReportRequest(
    {
      ...base,
      dateRanges: [
        { startDate: '2026-11-01', endDate: '2026-11-25', name: 'this_year' },
        { startDate: '2025-11-01', endDate: '2025-11-25', name: 'last_year' },
      ],
    },
    PROPERTY
  );
  assert.deepEqual(request.dateRanges, [
    { startDate: '2026-11-01', endDate: '2026-11-25', name: 'this_year' },
    { startDate: '2025-11-01', endDate: '2025-11-25', name: 'last_year' },
  ]);
});

test('buildReportRequest: rejects zero and three date ranges', () => {
  const range = { startDate: '2026-11-01', endDate: '2026-11-25' };
  assert.throws(() => buildReportRequest({ ...base, dateRanges: [] }, PROPERTY), /one or two/);
  assert.throws(
    () => buildReportRequest({ ...base, dateRanges: [range, range, range] }, PROPERTY),
    /one or two/
  );
});

test('buildReportRequest: rejects relative dates, naming the value', () => {
  for (const relative of ['yesterday', 'today', '30daysAgo', '2026-11-1', '']) {
    assert.throws(
      () =>
        buildReportRequest(
          { ...base, dateRanges: [{ startDate: '2026-11-01', endDate: relative }] },
          PROPERTY
        ),
      (err: unknown) =>
        err instanceof RelativeDateError &&
        err.message.includes(`endDate "${relative}"`) &&
        err.message.includes('YYYY-MM-DD')
    );
  }
  assert.throws(
    () =>
      buildReportRequest(
        { ...base, dateRanges: [{ startDate: '7daysAgo', endDate: '2026-11-25' }] },
        PROPERTY
      ),
    RelativeDateError
  );
});

test('buildReportRequest: a text filter becomes a stringFilter', () => {
  const request = buildReportRequest(
    { ...base, dimensionFilter: { field: 'pagePath', match: 'contains', value: '/donate' } },
    PROPERTY
  );
  assert.deepEqual(request.dimensionFilter, {
    filter: {
      fieldName: 'pagePath',
      stringFilter: { matchType: 'CONTAINS', value: '/donate', caseSensitive: false },
    },
  });
});

test('buildReportRequest: every match type maps to its GA4 name', () => {
  const expected = {
    exact: 'EXACT',
    contains: 'CONTAINS',
    beginsWith: 'BEGINS_WITH',
    endsWith: 'ENDS_WITH',
    regex: 'PARTIAL_REGEXP',
  } as const;
  for (const [match, matchType] of Object.entries(expected)) {
    const request = buildReportRequest(
      {
        ...base,
        dimensionFilter: {
          field: 'pagePath',
          match: match as keyof typeof expected,
          value: 'x',
          caseSensitive: true,
        },
      },
      PROPERTY
    );
    assert.deepEqual(request.dimensionFilter?.filter?.stringFilter, {
      matchType,
      value: 'x',
      caseSensitive: true,
    });
  }
});

test('buildReportRequest: inList becomes an inListFilter', () => {
  const request = buildReportRequest(
    {
      ...base,
      dimensionFilter: { field: 'deviceCategory', match: 'inList', values: ['mobile', 'tablet'] },
    },
    PROPERTY
  );
  assert.deepEqual(request.dimensionFilter, {
    filter: {
      fieldName: 'deviceCategory',
      inListFilter: { values: ['mobile', 'tablet'], caseSensitive: false },
    },
  });
});

test('buildReportRequest: a text filter without its value is refused', () => {
  assert.throws(
    () =>
      buildReportRequest(
        { ...base, dimensionFilter: { field: 'pagePath', match: 'contains' } },
        PROPERTY
      ),
    /needs "value"/
  );
  assert.throws(
    () =>
      buildReportRequest(
        { ...base, dimensionFilter: { field: 'pagePath', match: 'inList', values: [] } },
        PROPERTY
      ),
    /needs "values"/
  );
});

test('buildReportRequest: a number filter uses int64 for whole numbers and double otherwise', () => {
  const whole = buildReportRequest(
    { ...base, metricFilter: { field: 'sessions', op: '>=', number: 100 } },
    PROPERTY
  );
  assert.deepEqual(whole.metricFilter, {
    filter: {
      fieldName: 'sessions',
      numericFilter: { operation: 'GREATER_THAN_OR_EQUAL', value: { int64Value: '100' } },
    },
  });

  const fraction = buildReportRequest(
    { ...base, metricFilter: { field: 'purchaseRevenue', op: '<', number: 49.5 } },
    PROPERTY
  );
  assert.deepEqual(fraction.metricFilter, {
    filter: {
      fieldName: 'purchaseRevenue',
      numericFilter: { operation: 'LESS_THAN', value: { doubleValue: 49.5 } },
    },
  });
});

test('buildReportRequest: every operator maps to its GA4 name', () => {
  const expected = {
    '<': 'LESS_THAN',
    '<=': 'LESS_THAN_OR_EQUAL',
    '=': 'EQUAL',
    '>=': 'GREATER_THAN_OR_EQUAL',
    '>': 'GREATER_THAN',
  } as const;
  for (const [op, operation] of Object.entries(expected)) {
    const request = buildReportRequest(
      { ...base, metricFilter: { field: 'sessions', op: op as keyof typeof expected, number: 1 } },
      PROPERTY
    );
    assert.equal(request.metricFilter?.filter?.numericFilter?.operation, operation);
  }
});

test('buildReportRequest: nested and / or / not groups', () => {
  const request = buildReportRequest(
    {
      ...base,
      dimensionFilter: {
        and: [
          { field: 'pagePath', match: 'beginsWith', value: '/page/' },
          {
            or: [
              { field: 'deviceCategory', match: 'exact', value: 'mobile' },
              { not: { field: 'country', match: 'inList', values: ['Canada', 'United States'] } },
            ],
          },
        ],
      },
    },
    PROPERTY
  );
  assert.deepEqual(request.dimensionFilter, {
    andGroup: {
      expressions: [
        {
          filter: {
            fieldName: 'pagePath',
            stringFilter: { matchType: 'BEGINS_WITH', value: '/page/', caseSensitive: false },
          },
        },
        {
          orGroup: {
            expressions: [
              {
                filter: {
                  fieldName: 'deviceCategory',
                  stringFilter: { matchType: 'EXACT', value: 'mobile', caseSensitive: false },
                },
              },
              {
                notExpression: {
                  filter: {
                    fieldName: 'country',
                    inListFilter: { values: ['Canada', 'United States'], caseSensitive: false },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  });
});

test('buildReportRequest: a group with no key, or two keys, is refused', () => {
  assert.throws(
    () => buildReportRequest({ ...base, dimensionFilter: {} }, PROPERTY),
    /exactly one of "and", "or" or "not"/
  );
  assert.throws(
    () => buildReportRequest({ ...base, dimensionFilter: { and: [], or: [] } }, PROPERTY),
    /exactly one of "and", "or" or "not"/
  );
});

test('buildReportRequest: orderBys sorts on a metric or a dimension', () => {
  const request = buildReportRequest(
    {
      ...base,
      orderBys: [{ field: 'purchaseRevenue', desc: true }, { field: 'pagePath' }],
    },
    PROPERTY
  );
  assert.deepEqual(request.orderBys, [
    { metric: { metricName: 'purchaseRevenue' }, desc: true },
    { dimension: { dimensionName: 'pagePath' }, desc: false },
  ]);
});

test('buildReportRequest: sorting on a field that was not requested is refused', () => {
  assert.throws(
    () => buildReportRequest({ ...base, orderBys: [{ field: 'totalUsers' }] }, PROPERTY),
    /Cannot sort by "totalUsers"/
  );
});

// --- input schema ---

test('ga4FilterSchema: a field filter keeps its keys and is not read as an empty group', () => {
  const filter = { field: 'pagePath', match: 'contains', value: '/donate' };
  assert.deepEqual(ga4FilterSchema.parse(filter), filter);
  const nested = { and: [filter, { not: { field: 'sessions', op: '>', number: 5 } }] };
  assert.deepEqual(ga4FilterSchema.parse(nested), nested);
});

test('ga4FilterSchema: a misspelt key is refused, not dropped', () => {
  assert.equal(
    ga4FilterSchema.safeParse({ field: 'x', mtach: 'contains', value: 'y' }).success,
    false
  );
  assert.equal(ga4FilterSchema.safeParse({ and: [], extra: true }).success, false);
});

test('ga4ReportInputSchema: one or two date ranges only', () => {
  const range = { startDate: '2026-11-01', endDate: '2026-11-25' };
  const input = { dimensions: ['date'], metrics: ['sessions'] };
  assert.equal(ga4ReportInputSchema.safeParse({ ...input, dateRanges: [] }).success, false);
  assert.equal(ga4ReportInputSchema.safeParse({ ...input, dateRanges: [range] }).success, true);
  assert.equal(
    ga4ReportInputSchema.safeParse({ ...input, dateRanges: [range, range, range] }).success,
    false
  );
});

// --- shapeReportResponse ---

const response = {
  dimensionHeaders: [{ name: 'pagePath' }, { name: 'deviceCategory' }],
  metricHeaders: [
    { name: 'sessions', type: 'TYPE_INTEGER' as const },
    { name: 'purchaseRevenue', type: 'TYPE_CURRENCY' as const },
  ],
  rows: [
    {
      dimensionValues: [{ value: '/page/1/donate/1' }, { value: 'mobile' }],
      metricValues: [{ value: '120' }, { value: '4310.5' }],
    },
    {
      dimensionValues: [{ value: '/page/2/donate/1' }, { value: 'desktop' }],
      metricValues: [{ value: '80' }, { value: '2100' }],
    },
  ],
  rowCount: 2,
  metadata: { timeZone: 'America/Toronto', currencyCode: 'CAD' },
};

test('shapeReportResponse: headers and rows keyed by header', () => {
  const result = shapeReportResponse(response);
  assert.deepEqual(result.headers, ['pagePath', 'deviceCategory', 'sessions', 'purchaseRevenue']);
  assert.deepEqual(result.rows, [
    {
      pagePath: '/page/1/donate/1',
      deviceCategory: 'mobile',
      sessions: '120',
      purchaseRevenue: '4310.5',
    },
    {
      pagePath: '/page/2/donate/1',
      deviceCategory: 'desktop',
      sessions: '80',
      purchaseRevenue: '2100',
    },
  ]);
});

test('shapeReportResponse: a whole, unsampled result carries every field with its plain value', () => {
  const result = shapeReportResponse(response);
  assert.equal(result.totalRows, 2);
  assert.equal(result.truncated, false);
  assert.equal(result.sampled, false);
  assert.equal(result.samplingNote, null);
  assert.equal(result.thresholded, false);
  assert.equal(result.otherRow, false);
  assert.equal(result.timeZone, 'America/Toronto');
  assert.equal(result.currencyCode, 'CAD');
  assert.equal(result.redactedEmails, 0);
});

test('shapeReportResponse: truncated when more rows exist than were returned', () => {
  const result = shapeReportResponse({ ...response, rowCount: 3187 });
  assert.equal(result.totalRows, 3187);
  assert.equal(result.rows.length, 2);
  assert.equal(result.truncated, true);
});

// With two date ranges GA4's rowCount and limit count row groups: every
// group comes back once per range. Seen on the live property on 2026-11-26.
const twoRanges = {
  dimensionHeaders: [{ name: 'pagePath' }, { name: 'dateRange' }],
  metricHeaders: [{ name: 'sessions' }],
  rows: [
    { dimensionValues: [{ value: '/a' }, { value: 'current' }], metricValues: [{ value: '9' }] },
    { dimensionValues: [{ value: '/a' }, { value: 'previous' }], metricValues: [{ value: '7' }] },
    { dimensionValues: [{ value: '/b' }, { value: 'current' }], metricValues: [{ value: '5' }] },
    { dimensionValues: [{ value: '/b' }, { value: 'previous' }], metricValues: [{ value: '4' }] },
  ],
};

test('shapeReportResponse: two date ranges are whole when every row group came back', () => {
  const result = shapeReportResponse({ ...twoRanges, rowCount: 2 });
  assert.equal(result.rows.length, 4);
  assert.equal(result.totalRows, 2);
  assert.equal(result.truncated, false);
});

test('shapeReportResponse: two date ranges are truncated when row groups are missing', () => {
  // Four rows came back and rowCount is three: counting rows would call this whole.
  const result = shapeReportResponse({ ...twoRanges, rowCount: 3 });
  assert.equal(result.rows.length, 4);
  assert.equal(result.truncated, true);
});

test('shapeReportResponse: a sampled result states the share of events read', () => {
  const result = shapeReportResponse({
    ...response,
    metadata: {
      ...response.metadata,
      samplingMetadatas: [{ samplesReadCount: '2500000', samplingSpaceSize: '10000000' }],
    },
  });
  assert.equal(result.sampled, true);
  assert.equal(
    result.samplingNote,
    'Sampled: GA4 estimated these figures from 25.0% of events (2500000 of 10000000).'
  );
});

test('shapeReportResponse: two sampled date ranges are both named', () => {
  const result = shapeReportResponse({
    ...response,
    metadata: {
      samplingMetadatas: [
        { samplesReadCount: 1, samplingSpaceSize: 3 },
        { samplesReadCount: '9', samplingSpaceSize: '10' },
      ],
    },
  });
  assert.equal(
    result.samplingNote,
    'Sampled: GA4 estimated these figures from 33.3% of events (1 of 3) and 90.0% of events (9 of 10).'
  );
});

test('shapeReportResponse: thresholding and the (other) row are flagged', () => {
  const result = shapeReportResponse({
    ...response,
    metadata: { subjectToThresholding: true, dataLossFromOtherRow: true },
  });
  assert.equal(result.thresholded, true);
  assert.equal(result.otherRow, true);
});

test('shapeReportResponse: an empty response is an empty result, not an error', () => {
  const result = shapeReportResponse({});
  assert.deepEqual(result.headers, []);
  assert.deepEqual(result.rows, []);
  assert.equal(result.totalRows, 0);
  assert.equal(result.truncated, false);
  assert.equal(result.timeZone, '');
  assert.equal(result.currencyCode, '');
});

test('shapeReportResponse: email addresses are removed from rows and counted', () => {
  const result = shapeReportResponse({
    ...response,
    rows: [
      {
        dimensionValues: [
          { value: '/thanks?email=jane.doe%40example.org&amount=50' },
          { value: 'mobile' },
        ],
        metricValues: [{ value: '1' }, { value: '50' }],
      },
      {
        dimensionValues: [{ value: '/thanks?email=sam@example.co.uk' }, { value: 'desktop' }],
        metricValues: [{ value: '1' }, { value: '25' }],
      },
    ],
  });
  assert.equal(result.rows[0].pagePath, '/thanks?email=[email removed]&amount=50');
  assert.equal(result.rows[1].pagePath, '/thanks?email=[email removed]');
  assert.equal(result.redactedEmails, 2);
  assert.equal(JSON.stringify(result).includes('example'), false);
});

// --- redactEmails ---

test('redactEmails: plain and percent-encoded addresses', () => {
  const { rows, count } = redactEmails([
    { a: 'write to jane.doe+tag@example.org today', b: 'no address here' },
    { a: 'jane.doe%40example.org', b: 'JANE%2540EXAMPLE.ORG' },
  ]);
  assert.deepEqual(rows, [
    { a: 'write to [email removed] today', b: 'no address here' },
    { a: '[email removed]', b: '[email removed]' },
  ]);
  assert.equal(count, 3);
});

test('redactEmails: an encoded local part goes with the address', () => {
  const { rows, count } = redactEmails([{ a: '/x?e=jane%2Bgiving%40example.org&y=1' }]);
  assert.deepEqual(rows, [{ a: '/x?e=[email removed]&y=1' }]);
  assert.equal(count, 1);
});

test('redactEmails: several addresses in one value are each counted', () => {
  const { rows, count } = redactEmails([{ a: 'a@example.org,b@example.org' }]);
  assert.deepEqual(rows, [{ a: '[email removed],[email removed]' }]);
  assert.equal(count, 2);
});

test('redactEmails: values that are not addresses are left alone', () => {
  const input = [
    { a: '/page/123/donate/1', b: '42', c: 'utm_source=newsletter@', d: '@handle', e: '50%40' },
  ];
  const { rows, count } = redactEmails(input);
  assert.deepEqual(rows, input);
  assert.equal(count, 0);
});

test('redactEmails: reaches nested values and does not change its input', () => {
  const input = [{ list: ['a@example.org', 7, null], nested: { deep: 'b@example.org' } }];
  const { rows, count } = redactEmails(input);
  assert.deepEqual(rows, [
    { list: ['[email removed]', 7, null], nested: { deep: '[email removed]' } },
  ]);
  assert.equal(count, 2);
  assert.equal(input[0].list[0], 'a@example.org');
  assert.equal(input[0].nested.deep, 'b@example.org');
});
