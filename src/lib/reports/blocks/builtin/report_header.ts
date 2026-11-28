import type { BlockSeed } from '../types';

export const reportHeader: BlockSeed = {
  key: 'report_header',
  name: 'Report header',
  description:
    'The title area that opens a report: the organisation and report name, the title, a one-sentence summary, and the date, author, time zone and currency. Use it once, first.',
  dataSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['organisation', 'reportName', 'title', 'date', 'timeZone', 'currency'],
    properties: {
      organisation: { type: 'string', description: 'The organisation the report is for' },
      reportName: { type: 'string', description: 'The kind of report, e.g. "Year-end review"' },
      title: {
        type: 'string',
        description: 'The headline: what the report found, in one line',
        'x-editable': true,
      },
      dek: {
        type: 'string',
        description: 'One or two sentences on what the report covers',
        'x-editable': true,
      },
      date: { type: 'string', description: 'The day the report was prepared, written out' },
      preparedBy: { type: 'string', description: 'Who prepared it' },
      timeZone: { type: 'string', description: 'The time zone the times are in' },
      currency: { type: 'string', description: 'The currency the amounts are in' },
    },
  },
  template: `<header>
  <p class="eyebrow">{{ data.organisation }} · {{ data.reportName }}</p>
  <h1>{{ data.title }}</h1>
  {%- if data.dek %}
  <p class="dek">{{ data.dek }}</p>
  {%- endif %}
  <dl class="facts">
    <div><dt>Prepared</dt><dd>{{ data.date }}</dd></div>
    {%- if data.preparedBy %}
    <div><dt>Prepared by</dt><dd>{{ data.preparedBy }}</dd></div>
    {%- endif %}
    <div><dt>Times</dt><dd>{{ data.timeZone }}</dd></div>
    <div><dt>Amounts</dt><dd>{{ data.currency }}</dd></div>
  </dl>
</header>`,
  css: `.blk-report_header .eyebrow {
  font-size: var(--fs-sm);
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 var(--sp-2);
}
.blk-report_header h1 { margin: 0 0 var(--sp-3); }
.blk-report_header .dek { font-size: var(--fs-lg); line-height: 1.5; color: var(--text-2); max-width: var(--measure); margin: 0; }
.blk-report_header .facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--sp-3) var(--sp-6);
  margin: var(--sp-6) 0 0;
  padding: var(--sp-4) 0 0;
  border-top: 1px solid var(--line);
}
.blk-report_header .facts div { min-width: 0; }
.blk-report_header dt {
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--muted);
}
.blk-report_header dd { margin: 2px 0 0; font-size: var(--fs-md); color: var(--text-2); overflow-wrap: anywhere; }
@media (max-width: 600px) {
  .blk-report_header .facts { grid-template-columns: 1fr 1fr; }
}`,
  sampleData: {
    organisation: 'Example Organisation',
    reportName: 'Year-end giving review',
    title: 'Online giving is ahead of last year, and phones are where it is being lost',
    dek: 'What the website analytics show about the last year-end campaign, how this one compares so far, and five things worth checking before the busiest days.',
    date: '24 November 2026',
    preparedBy: 'Sam Rivera',
    timeZone: 'America/Toronto',
    currency: 'Canadian dollars (CAD)',
  },
};
