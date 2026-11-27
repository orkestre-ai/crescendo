import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_BLOCKS, BUILTIN_VERSION, builtinBlockDefs } from '../blocks/builtin';
import { renderBlock, renderRaw } from '../blocks/engine';
import { sanitizeBlockHtml } from '../blocks/sanitize';
import { validateBlockCss, validateBlockDef } from '../blocks/validate';
import { TOKEN_NAMES } from '../design/tokens';

const KEYS = [
  'report_header',
  'section',
  'priority_cards',
  'stat_tiles',
  'data_table',
  'line_chart',
  'bar_chart',
  'funnel_steps',
  'flag',
  'prose',
  'definition_list',
];

test('built-ins: the eleven blocks the plan names, each once', () => {
  assert.deepEqual(BUILTIN_BLOCKS.map((block) => block.key).sort(), [...KEYS].sort());
});

test('built-ins: as stored blocks they are approved, current and at the built-in version', () => {
  for (const def of builtinBlockDefs()) {
    assert.equal(def.origin, 'builtin');
    assert.equal(def.status, 'approved');
    assert.equal(def.isCurrent, true);
    assert.equal(def.version, BUILTIN_VERSION);
  }
});

for (const block of BUILTIN_BLOCKS) {
  test(`built-in ${block.key}: passes its own validation`, () => {
    assert.deepEqual(validateBlockDef(block), []);
  });

  test(`built-in ${block.key}: renders its sample data, and the sanitiser changes nothing`, () => {
    for (const mode of ['screen', 'print'] as const) {
      const raw = renderRaw(block, block.sampleData, { mode });
      const { html, changed } = sanitizeBlockHtml(raw);
      assert.equal(changed, false, `${mode}: the sanitiser took something out`);
      assert.ok(html.trim().length > 0);
      // Sanitising what was already sanitised is a no-op.
      assert.equal(sanitizeBlockHtml(html).html, html);

      const rendered = renderBlock(block, block.sampleData, { mode, blockId: 'b7' });
      assert.ok(
        rendered.startsWith(`<section class="blk blk-${block.key}" data-block-id="b7">`),
        'wrapped in its section'
      );
      assert.ok(rendered.endsWith('</section>'));
      assert.doesNotMatch(rendered, /<script|<style|<iframe|<object|foreignObject|\son[a-z]+=/i);
      assert.doesNotMatch(rendered, /\sstyle=/i);
    }
  });

  test(`built-in ${block.key}: its styles touch this block only and use tokens`, () => {
    assert.deepEqual(validateBlockCss(block.key, block.css), []);
    for (const match of block.css.matchAll(/var\(--([a-z0-9-]+)\)/g)) {
      assert.ok(TOKEN_NAMES.has(match[1]), `--${match[1]} is not a token`);
    }
    assert.doesNotMatch(block.css, /#[0-9a-f]{3,8}\b/i);
  });
}

test('built-ins: every chart drawing has a title and a description', () => {
  for (const key of ['line_chart', 'bar_chart']) {
    const block = BUILTIN_BLOCKS.find((b) => b.key === key)!;
    const html = renderBlock(block, block.sampleData, { mode: 'screen' });
    const drawings = html.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
    assert.ok(drawings.length > 0, `${key} draws at least one chart`);
    for (const svg of drawings) {
      assert.match(svg, /role="img"/);
      assert.match(svg, /<title id="[^"]+">[^<]+<\/title>/);
      assert.match(svg, /<desc id="[^"]+">[^<]+<\/desc>/);
      const ids = /aria-labelledby="([^"]+)"/.exec(svg)![1].split(' ');
      for (const id of ids) assert.ok(svg.includes(`id="${id}"`), `${id} is in the drawing`);
    }
  }
});

test('built-ins: a chart drawn twice on screen gives each drawing its own ids', () => {
  const block = BUILTIN_BLOCKS.find((b) => b.key === 'bar_chart')!;
  const html = renderBlock(block, block.sampleData, { mode: 'screen', blockId: 'b3' });
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(html, /class="wide"/);
  assert.match(html, /class="narrow"/);
  // On paper there is one drawing, sized for the Letter column.
  const print = renderBlock(block, block.sampleData, { mode: 'print', blockId: 'b3' });
  assert.equal((print.match(/<svg/g) ?? []).length, 1);
  assert.match(print, /viewBox="0 0 680 250"/);
});

test('built-ins: every table has real header cells, and charts keep their numbers as a table', () => {
  for (const key of ['data_table', 'line_chart', 'bar_chart', 'funnel_steps']) {
    const block = BUILTIN_BLOCKS.find((b) => b.key === key)!;
    const html = renderBlock(block, block.sampleData, { mode: 'screen' });
    assert.match(html, /<thead><tr>\s*<th scope="col"/);
    if (key !== 'data_table') {
      assert.match(html, /<details class="numbers">\s*<summary>Show the numbers as a table/);
      assert.doesNotMatch(html, /<details[^>]* open/);
    }
  }
});

test('built-ins: the table marks its total row and colours changes by sign', () => {
  const block = BUILTIN_BLOCKS.find((b) => b.key === 'data_table')!;
  const html = renderBlock(block, block.sampleData, { mode: 'screen' });
  assert.equal((html.match(/<tr class="total">/g) ?? []).length, 1);
  assert.match(html, /<td class="down">−12%<\/td>/);
  assert.match(html, /<td class="up">\+19%<\/td>/);
  // A missing value is a dash, not a zero.
  assert.match(html, /<td>—<\/td>/);
});

test('built-ins: sample data is long enough to show wrapping', () => {
  const sample = (key: string) =>
    BUILTIN_BLOCKS.find((b) => b.key === key)!.sampleData as Record<string, never>;
  assert.equal((sample('bar_chart').series as { rows: unknown[] }).rows.length, 47);
  // Twelve rows and a total.
  assert.equal((sample('data_table').rows as { rows: unknown[] }).rows.length, 13);
  assert.ok((sample('section').heading as string).length > 60);
});
