import { getBrowser, trackScrapeEnd, trackScrapeStart } from '@/lib/playwright-scraper';
import { FONT_FACES } from './design/fonts.generated';
import { PAGE_MARGIN } from './design/styles';
import { LIGHT } from './design/tokens';
import { renderReportHtml } from './render';
import { prismaStore, type ReportStore } from './store';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The footer is set in Inter like the page. Chromium draws it as a document
// of its own, which inherits nothing, so it carries the two weights it uses.
const FOOTER_FONTS = FONT_FACES.split(/(?=@font-face)/)
  .filter((face) => /"Inter"; font-style: normal; font-weight: (400|600);/.test(face))
  .join('');

/**
 * The line at the foot of every printed page: the report's title on the
 * left, "Made with Crescendo" in the middle, the page number on the right.
 * Every size and colour is written out here: nothing reaches it from the page.
 */
export function footerTemplate(title: string): string {
  const cell = 'flex: 1 1 0; min-width: 0; white-space: nowrap; overflow: hidden;';
  return `<style>${FOOTER_FONTS}</style>
<div style="box-sizing: border-box; width: 100%; margin: 0 ${PAGE_MARGIN}; padding-top: 6px; border-top: 1px solid ${LIGHT.line}; display: flex; gap: 16px; align-items: baseline; font: 400 9px/1.4 Inter, system-ui, sans-serif; color: ${LIGHT.muted}; -webkit-print-color-adjust: exact;">
  <span style="${cell} text-overflow: ellipsis; font-weight: 600; color: ${LIGHT['text-2']};">${escapeHtml(title)}</span>
  <span style="flex: 0 0 auto;">Made with Crescendo</span>
  <span style="${cell} text-align: right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>`;
}

/**
 * Print one HTML document as a Letter PDF with the footer on every page,
 * using the Chromium the app already runs.
 */
export async function htmlToPdf(html: string, title: string): Promise<Buffer> {
  // Counted as a use of the shared browser, so it is not closed under this
  // page and is closed once it has sat idle.
  trackScrapeStart();
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate('document.fonts.ready.then(() => undefined)');
      return await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: footerTemplate(title),
      });
    } finally {
      await page.close();
    }
  } finally {
    trackScrapeEnd();
  }
}

/**
 * The report as a PDF: the print rendering of the same document the app
 * shows. Made on request and never stored, so a PDF made after an edit
 * reflects the edit.
 */
export async function renderReportPdf(
  runId: string,
  opts: { store?: ReportStore } = {}
): Promise<Buffer> {
  const store = opts.store ?? prismaStore;
  const run = await store.getRun(runId);
  if (!run) throw new Error(`No report run with id ${runId}`);
  return htmlToPdf(await renderReportHtml(runId, { mode: 'print', store }), run.title);
}
