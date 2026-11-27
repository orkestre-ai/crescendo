import type { BlockSeed } from '../types';
import { sampleFigure } from './sample';

export const statTiles: BlockSeed = {
  key: 'stat_tiles',
  name: 'Stat tiles',
  description:
    'A row of headline figures. Each tile shows a label, one figure from the ledger, and optionally the figure it is compared with and the change between them (a percent figure, coloured green for a rise and red for a fall). The tiles of a row are written the same way: all in full, or all short.',
  dataSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['tiles'],
    properties: {
      tiles: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'value'],
          properties: {
            label: { type: 'string', description: 'What the figure is', 'x-editable': true },
            value: { 'x-ref': 'figure', description: 'The headline figure' },
            compact: {
              type: 'boolean',
              description:
                'Write large numbers short, to three figures: 1.81M, not 1,812,440. One tile that asks for this sets it for the whole row, so every tile reads the same way',
            },
            previousLabel: {
              type: 'string',
              description: 'What the comparison is, e.g. "2025"',
              'x-editable': true,
            },
            previous: { 'x-ref': 'figure', description: 'The figure it is compared with' },
            change: {
              'x-ref': 'figure',
              description: 'The change between the two: a percent figure, such as (a - b) / b',
            },
          },
        },
      },
    },
  },
  template: `{%- assign short = data.tiles | where: 'compact' | size -%}
<div class="tiles">
{%- for tile in data.tiles %}
  <div class="tile">
    <div class="label">{{ tile.label }}</div>
    <div class="value">
      {%- if short > 0 and tile.value.value != nil -%}
        {{ tile.value.value | fmt: 'short', tile.value.unit }}
      {%- else -%}
        {{ tile.value.display }}
      {%- endif -%}
    </div>
    {%- if tile.previous or tile.change %}
    <div class="delta">
      {%- if tile.previous -%}
        {%- if tile.previousLabel %}{{ tile.previousLabel }}: {% endif -%}
        {%- if short > 0 and tile.previous.value != nil -%}
          {{ tile.previous.value | fmt: 'short', tile.previous.unit }}
        {%- else -%}
          {{ tile.previous.display }}
        {%- endif -%}
      {%- endif -%}
      {%- if tile.change %}
        {%- if tile.previous %} {% endif -%}
        <span class="change">
          {%- if tile.previous %}({% endif -%}
          <b class="{{ tile.change.value | tone }}">{{ tile.change.value | fmt: 'change' }}</b>
          {%- if tile.previous %}){% endif -%}
        </span>
      {%- endif -%}
    </div>
    {%- endif %}
  </div>
{%- endfor %}
</div>`,
  // Four tiles sit four across or two by two, never three and one. A narrow
  // tile puts the change on a line of its own, so every tile in a row reads
  // the same way.
  css: `.blk-stat_tiles .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--sp-3); }
.blk-stat_tiles .tiles:has(> :nth-child(4):last-child) { grid-template-columns: 1fr 1fr; }
@media (min-width: 700px) {
  .blk-stat_tiles .tiles:has(> :nth-child(4):last-child) { grid-template-columns: repeat(4, 1fr); }
}
@media print {
  .blk-stat_tiles .tiles:has(> :nth-child(4):last-child) { grid-template-columns: repeat(4, 1fr); }
}
.blk-stat_tiles .tile {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 14px var(--sp-4);
  min-width: 0;
  container-type: inline-size;
}
.blk-stat_tiles .label { font-size: var(--fs-sm); color: var(--muted); }
.blk-stat_tiles .value { font-size: var(--fs-xl); font-weight: 700; line-height: 1.25; margin: 2px 0; overflow-wrap: anywhere; }
.blk-stat_tiles .delta { font-size: var(--fs-sm); color: var(--text-2); }
.blk-stat_tiles .change { white-space: nowrap; }
.blk-stat_tiles .change b { font-weight: 600; }
@container (max-width: 170px) {
  .blk-stat_tiles .change { display: block; }
}
@media (max-width: 420px) {
  .blk-stat_tiles .tiles { grid-template-columns: 1fr 1fr; }
}`,
  sampleData: {
    tiles: [
      {
        label: 'Online revenue',
        value: sampleFigure(412_860, 'currency', 'Online revenue, 15 Nov to 31 Dec 2025'),
        previousLabel: '2024',
        previous: sampleFigure(388_140, 'currency', 'Online revenue, 15 Nov to 31 Dec 2024'),
        change: sampleFigure(0.0637, 'percent', 'Change in online revenue'),
      },
      {
        label: 'Gifts',
        value: sampleFigure(2_946, 'count', 'Gifts, 15 Nov to 31 Dec 2025'),
        previousLabel: '2024',
        previous: sampleFigure(3_102, 'count', 'Gifts, 15 Nov to 31 Dec 2024'),
        change: sampleFigure(-0.0503, 'percent', 'Change in gifts'),
      },
      {
        label: 'Average gift',
        value: sampleFigure(140.14, 'currency', 'Average gift, 2025'),
        previousLabel: '2024',
        previous: sampleFigure(125.13, 'currency', 'Average gift, 2024'),
        change: sampleFigure(0.12, 'percent', 'Change in average gift'),
      },
      {
        label: 'Website visits',
        value: sampleFigure(1_284_300, 'count', 'Sessions, 15 Nov to 31 Dec 2025'),
        compact: true,
        previousLabel: '2024',
        previous: sampleFigure(1_561_900, 'count', 'Sessions, 15 Nov to 31 Dec 2024'),
        change: sampleFigure(-0.1777, 'percent', 'Change in sessions'),
      },
    ],
  },
};
