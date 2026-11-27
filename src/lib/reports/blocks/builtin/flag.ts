import type { BlockSeed } from '../types';

export const flag: BlockSeed = {
  key: 'flag',
  name: 'Flag',
  description:
    'A short caution set apart in a tinted box: the data was sampled, a list was cut off, tracking changed part-way through. One or two sentences. Use it where the caution applies, not at the end.',
  dataSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['text'],
    properties: {
      text: {
        type: 'string',
        description: 'The caution, in plain words. May use {{fig:key}}',
        'x-editable': true,
      },
    },
  },
  template: `<p>{{ data.text }}</p>`,
  css: `.blk-flag {
  background: var(--flag-bg);
  border: 1px solid var(--flag-line);
  border-radius: var(--sp-2);
  padding: var(--sp-3) 14px;
  font-size: var(--fs-md);
}
.blk-flag p { margin: 0; max-width: none; }`,
  sampleData: {
    text: 'Two cautions. Google Analytics estimated this funnel from about a third of the data, so the figures are approximate. And "started the form" counts the first touch of any field, including the amount buttons.',
  },
};
