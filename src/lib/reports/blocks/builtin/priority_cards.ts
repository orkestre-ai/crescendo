import type { BlockSeed } from '../types';

export const priorityCards: BlockSeed = {
  key: 'priority_cards',
  name: 'Priority cards',
  description:
    'A numbered list of findings in order of importance. Each card has a heading, a short paragraph of evidence, and an optional "Worth checking" line saying what to do next. Put numbers in the text with {{fig:key}}.',
  dataSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 9,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['heading', 'body'],
          properties: {
            heading: {
              type: 'string',
              description: 'The finding, in one line',
              'x-editable': true,
            },
            body: {
              type: 'string',
              description: 'The evidence, in two to four sentences. May use {{fig:key}}',
              'x-editable': true,
            },
            check: {
              type: 'string',
              description: 'What to check or do next. Shown after "Worth checking:"',
              'x-editable': true,
            },
          },
        },
      },
    },
  },
  template: `<ol>
{%- for item in data.items %}
  <li>
    <h3>{{ item.heading }}</h3>
    <p>{{ item.body }}</p>
    {%- if item.check %}
    <p class="check"><b>Worth checking:</b> {{ item.check }}</p>
    {%- endif %}
  </li>
{%- endfor %}
</ol>`,
  css: `.blk-priority_cards ol { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; counter-reset: card; }
.blk-priority_cards li {
  counter-increment: card;
  position: relative;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 18px 20px 16px 60px;
  break-inside: avoid;
}
.blk-priority_cards li::before {
  content: counter(card);
  position: absolute;
  left: 18px;
  top: 16px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--text);
  color: var(--bg);
  font-weight: 700;
  font-size: var(--fs-md);
  line-height: 1;
  display: grid;
  place-items: center;
}
.blk-priority_cards h3 { margin: 2px 0 6px; font-size: var(--fs-lg); }
.blk-priority_cards p { margin: 0 0 8px; max-width: var(--measure); color: var(--text-2); }
.blk-priority_cards .check { font-size: var(--fs-md); color: var(--text); margin: 0; }
.blk-priority_cards .check b { font-weight: 600; }
@media (max-width: 600px) {
  .blk-priority_cards li { padding: 16px 16px 14px 52px; }
  .blk-priority_cards li::before { left: 14px; top: 14px; }
}`,
  sampleData: {
    items: [
      {
        heading: 'Online giving this November is ahead of last year',
        body: 'From 1 to 23 November the website recorded $48,120 from 412 gifts. The same weekdays last year brought $41,870 from 388 gifts. That is 14.9% more money from 6.2% more gifts, so the average gift has grown as well.',
        check:
          'whether your own donation records show the same rise. The sections below break it down by channel and by device.',
      },
      {
        heading: 'Giving on phones has fallen while visits on phones rose',
        body: 'Phones brought 58.4% of visits to the main donation form and 21.3% of its gifts. People on a phone are more likely to start the form than people on a computer, and far less likely to finish it.',
        check:
          'make a test gift on a phone, with each payment method, on the main form and on this year’s appeal form.',
      },
      {
        heading: 'A third of online revenue cannot be traced to a source',
        body: 'Gifts with no recorded source came to $16,240 over the last 90 days. Most arrive on the thank-you page with nothing before them, which is what untagged email links look like.',
        check:
          'add campaign tags to every link in the year-end emails, so December’s email results show up by name.',
      },
      {
        heading: 'Two year-end email links lead to a page that no longer exists',
        body: 'An address used in last December’s emails was visited 1,284 times this month and returned an error each time.',
        check: 'fix or redirect the address before the next send.',
      },
      {
        heading: 'Search visits are down, and the visits that remain give more',
        body: 'Organic search brought 18.2% fewer visits than last December and 9.6% more revenue.',
      },
    ],
  },
};
