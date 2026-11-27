/**
 * Renders the fixture report (every built-in block, a 60-row table) and the
 * block gallery to PDF, for a person to look at the printed pages.
 *
 *   npx tsx src/scripts/render-report-fixture.ts
 *
 * Writes logs/report-pdf/fixture.pdf and gallery.pdf, the fixture's screen
 * and print HTML, and its ledger as CSV. When pdftoppm (poppler) is
 * installed, each page is also saved as <name>-page-NN.png. Needs no server
 * and no database.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeBrowser } from '@/lib/playwright-scraper';
import { fixtureReport } from '@/lib/reports/__tests__/pdf-fixture';
import { reportFileName } from '@/lib/reports/filename';
import { ledgerToCsv } from '@/lib/reports/ledger-csv';
import { htmlToPdf, renderReportPdf } from '@/lib/reports/pdf';
import { renderGalleryHtml, renderReportHtml } from '@/lib/reports/render';
import { memoryStore } from '@/lib/reports/store';

async function main(): Promise<void> {
  const dir = join(process.cwd(), 'logs', 'report-pdf');
  mkdirSync(dir, { recursive: true });
  for (const file of readdirSync(dir)) {
    if (/-page-\d+\.png$/.test(file)) rmSync(join(dir, file));
  }

  const { store, runId } = await fixtureReport();
  const run = (await store.getRun(runId))!;
  writeFileSync(join(dir, 'fixture.pdf'), await renderReportPdf(runId, { store }));
  writeFileSync(
    join(dir, 'fixture-print.html'),
    await renderReportHtml(runId, { mode: 'print', store })
  );
  writeFileSync(
    join(dir, 'fixture-screen.html'),
    await renderReportHtml(runId, { mode: 'screen', store })
  );
  writeFileSync(
    join(dir, 'fixture-ledger.csv'),
    `﻿${ledgerToCsv(await store.listFigures(runId), await store.listQueries(runId))}`
  );

  const gallery = await renderGalleryHtml({ mode: 'print', store: memoryStore() });
  writeFileSync(join(dir, 'gallery.pdf'), await htmlToPdf(gallery, 'Report blocks'));

  for (const name of ['fixture', 'gallery']) {
    try {
      execFileSync('pdftoppm', [
        '-png',
        '-r',
        '110',
        join(dir, `${name}.pdf`),
        join(dir, `${name}-page`),
      ]);
    } catch {
      console.log(`pdftoppm is not installed: no page pictures of ${name}.pdf`);
    }
  }

  console.log(`A download of this report would be named ${reportFileName(run, 'pdf')}`);
  console.log(`Written to ${dir}:`);
  for (const file of readdirSync(dir).sort()) console.log(`  ${file}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeBrowser());
