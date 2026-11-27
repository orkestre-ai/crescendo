import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { closeBrowser } from '@/lib/playwright-scraper';
import { BUILTIN_BLOCKS } from '../blocks/builtin';
import { reportFileName } from '../filename';
import { footerTemplate, renderReportPdf } from '../pdf';
import { renderReportHtml } from '../render';
import { fixtureReport } from './pdf-fixture';

// The PDF tests print with the real Chromium; it is closed when they are done.
after(() => closeBrowser());

test('renderReportPdf: the fixture report prints as a Letter PDF of several pages', async () => {
  const { store, runId } = await fixtureReport();
  const pdf = await renderReportPdf(runId, { store });

  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  const pages = (await PDFDocument.load(pdf)).getPages();
  assert.ok(pages.length > 1, `expected more than one page, got ${pages.length}`);
  for (const page of pages) {
    // Letter is 8.5 by 11 inches at 72 points an inch.
    assert.deepEqual([Math.round(page.getWidth()), Math.round(page.getHeight())], [612, 792]);
  }
});

test('renderReportPdf: a run that does not exist is an error, not an empty file', async () => {
  const { store } = await fixtureReport();
  await assert.rejects(renderReportPdf('nope', { store }), /No report run with id nope/);
});

test('the PDF source: every built-in block, the break rules, the light theme, no hidden block', async () => {
  const { store, runId } = await fixtureReport();
  const html = await renderReportHtml(runId, { mode: 'print', store });

  for (const block of BUILTIN_BLOCKS) {
    assert.ok(html.includes(`class="blk blk-${block.key}"`), `${block.key} is in the fixture`);
  }
  // The long table: 60 rows and a total, in one table whose header repeats.
  const pages = html.slice(html.indexOf('Landing page</th>'));
  const rows = pages.slice(0, pages.indexOf('</table>'));
  assert.equal((rows.match(/<tr/g) ?? []).length, 61);

  // A short block is kept whole; a table, a list of cards, long prose and a
  // long list of notes may be divided, and say where.
  assert.match(html, /\.blk \{[^}]*break-inside: avoid;/);
  assert.match(html, /\.blk:has\(> \.table-wrap\) \{ break-inside: auto; \}/);
  assert.match(html, /\.blk thead \{ display: table-header-group; \}/);
  assert.match(html, /\.blk tbody tr \{ break-inside: avoid; \}/);
  assert.match(html, /\.blk-priority_cards \{ break-inside: auto; \}/);
  assert.match(html, /\.blk-priority_cards li \{[^}]*break-inside: avoid;/);
  assert.match(html, /\.blk-prose:has\(> p:nth-child\(3\)\) \{ break-inside: auto; \}/);
  assert.match(html, /\.blk-prose p \{[^}]*orphans: 3; widows: 3;/);
  assert.match(html, /\.blk-definition_list:has\(li:nth-child\(4\)\) \{ break-inside: auto; \}/);
  assert.match(html, /\.blk-section \{[^}]*break-after: avoid;/);
  assert.match(html, /@page \{ size: Letter; margin: 18mm; \}/);

  // Always light on paper, and nothing to run.
  assert.match(html, /<html lang="en" data-theme="light" data-mode="print">/);
  assert.doesNotMatch(html, /<[a-z][^>]*\sdata-theme="dark"/);
  assert.doesNotMatch(html, /<script/);

  // A hidden block is in neither rendering.
  assert.doesNotMatch(html, /must not be printed/);
  assert.doesNotMatch(
    await renderReportHtml(runId, { mode: 'screen', store }),
    /must not be printed/
  );
});

test('footerTemplate: the title, the page numbers and the credit, with nothing inherited', () => {
  const footer = footerTemplate('Giving <review> & "more"');
  assert.match(footer, /Giving &lt;review&gt; &amp; &quot;more&quot;/);
  assert.match(
    footer,
    /Page <span class="pageNumber"><\/span> of <span class="totalPages"><\/span>/
  );
  assert.match(footer, /Made with Crescendo/);
  // Chromium draws the footer apart from the page: sizes, colours and the
  // font are written into it, never read from the report's tokens.
  assert.match(footer, /font: 400 9px\/1\.4 Inter/);
  assert.match(footer, /@font-face \{ font-family: "Inter";[^}]*font-weight: 400;/);
  assert.doesNotMatch(footer, /Source Serif/);
  assert.doesNotMatch(footer, /var\(--/);
});

test('reportFileName: organisation, definition key and the day the run ended', async () => {
  const { store, runId } = await fixtureReport();
  const run = (await store.getRun(runId))!;
  assert.equal(
    reportFileName(run, 'pdf'),
    'example-organisation-year-end-giving-review-2026-01-06.pdf'
  );

  // The day is the property's: 03:00 UTC on 1 January is still 31 December in Toronto.
  const late = { ...run, completedAt: new Date('2026-01-01T03:00:00Z') };
  assert.match(reportFileName(late, 'html'), /-2025-12-31\.html$/);
  assert.match(reportFileName({ ...late, timeZone: null }, 'html'), /-2026-01-01\.html$/);

  // A report with no title area has no organisation to name; accents and signs are dropped.
  const bare = {
    ...run,
    blocks: [],
    definitionSnapshot: { ...run.definitionSnapshot, key: 'Bilan_Été' },
  };
  assert.equal(reportFileName(bare, 'csv'), 'bilan-ete-2026-01-06.csv');
});
