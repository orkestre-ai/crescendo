import type { BlockSeed } from '../types';

export const prose: BlockSeed = {
  key: 'prose',
  name: 'Prose',
  description:
    'One or more paragraphs of plain text: what a chart or table shows, and what follows from it. Put numbers in with {{fig:key}}, never typed.',
  dataSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['paragraphs'],
    properties: {
      paragraphs: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'string',
          description: 'One paragraph. May use {{fig:key}}',
          'x-editable': true,
        },
      },
    },
  },
  template: `{%- for paragraph in data.paragraphs %}
<p>{{ paragraph }}</p>
{%- endfor %}`,
  // On paper, three paragraphs or more may run over a page, and never leave
  // one or two lines of a paragraph alone.
  css: `.blk-prose p { margin: 0 0 var(--sp-3); orphans: 3; widows: 3; }
.blk-prose p:last-child { margin-bottom: 0; }
.blk-prose:has(> p:nth-child(3)) { break-inside: auto; }`,
  sampleData: {
    paragraphs: [
      'People on a phone are more likely to start the form than people on a computer, and about four times less likely to finish it. That points at something in the later steps on a phone: the payment fields, a wallet button, or a page that does not fit the screen.',
      'Google Analytics cannot say which. A test gift on a phone can.',
    ],
  },
};
