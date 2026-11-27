import type { BlockSeed } from '../types';

export const definitionList: BlockSeed = {
  key: 'definition_list',
  name: 'Definition list',
  description:
    'A list of short notes, each opening with a few words in bold: what a term means, how something was counted, what to keep in mind. Used for "About these figures" and for the notes under a chart.',
  dataSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 12,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['term', 'text'],
          properties: {
            term: {
              type: 'string',
              description: 'The opening words, shown in bold, e.g. "What is counted."',
              'x-editable': true,
            },
            text: {
              type: 'string',
              description: 'The note. May use {{fig:key}}',
              'x-editable': true,
            },
          },
        },
      },
    },
  },
  template: `<ul>
{%- for item in data.items %}
  <li><strong>{{ item.term }}</strong> {{ item.text }}</li>
{%- endfor %}
</ul>`,
  // On paper, a list of four notes or more may run over a page, between notes.
  css: `.blk-definition_list:has(li:nth-child(4)) { break-inside: auto; }
.blk-definition_list ul { margin: 0; padding-left: var(--sp-5); color: var(--text-2); font-size: var(--fs-md); }
.blk-definition_list li { margin: 0 0 var(--sp-2); max-width: var(--measure); break-inside: avoid; }
.blk-definition_list li:last-child { margin-bottom: 0; }
.blk-definition_list strong { color: var(--text); font-weight: 600; }`,
  sampleData: {
    items: [
      {
        term: 'What is counted.',
        text: 'Gifts are purchase events sent from the donation thank-you pages. Google Analytics misses some gifts, for example when a visitor declines cookies or blocks trackers. Check totals against your fundraising database before sharing them.',
      },
      {
        term: 'Estimates.',
        text: 'The donation funnel was estimated from about a third of the data. Every other report here used all of it.',
      },
      {
        term: 'Personal data.',
        text: 'Crescendo removed 3 email addresses from page addresses before the analysis read them.',
      },
      {
        term: 'Checked twice.',
        text: 'Every query behind this report was run a second time when the analysis finished. All 42 figures matched.',
      },
      {
        term: 'Stated figures.',
        text: 'One figure, the number of emails sent, was supplied by hand and could not be checked against Google Analytics.',
      },
    ],
  },
};
