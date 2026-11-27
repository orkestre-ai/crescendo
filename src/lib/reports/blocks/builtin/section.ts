import type { BlockSeed } from '../types';

export const section: BlockSeed = {
  key: 'section',
  name: 'Section heading',
  description:
    'Starts a new part of the report: a heading over a ruled line, with an optional sentence saying what the part covers (the dates compared, for example).',
  dataSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['heading'],
    properties: {
      heading: { type: 'string', description: 'The heading', 'x-editable': true },
      lede: {
        type: 'string',
        description: 'One sentence under the heading. May use {{fig:key}}',
        'x-editable': true,
      },
    },
  },
  template: `<h2>{{ data.heading }}</h2>
{%- if data.lede %}
<p class="lede">{{ data.lede }}</p>
{%- endif %}`,
  css: `.blk-section {
  margin-top: var(--sp-8);
  padding-top: var(--sp-6);
  border-top: 1px solid var(--line);
  break-after: avoid;
}
.blk-section h2 { margin: 0; }
.blk-section .lede { color: var(--text-2); margin: var(--sp-2) 0 0; }`,
  sampleData: {
    heading: 'This campaign against last year, with the weekdays lined up to match',
    lede: '1 to 23 November 2026 against 2 to 24 November 2025, so each day is compared with the same day of the week.',
  },
};
