import type { Cell } from '../../types';
import type { BlockSeed } from '../types';
import { sampleDays, sampleNoise, sampleTable } from './sample';

// 47 invented days: a slow build, a spike on one Tuesday, and a year-end rush.
function dailyRevenue() {
  const noise = sampleNoise(7);
  return sampleTable(
    'Online revenue, gifts and visits each day',
    [
      ['date', 'text'],
      ['revenue', 'currency'],
      ['gifts', 'count'],
      ['sessions', 'count'],
    ],
    sampleDays('2025-11-15', 47).map((date, i): Cell[] => {
      const rush = i > 36 ? Math.pow(1.34, i - 36) : 1;
      const spike = i === 17 ? 9 : 1;
      const gifts = Math.round((14 + noise() * 16) * rush * spike);
      const revenue = Math.round(gifts * (95 + noise() * 90) * 100) / 100;
      const sessions = Math.round(18_000 + noise() * 9_000 + (spike > 1 ? 6_000 : 0));
      return [date, revenue, gifts, sessions];
    })
  );
}

export const barChart: BlockSeed = {
  key: 'bar_chart',
  name: 'Bar chart',
  description:
    'Bars from a ledger dataset. Over time (xKind "date" or "hour") the bars stand upright, one per row: revenue each day of a campaign. For named things (xKind "category") they lie flat, one row each: revenue by channel. Name the bars that matter with highlights; with none, the tallest is labelled. The numbers behind the chart can be opened as a table.',
  dataSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'series', 'x', 'xKind', 'value'],
    properties: {
      title: { type: 'string', description: 'What the chart shows', 'x-editable': true },
      subtitle: {
        type: 'string',
        description: 'The dates and the unit, in one line',
        'x-editable': true,
      },
      series: { 'x-ref': 'dataset', description: 'One row per bar, in order' },
      x: { type: 'string', description: 'The dataset column that names each bar' },
      xKind: {
        type: 'string',
        enum: ['date', 'hour', 'category'],
        description:
          '"date" for a GA4 date column (20261115), "hour" for an hour column (0 to 23), "category" for names',
      },
      xLabel: { type: 'string', description: 'Heading for that column in the table of numbers' },
      value: {
        type: 'object',
        additionalProperties: false,
        required: ['column', 'label'],
        description: 'The column the bars measure',
        properties: {
          column: { type: 'string', description: 'A number column of the dataset' },
          label: { type: 'string', description: 'Its name, e.g. "Revenue"', 'x-editable': true },
        },
      },
      more: {
        type: 'array',
        maxItems: 4,
        description:
          'Other columns to show beside the value when a bar is pointed at, and in the table',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['column', 'label'],
          properties: {
            column: { type: 'string', description: 'A number column of the dataset' },
            label: { type: 'string', description: 'Its name, e.g. "Gifts"', 'x-editable': true },
          },
        },
      },
      highlights: {
        type: 'array',
        maxItems: 4,
        description: 'Bars to name on the chart. Crescendo adds each bar’s value after the name',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['x', 'label'],
          properties: {
            x: {
              type: 'string',
              description: 'The bar: its value in the x column, e.g. "20261201"',
            },
            label: {
              type: 'string',
              description: 'A short name, e.g. "Giving Tuesday"',
              'x-editable': true,
            },
          },
        },
      },
    },
  },
  template: `{%- if mode == 'print' %}{% assign sizes = '680x250' | split: ',' %}{% else %}{% assign sizes = '860x300,340x240' | split: ',' %}{% endif -%}
{%- assign variants = sizes | size -%}
<figure>
  <h3>{{ data.title }}</h3>
  {%- if data.subtitle %}
  <p class="sub">{{ data.subtitle }}</p>
  {%- endif %}
  {%- if data.xKind == 'category' %}
  {%- assign c = data.series | chart_rows: data.x, data.value %}
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
  {%- assign columns = data.value %}
  {%- else %}
  <div class="chart">
  {%- for size in sizes %}
    {%- assign wh = size | split: 'x' %}
    {%- assign c = data.series | chart_bars: wh[0], wh[1], data.x, data.value, data.xKind, data.highlights, data.more %}
    {%- assign columns = c.columns %}
    {%- assign id = block.id | append: '-' | append: forloop.index %}
    <svg{% if variants > 1 %} class="{% if forloop.first %}wide{% else %}narrow{% endif %}"{% endif %} viewBox="0 0 {{ c.width }} {{ c.height }}" role="img" aria-labelledby="{{ id }}-t {{ id }}-d">
      <title id="{{ id }}-t">{{ data.title }}</title>
      <desc id="{{ id }}-d">{{ c.summary }}</desc>
      <g class="grid">
        {%- for tick in c.yTicks %}<line x1="{{ c.left }}" x2="{{ c.right }}" y1="{{ tick.at }}" y2="{{ tick.at }}" />{% endfor -%}
      </g>
      {%- for tick in c.yTicks %}<text x="{{ c.yLabelX }}" y="{{ tick.textY }}" text-anchor="end">{{ tick.label }}</text>{% endfor %}
      {%- for tick in c.xTicks %}<text x="{{ tick.at }}" y="{{ c.xLabelY }}" text-anchor="{{ tick.anchor }}">{{ tick.label }}</text>{% endfor %}
      <g class="s1">
        {%- for bar in c.bars %}{% if bar.path != '' %}<path class="bar" d="{{ bar.path }}" />{% endif %}{% endfor -%}
      </g>
      {%- for label in c.labels %}
      {%- if label.leader %}<g class="axis"><line x1="{{ label.leader.x }}" x2="{{ label.leader.x }}" y1="{{ label.leader.y1 }}" y2="{{ label.leader.y2 }}" /></g>{% endif %}
      <text class="lbl" x="{{ label.x }}" y="{{ label.y }}" text-anchor="{{ label.anchor }}">{{ label.text }}</text>
      {%- endfor %}
      {%- for hit in c.hits %}<rect class="hit" x="{{ hit.x }}" y="{{ c.top }}" width="{{ hit.width }}" height="{{ c.bottom | minus: c.top }}" data-tip="{{ hit.tip }}" data-tx="{{ hit.tx }}" data-ty="{{ hit.ty }}" />{% endfor %}
    </svg>
  {%- endfor %}
  </div>
  {%- endif %}
  {%- assign t = data.series | table: columns, data.x, data.xKind, data.xLabel %}
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
  css: `.blk-bar_chart figure { min-width: 0; }`,
  sampleData: {
    title: 'Online revenue each day, 15 November to 31 December 2025',
    subtitle: 'Canadian dollars. Giving Tuesday fell on 2 December.',
    series: dailyRevenue(),
    x: 'date',
    xKind: 'date',
    value: { column: 'revenue', label: 'Revenue' },
    more: [
      { column: 'gifts', label: 'Gifts' },
      { column: 'sessions', label: 'Visits' },
    ],
    highlights: [
      { x: '20251202', label: 'Giving Tuesday' },
      { x: '20251231', label: '31 Dec' },
    ],
  },
};
