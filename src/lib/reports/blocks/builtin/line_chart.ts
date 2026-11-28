import type { Cell } from '../../types';
import type { BlockSeed } from '../types';
import { sampleNoise, sampleTable } from './sample';

// Two invented days, hour by hour, as running totals.
function hourlyTotals(seed: number, scale: number) {
  const noise = sampleNoise(seed);
  // Quiet overnight, a morning rise, an evening peak.
  const shape = [
    1, 1, 0.5, 0.5, 1, 2, 4, 6, 9, 10, 10, 11, 12, 11, 10, 9, 10, 12, 15, 14, 11, 7, 4, 2,
  ];
  let now = 0;
  let before = 0;
  return sampleTable(
    'Running total of revenue by hour',
    [
      ['hour', 'text'],
      ['revenue_now', 'currency'],
      ['revenue_before', 'currency'],
    ],
    shape.map((weight, hour): Cell[] => {
      now += Math.round(weight * scale * (0.7 + noise() * 0.6));
      before += Math.round(weight * scale * 0.88 * (0.7 + noise() * 0.6));
      return [String(hour).padStart(2, '0'), now, before];
    })
  );
}

export const lineChart: BlockSeed = {
  key: 'line_chart',
  name: 'Line chart',
  description:
    'One or two lines over time, from a ledger dataset: this year against last, hour by hour or day by day. Give one panel for a wide chart, or two panels to set two small charts side by side (two days compared the same way). Each line ends with its value. The numbers behind the chart can be opened as a table.',
  dataSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['x', 'xKind', 'lines', 'panels'],
    properties: {
      x: { type: 'string', description: 'The dataset column along the bottom' },
      xKind: {
        type: 'string',
        enum: ['date', 'hour', 'category'],
        description:
          '"date" for a GA4 date column (20261115), "hour" for an hour column (0 to 23), "category" for names',
      },
      xLabel: { type: 'string', description: 'Heading for that column in the table of numbers' },
      lines: {
        type: 'array',
        minItems: 1,
        maxItems: 2,
        description: 'The lines to draw. The first is the one the report is about',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['column', 'label'],
          properties: {
            column: { type: 'string', description: 'A number column of the dataset' },
            label: { type: 'string', description: 'A short name, e.g. "2026"', 'x-editable': true },
          },
        },
      },
      panels: {
        type: 'array',
        minItems: 1,
        maxItems: 2,
        description: 'One chart, or two side by side. Every panel uses the same columns',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'series'],
          properties: {
            title: { type: 'string', description: 'What the chart shows', 'x-editable': true },
            subtitle: {
              type: 'string',
              description: 'The dates and the unit, in one line',
              'x-editable': true,
            },
            series: { 'x-ref': 'dataset', description: 'One row per point, in order' },
          },
        },
      },
    },
  },
  template: `{%- assign count = data.panels | size -%}
{%- if count > 1 -%}
  {%- if mode == 'print' %}{% assign sizes = '306x216' | split: ',' %}{% else %}{% assign sizes = '340x240' | split: ',' %}{% endif -%}
{%- elsif mode == 'print' -%}
  {%- assign sizes = '680x250' | split: ',' -%}
{%- else -%}
  {%- assign sizes = '860x300,340x240' | split: ',' -%}
{%- endif -%}
{%- assign variants = sizes | size -%}
{%- assign lineCount = data.lines | size -%}
<div class="panels{% if count > 1 %} two{% endif %}">
{%- for panel in data.panels %}
{%- assign p = forloop.index %}
  <figure>
    <h3>{{ panel.title }}</h3>
    {%- if panel.subtitle %}
    <p class="sub">{{ panel.subtitle }}</p>
    {%- endif %}
    {%- if lineCount > 1 %}
    <div class="legend" aria-hidden="true">{% for line in data.lines %}<span class="s{{ forloop.index }}">{{ line.label }}</span>{% endfor %}</div>
    {%- endif %}
    <div class="chart">
    {%- for size in sizes %}
      {%- assign wh = size | split: 'x' %}
      {%- assign c = panel.series | chart_line: wh[0], wh[1], data.x, data.lines, data.xKind %}
      {%- assign id = block.id | append: '-' | append: p | append: '-' | append: forloop.index %}
      <svg{% if variants > 1 %} class="{% if forloop.first %}wide{% else %}narrow{% endif %}"{% endif %} viewBox="0 0 {{ c.width }} {{ c.height }}" role="img" aria-labelledby="{{ id }}-t {{ id }}-d">
        <title id="{{ id }}-t">{{ panel.title }}</title>
        <desc id="{{ id }}-d">{{ c.summary }}</desc>
        <g class="grid">
          {%- for tick in c.yTicks %}<line x1="{{ c.left }}" x2="{{ c.right }}" y1="{{ tick.at }}" y2="{{ tick.at }}" />{% endfor -%}
        </g>
        {%- for tick in c.yTicks %}<text x="{{ c.yLabelX }}" y="{{ tick.textY }}" text-anchor="end">{{ tick.label }}</text>{% endfor %}
        {%- for tick in c.xTicks %}<text x="{{ tick.at }}" y="{{ c.xLabelY }}" text-anchor="{{ tick.anchor }}">{{ tick.label }}</text>{% endfor %}
        {%- for s in c.series reversed %}<path class="line {{ s.cls }}" d="{{ s.path }}" />{% endfor %}
        {%- for s in c.series %}{% if s.end %}<text class="lbl" x="{{ s.end.x }}" y="{{ s.end.y }}">{{ s.end.text }}</text>{% endif %}{% endfor %}
        <line class="cross" y1="{{ c.top }}" y2="{{ c.bottom }}" />
        {%- for s in c.series %}<circle class="dot {{ s.cls }}" r="4" />{% endfor %}
        {%- for hit in c.hits %}<rect class="hit" x="{{ hit.x }}" y="{{ c.top }}" width="{{ hit.width }}" height="{{ c.bottom | minus: c.top }}" data-tip="{{ hit.tip }}" data-tx="{{ hit.tx }}" data-ty="{{ hit.ty }}" data-dots="{{ hit.dots }}" />{% endfor %}
      </svg>
    {%- endfor %}
    </div>
    {%- assign t = panel.series | table: data.lines, data.x, data.xKind, data.xLabel %}
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
  </figure>
{%- endfor %}
</div>`,
  // Side by side, the two cards share their rows, so the charts line up
  // even when one subtitle runs to a second line.
  css: `.blk-line_chart .panels { display: grid; gap: var(--sp-3); }
.blk-line_chart figure { min-width: 0; }
@media (min-width: 601px) {
  .blk-line_chart .two { grid-template-columns: 1fr 1fr; }
  .blk-line_chart .two figure { display: grid; grid-template-rows: subgrid; grid-row: span 5; row-gap: 0; }
  .blk-line_chart .two h3 { grid-row: 1; }
  .blk-line_chart .two .sub { grid-row: 2; }
  .blk-line_chart .two .legend { grid-row: 3; }
  .blk-line_chart .two .chart { grid-row: 4; }
  .blk-line_chart .two details { grid-row: 5; }
}
@media print {
  .blk-line_chart .two { grid-template-columns: 1fr 1fr; }
  .blk-line_chart .two figure { display: grid; grid-template-rows: subgrid; grid-row: span 5; row-gap: 0; }
  .blk-line_chart .two h3 { grid-row: 1; }
  .blk-line_chart .two .sub { grid-row: 2; }
  .blk-line_chart .two .legend { grid-row: 3; }
  .blk-line_chart .two .chart { grid-row: 4; }
  .blk-line_chart .two details { grid-row: 5; }
}`,
  sampleData: {
    x: 'hour',
    xKind: 'hour',
    lines: [
      { column: 'revenue_now', label: '2025' },
      { column: 'revenue_before', label: '2024' },
    ],
    panels: [
      {
        title: 'Giving Tuesday',
        subtitle: '2 December 2025 against 3 December 2024. Running total, Canadian dollars.',
        series: hourlyTotals(11, 160),
      },
      {
        title: '31 December',
        subtitle: '2025 against 2024. Running total, Canadian dollars.',
        series: hourlyTotals(29, 540),
      },
    ],
  },
};
