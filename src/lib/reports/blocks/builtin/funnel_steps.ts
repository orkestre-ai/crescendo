import type { BlockSeed } from '../types';
import { sampleTable } from './sample';

export const funnelSteps: BlockSeed = {
  key: 'funnel_steps',
  name: 'Funnel steps',
  description:
    'How many people got through each step of a form, as bars, for one or two groups side by side (computer and phone, for example). From the second step on, each bar says what share of the step before it got this far. The dataset has one row per step, in order, and one number column per group.',
  dataSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'steps', 'step', 'series'],
    properties: {
      title: { type: 'string', description: 'What the funnel shows', 'x-editable': true },
      subtitle: {
        type: 'string',
        description: 'Who is counted and over which dates',
        'x-editable': true,
      },
      steps: { 'x-ref': 'dataset', description: 'One row per step, first step first' },
      step: { type: 'string', description: 'The dataset column that names each step' },
      stepLabel: { type: 'string', description: 'Heading for that column in the table of numbers' },
      series: {
        type: 'array',
        minItems: 1,
        maxItems: 2,
        description: 'The groups to compare',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['column', 'label'],
          properties: {
            column: { type: 'string', description: 'A number column of the dataset' },
            label: { type: 'string', description: 'The group, e.g. "Desktop"', 'x-editable': true },
          },
        },
      },
    },
  },
  template: `{%- assign c = data.steps | chart_rows: data.step, data.series, 'previous' -%}
{%- assign groups = data.series | size -%}
<figure>
  <h3>{{ data.title }}</h3>
  {%- if data.subtitle %}
  <p class="sub">{{ data.subtitle }}</p>
  {%- endif %}
  {%- if groups > 1 %}
  <div class="legend" aria-hidden="true">{% for item in data.series %}<span class="s{{ forloop.index }}">{{ item.label }}</span>{% endfor %}</div>
  {%- endif %}
  <div class="rows" role="img" aria-label="{{ data.title }}. {{ c.summary }}">
    {%- for row in c.rows %}
    <div class="row">
      <div class="name">{{ row.name }}</div>
      <div class="tracks">
        {%- for bar in row.bars %}
        <div class="track"><div class="fill {{ bar.cls }} w-{{ bar.width }}"></div><div class="val">{{ bar.text }}</div></div>
        {%- endfor %}
      </div>
    </div>
    {%- endfor %}
  </div>
  {%- assign label = data.stepLabel | default: 'Step' %}
  {%- assign t = data.steps | table: data.series, data.step, 'category', label %}
  <details class="numbers">
    <summary>Show the numbers as a table</summary>
    <div class="table-wrap"><table>
      <thead><tr>{% for head in t.head %}<th scope="col">{{ head.label }}</th>{% endfor %}</tr></thead>
      <tbody>
      {%- for row in t.rows %}
        <tr>{% for cell in row.cells %}<td>{{ cell.text }}</td>{% endfor %}</tr>
      {%- endfor %}
      </tbody>
    </table></div>
  </details>
</figure>`,
  css: `.blk-funnel_steps figure { min-width: 0; }`,
  sampleData: {
    title: 'Main donation form, last 90 days: who gets through',
    subtitle:
      'People who viewed the main donation form, started it, and gave. 26 August to 23 November 2026.',
    steps: sampleTable(
      'Donation form funnel by device',
      [
        ['step', 'text'],
        ['desktop', 'count'],
        ['mobile', 'count'],
      ],
      [
        ['Viewed the form', 3_640, 4_180],
        ['Started the form', 1_712, 2_466],
        ['Gave', 118, 41],
      ]
    ),
    step: 'step',
    series: [
      { column: 'desktop', label: 'Desktop' },
      { column: 'mobile', label: 'Mobile' },
    ],
  },
};
