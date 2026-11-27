import type { BlockSeed } from '../types';
import { sampleTable } from './sample';

export const dataTable: BlockSeed = {
  key: 'data_table',
  name: 'Table',
  description:
    'A table from a ledger dataset. You choose the columns, their order and their headings. Mark a column of changes (fractions such as 0.17) with kind "change" to show it as +17% in green or −17% in red. A dataset defined with totalRow shows its total as a shaded last row. A long table runs over several printed pages and repeats its header.',
  dataSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['rows', 'columns'],
    properties: {
      title: { type: 'string', description: 'A heading over the table', 'x-editable': true },
      rows: { 'x-ref': 'dataset', description: 'The dataset to show' },
      columns: {
        type: 'array',
        minItems: 1,
        maxItems: 10,
        description: 'The columns to show, left to right',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['column', 'label'],
          properties: {
            column: { type: 'string', description: 'A column key of the dataset' },
            label: { type: 'string', description: 'The column heading', 'x-editable': true },
            kind: {
              type: 'string',
              enum: ['value', 'change', 'date', 'hour'],
              description:
                '"change" for a fraction shown as a signed, coloured percent; "date" or "hour" for a GA4 date or hour column. Default "value"',
            },
          },
        },
      },
      caption: {
        type: 'string',
        description: 'A note under the table: what is counted, or a caution',
        'x-editable': true,
      },
    },
  },
  template: `{%- assign t = data.rows | table: data.columns -%}
{%- if data.title %}<h3>{{ data.title }}</h3>{% endif %}
<div class="table-wrap"><table{% if data.caption %} aria-describedby="{{ block.id }}-note"{% endif %}>
  <thead><tr>
    {%- for head in t.head %}<th scope="col"{% if head.cls != '' %} class="{{ head.cls }}"{% endif %}>{{ head.label }}</th>{% endfor -%}
  </tr></thead>
  <tbody>
  {%- for row in t.rows %}
    <tr{% if row.total %} class="total"{% endif %}>
      {%- for cell in row.cells %}<td{% if cell.cls != '' %} class="{{ cell.cls }}"{% endif %}>{{ cell.text }}</td>{% endfor -%}
    </tr>
  {%- endfor %}
  </tbody>
</table></div>
{%- if data.caption %}
<p class="note" id="{{ block.id }}-note">{{ data.caption }}</p>
{%- endif %}`,
  // The note is outside the part that scrolls sideways, so it is never cut
  // off on a phone; the two are drawn as one card.
  css: `.blk-data_table h3 { margin: 0 0 var(--sp-3); }
.blk-data_table .table-wrap:has(+ .note) { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.blk-data_table .note {
  margin: 0;
  max-width: none;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--line);
  border-top: 0;
  border-radius: 0 0 var(--radius) var(--radius);
  background: var(--card);
  font-size: var(--fs-sm);
  color: var(--muted);
}`,
  sampleData: {
    title: 'Where the money came from',
    rows: sampleTable(
      'Revenue and gifts by channel, 15 Nov to 31 Dec, 2025 against 2024',
      [
        ['channel', 'text'],
        ['revenue', 'currency'],
        ['gifts', 'count'],
        ['revenue_before', 'currency'],
        ['change', 'percent'],
      ],
      [
        ['Paid Search', 121_480, 842, 138_260, -0.1214],
        ['Direct', 96_310, 731, 104_920, -0.0821],
        ['Organic Search', 88_240, 512, 74_180, 0.1895],
        ['Email', 41_620, 388, 22_940, 0.8143],
        ['Referral', 24_870, 176, 12_310, 1.0203],
        ['Paid Social', 14_260, 121, 15_480, -0.0788],
        ['Organic Social', 9_840, 74, 11_260, -0.1261],
        ['Display', 6_120, 38, 3_940, 0.5533],
        ['AI Assistant', 4_380, 29, null, null],
        ['Affiliates', 2_910, 17, 2_480, 0.1734],
        ['Organic Video', 1_640, 11, 1_210, 0.3554],
        ['Unassigned', 1_190, 7, 1_160, 0.0259],
        ['Total', 412_860, 2_946, 388_140, 0.0637],
      ],
      true
    ),
    columns: [
      { column: 'channel', label: 'Channel' },
      { column: 'revenue', label: 'Revenue 2025' },
      { column: 'gifts', label: 'Gifts 2025' },
      { column: 'revenue_before', label: 'Revenue 2024' },
      { column: 'change', label: 'Change', kind: 'change' },
    ],
    caption:
      'Channels are the default channel groups of Google Analytics. "AI Assistant" did not exist as a channel in 2024.',
  },
};
