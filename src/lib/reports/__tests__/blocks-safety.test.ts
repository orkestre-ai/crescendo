import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTemplate, renderBlock, renderRaw } from '../blocks/engine';
import { sanitizeBlockHtml } from '../blocks/sanitize';
import type { BlockSeed, JSONSchema } from '../blocks/types';
import { validateBlockCss, validateBlockDef } from '../blocks/validate';

/** A sound block; each test breaks one thing about it. */
const GOOD: BlockSeed = {
  key: 'callout',
  name: 'Callout',
  description: 'A line of text in a box.',
  dataSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['text'],
    properties: { text: { type: 'string', 'x-editable': true }, value: { 'x-ref': 'figure' } },
  },
  template: '<p class="line">{{ data.text }} <b>{{ data.value.display }}</b></p>',
  css: '.blk-callout .line { color: var(--text-2); border: 1px solid var(--line); }',
  sampleData: {
    text: 'Revenue this month',
    value: {
      value: 12,
      display: '$12.00',
      label: 'Revenue',
      unit: 'currency',
      recheckStatus: 'matched',
    },
  },
};

const rules = (def: BlockSeed) => validateBlockDef(def).map((issue) => issue.rule);
const messageFor = (def: BlockSeed, rule: string) =>
  validateBlockDef(def).find((issue) => issue.rule === rule)?.message ?? '';

test('validateBlockDef: a sound block has no issues', () => {
  assert.deepEqual(validateBlockDef(GOOD), []);
});

// ── The template ───────────────────────────────────────────────────────────

test('validateBlockDef: a script tag is refused, and the message names the rule', () => {
  const def = { ...GOOD, template: `${GOOD.template}<script>alert(1)</script>` };
  assert.ok(rules(def).includes('sanitiser'));
  assert.match(messageFor(def, 'sanitiser'), /No script, style, iframe, object or foreignObject/);
});

test('validateBlockDef: an onload attribute is refused', () => {
  const def = { ...GOOD, template: '<svg onload="alert(1)" viewBox="0 0 1 1"></svg>' };
  assert.ok(rules(def).includes('sanitiser'));
  assert.match(messageFor(def, 'sanitiser'), /no style or on\* attributes/);
});

for (const [name, template] of [
  ['a style element', '<style>.x{color:red}</style><p>x</p>'],
  ['a style attribute', '<p style="color: red">x</p>'],
  ['an iframe', '<iframe src="https://example.com"></iframe><p>x</p>'],
  ['an object', '<object data="x"></object><p>x</p>'],
  ['a foreignObject', '<svg viewBox="0 0 1 1"><foreignObject><p>x</p></foreignObject></svg>'],
  ['an image', '<img src="https://example.com/x.png"><p>x</p>'],
  ['a form field', '<input name="password"><p>x</p>'],
  ['a javascript: link', '<a href="javascript:alert(1)">x</a>'],
  ['a link into the app', '<a href="/settings">x</a>'],
  ['a plain http link', '<a href="http://example.com">x</a>'],
  ['an onclick attribute in capitals', '<p ONCLICK="alert(1)">x</p>'],
  ['a script tag in capitals', '<SCRIPT>alert(1)</SCRIPT><p>x</p>'],
] as const) {
  test(`validateBlockDef: ${name} is refused`, () => {
    assert.ok(rules({ ...GOOD, template }).includes('sanitiser'));
  });
}

test('validateBlockDef: https and mailto links are allowed', () => {
  const template =
    '<p><a href="https://example.com/report">site</a> <a href="mailto:someone@example.com">write</a></p>';
  assert.deepEqual(validateBlockDef({ ...GOOD, template }), []);
});

test('validateBlockDef: a raw colour on a drawing is refused, a token is not', () => {
  const draw = (fill: string) =>
    `<svg viewBox="0 0 10 10" role="img"><title>t</title><rect width="10" height="10" fill="${fill}" /></svg>`;
  assert.ok(rules({ ...GOOD, template: draw('#ff0000') }).includes('html-colour'));
  assert.ok(rules({ ...GOOD, template: draw('red') }).includes('html-colour'));
  assert.ok(rules({ ...GOOD, template: draw('var(--nope)') }).includes('html-colour'));
  assert.deepEqual(validateBlockDef({ ...GOOD, template: draw('var(--s1)') }), []);
  assert.deepEqual(validateBlockDef({ ...GOOD, template: draw('none') }), []);
});

test('validateBlockDef: a template that does not parse is refused', () => {
  const def = { ...GOOD, template: '{% if data.text %}<p>never closed</p>' };
  assert.ok(rules(def).includes('template-parse'));
});

test('validateBlockDef: a template that fails on its own sample data is refused', () => {
  const def = { ...GOOD, template: '{% assign c = data.text | chart_line: 300, 200, "x", "y" %}' };
  assert.ok(rules(def).includes('render'));
  assert.match(messageFor(def, 'render'), /does not render with its sample data/);
});

test('validateBlockDef: a template that renders nothing is refused', () => {
  assert.ok(
    rules({ ...GOOD, template: '{% if data.nothing %}<p>x</p>{% endif %}' }).includes('render')
  );
});

// ── The engine ─────────────────────────────────────────────────────────────

test('engine: output is escaped, so markup in data stays text', () => {
  const html = renderBlock(
    GOOD,
    { ...(GOOD.sampleData as object), text: '<img src=x onerror=alert(1)>' },
    {
      mode: 'screen',
    }
  );
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('engine: there is no way to switch escaping off', () => {
  assert.throws(() => parseTemplate('{{ data.text | raw }}'), /undefined filter: raw/);
});

test('engine: a template cannot read a file', () => {
  for (const tag of ['include', 'render', 'layout']) {
    assert.throws(() => parseTemplate(`{% ${tag} 'package.json' %}`), /not found|illegal/i);
  }
});

test('engine: an unknown filter is an error, not silence', () => {
  assert.throws(() => parseTemplate('{{ data.text | no_such_filter }}'), /undefined filter/);
});

test('engine: a template that loops for ever is stopped', () => {
  const def = {
    key: 'loop',
    template: '{% for a in (1..100000) %}{% for b in (1..100000) %}x{% endfor %}{% endfor %}',
  };
  assert.throws(() => renderRaw(def, {}, { mode: 'screen' }), /limit exceeded/i);
});

test('engine: a template too long to parse is refused', () => {
  assert.throws(() => parseTemplate('x'.repeat(200_001)), /limit exceeded/i);
});

test('renderBlock: the block id is escaped in the wrapper, and a bad key is refused', () => {
  const html = renderBlock(GOOD, GOOD.sampleData, { mode: 'screen', blockId: '"><script>' });
  assert.match(html, /data-block-id="&quot;>&lt;script>"/);
  assert.throws(
    () => renderBlock({ ...GOOD, key: 'x"><script>' }, GOOD.sampleData, { mode: 'screen' }),
    /is not a block key/
  );
});

test('sanitizeBlockHtml: keeps a drawing whole, with its mixed-case names', () => {
  const svg =
    '<svg viewBox="0 0 10 10" preserveAspectRatio="none"><rect x="1" width="4" height="4" /><text text-anchor="end">a &amp; b</text></svg>';
  const { html, changed } = sanitizeBlockHtml(svg);
  assert.equal(changed, false);
  assert.match(html, /viewBox="0 0 10 10"/);
  assert.match(html, /preserveAspectRatio="none"/);
  // A self-closed shape does not swallow what follows it.
  assert.match(html, /<rect x="1" width="4" height="4"><\/rect><text/);
});

test('sanitizeBlockHtml: takes out what is not allowed and says so', () => {
  const { html, changed } = sanitizeBlockHtml('<p onclick="x()">a<script>b()</script></p>');
  assert.equal(changed, true);
  assert.equal(html, '<p>a</p>');
});

// ── The styles ─────────────────────────────────────────────────────────────

const cssRules = (css: string) => validateBlockCss('callout', css).map((issue) => issue.rule);

test('validateBlockDef: url() in the styles is refused', () => {
  const def = { ...GOOD, css: '.blk-callout { background: url(https://example.com/a.png); }' };
  assert.ok(rules(def).includes('css-url'));
  assert.match(messageFor(def, 'css-url'), /url\( is not allowed/);
});

test('validateBlockDef: a raw colour in the styles is refused', () => {
  for (const colour of [
    '#c00',
    '#CC0000',
    'red',
    'rgb(200, 0, 0)',
    'hsl(0 100% 40%)',
    'oklch(0.6 0.2 30)',
  ]) {
    const def = { ...GOOD, css: `.blk-callout .line { color: ${colour}; }` };
    assert.ok(rules(def).includes('css-colour'), colour);
  }
  assert.match(
    messageFor({ ...GOOD, css: '.blk-callout { border: 1px solid red; }' }, 'css-colour'),
    /Every colour must be a design token/
  );
});

test('validateBlockDef: a selector outside the block’s own class is refused', () => {
  for (const selector of [
    'body',
    '.line',
    '.blk-other .line',
    '.blk-calloutx',
    '.blk .line',
    '*',
  ]) {
    const def = { ...GOOD, css: `${selector} { margin: 0; }` };
    assert.ok(rules(def).includes('css-selector'), selector);
  }
  // Every selector of a list is checked, not only the first.
  assert.ok(cssRules('.blk-callout .a, body { margin: 0; }').includes('css-selector'));
  assert.match(
    messageFor({ ...GOOD, css: 'body { margin: 0; }' }, 'css-selector'),
    /must start with \.blk-callout/
  );
});

test('validateBlockCss: tokens, currentColor and transparent are the only colours', () => {
  assert.deepEqual(
    cssRules(
      '.blk-callout { color: var(--text); background: transparent; border-color: currentColor; fill: none; }'
    ),
    []
  );
  assert.deepEqual(cssRules('.blk-callout { white-space: nowrap; content: "red"; }'), []);
  assert.ok(cssRules('.blk-callout { color: var(--brand); }').includes('css-token'));
  // A property of the block's own, set from a token, may be read back.
  assert.deepEqual(
    cssRules('.blk-callout { --c: var(--s1); } .blk-callout i { color: var(--c); }'),
    []
  );
});

test('validateBlockCss: @import, fixed position and font families are refused', () => {
  assert.ok(cssRules('@import "https://example.com/x.css";').includes('css-import'));
  assert.ok(cssRules('.blk-callout { position: fixed; }').includes('css-position'));
  assert.ok(cssRules('.blk-callout { font-family: Comic Sans MS; }').includes('css-font'));
  assert.ok(cssRules('.blk-callout { font: 12px Arial; }').includes('css-font'));
  assert.ok(cssRules('@font-face { font-family: X; }').includes('css-at-rule'));
  assert.ok(cssRules('@keyframes spin { to { opacity: 0; } }').includes('css-at-rule'));
  assert.deepEqual(
    cssRules('.blk-callout { position: relative; font-size: 13px; font-weight: 600; }'),
    []
  );
});

test('validateBlockCss: rules inside @media are checked too', () => {
  assert.deepEqual(cssRules('@media (max-width: 600px) { .blk-callout .line { margin: 0; } }'), []);
  assert.ok(cssRules('@media print { body { margin: 0; } }').includes('css-selector'));
  assert.ok(cssRules('@media print { .blk-callout { color: #000; } }').includes('css-colour'));
});

test('validateBlockCss: styles cannot close the style element or fail to parse', () => {
  assert.deepEqual(cssRules('.blk-callout { margin: 0; } </style><script>x()</script>'), [
    'css-markup',
  ]);
  assert.deepEqual(cssRules('.blk-callout { margin: 0; '), ['css-parse']);
});

// ── The data shape ─────────────────────────────────────────────────────────

const withSchema = (dataSchema: JSONSchema | Record<string, unknown>): BlockSeed => ({
  ...GOOD,
  dataSchema: dataSchema as JSONSchema,
});

test('validateBlockDef: a number field in the data shape is refused, wherever it is', () => {
  const top = withSchema({ type: 'object', properties: { amount: { type: 'number' } } });
  assert.ok(rules(top).includes('schema-number'));
  assert.match(messageFor(top, 'schema-number'), /may not take a number/);
  assert.match(messageFor(top, 'schema-number'), /"x-ref": "figure"/);

  const nested = withSchema({
    type: 'object',
    properties: {
      rows: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' } } } },
    },
  });
  assert.ok(rules(nested).includes('schema-number'));
});

test('validateBlockDef: a number cannot be smuggled in through another keyword', () => {
  for (const sneaky of [
    { anyOf: [{ type: 'number' }] },
    { oneOf: [{ type: 'string' }, { type: 'number' }] },
    { type: ['string', 'number'] },
    { const: 42 },
    { $ref: '#/definitions/n' },
  ]) {
    const def = withSchema({ type: 'object', properties: { amount: sneaky } });
    assert.ok(validateBlockDef(def).length > 0, JSON.stringify(sneaky));
  }
  assert.ok(rules(withSchema({ type: 'object', properties: { n: { enum: [1, 2] } } })).length > 0);
});

test('validateBlockDef: the shape must be an object, and reference names are reserved', () => {
  assert.ok(
    rules(withSchema({ type: 'array', items: { type: 'string' } })).includes('schema-type')
  );
  assert.ok(
    rules(withSchema({ type: 'object', properties: { figure: { type: 'string' } } })).includes(
      'schema-reserved'
    )
  );
  assert.ok(
    rules(withSchema({ type: 'object', properties: { text: { 'x-ref': 'query' } } })).includes(
      'schema-ref'
    )
  );
});

test('validateBlockDef: sample data must fit the shape, with references already resolved', () => {
  const def = { ...GOOD, sampleData: { text: 'Revenue', value: { figure: 'revenue' } } };
  assert.ok(rules(def).includes('sample-data'));
});

test('validateBlockDef: a bad key is refused before anything else', () => {
  assert.deepEqual(rules({ ...GOOD, key: 'Bad Key' }), ['key']);
});
