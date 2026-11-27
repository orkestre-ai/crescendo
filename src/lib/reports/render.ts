import { renderBlock } from './blocks/engine';
import { resolveBlockData, runBlocks, runLedger } from './blocks/resolve';
import type { BlockDef } from './blocks/types';
import { validateBlockCss } from './blocks/validate';
import { renderShell, type RenderMode } from './design/shell';
import { prismaStore, type ReportStore } from './store';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The block a report asked for: the version it recorded, or failing that the current one. */
function findDef(defs: BlockDef[], key: string, version?: number): BlockDef | undefined {
  return (
    defs.find((def) => def.key === key && def.version === version) ??
    defs.find((def) => def.key === key && def.isCurrent)
  );
}

/**
 * The styles of the blocks on a page, each once. A block's styles were
 * checked when it was saved; they are checked again here, and a block that
 * no longer passes is drawn without them.
 */
function blockStyles(defs: BlockDef[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const def of defs) {
    const id = `${def.key}@${def.version}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (validateBlockCss(def.key, def.css).length === 0) out.push(def.css);
  }
  return out.join('\n');
}

const missing = (id: string, message: string) =>
  `<section class="blk blk-missing" data-block-id="${escapeHtml(id)}"><p class="empty">${escapeHtml(message)}</p></section>`;

/**
 * The report as one complete, self-contained HTML document: the page the
 * app shows, the file a person downloads and, in print mode, the source of
 * the PDF. A hidden block is left out.
 */
export async function renderReportHtml(
  runId: string,
  opts: { mode: RenderMode; store?: ReportStore }
): Promise<string> {
  const store = opts.store ?? prismaStore;
  const run = await store.getRun(runId);
  if (!run) throw new Error(`No report run with id ${runId}`);

  const [figures, datasets, defs] = await Promise.all([
    store.listFigures(runId),
    store.listDatasets(runId),
    store.listBlockDefs(),
  ]);
  const ledger = runLedger(run, figures, datasets);

  const used: BlockDef[] = [];
  const parts: string[] = [];
  for (const block of runBlocks(run.blocks)) {
    if (block.hidden) continue;
    const def = findDef(defs, block.block, block.version);
    if (!def) {
      parts.push(missing(block.id, `The block "${block.block}" is not available.`));
      continue;
    }
    try {
      parts.push(
        renderBlock(def, resolveBlockData(block.data, ledger), {
          mode: opts.mode,
          blockId: block.id,
          currencyCode: run.currencyCode,
        })
      );
      used.push(def);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      parts.push(missing(block.id, `This part of the report could not be shown: ${reason}`));
    }
  }

  return renderShell({
    title: run.title,
    body: parts.length ? parts.join('\n') : '<p class="empty">This report has no document yet.</p>',
    blockCss: blockStyles(used),
    mode: opts.mode,
  });
}

const GALLERY_CSS = `
.gallery-head { margin: 0 0 var(--sp-7); }
.gallery-head h1 { margin: 0 0 var(--sp-2); }
.gallery-head p { color: var(--text-2); margin: 0; }
.gallery-item { margin: var(--sp-8) 0 0; }
.gallery-label {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px var(--sp-3);
  padding: 0 0 var(--sp-2);
  margin: 0 0 var(--sp-5);
  border-bottom: 1px dashed var(--line);
  font-size: var(--fs-sm);
  color: var(--muted);
  break-after: avoid;
}
.gallery-label b { color: var(--text); font-weight: 600; font-size: var(--fs-md); }
.gallery-label span { flex: 1 1 320px; }
/* Here a section heading is followed by the next block's label, not by its own first block. */
.gallery-item > .blk { margin-top: 0; break-after: auto; }
`;

/**
 * Every current block that is not disabled, drawn with its own sample data:
 * the page the built-in blocks are reviewed on, and later the ones the
 * builder adds.
 */
export async function renderGalleryHtml(opts: {
  mode: RenderMode;
  store?: ReportStore;
}): Promise<string> {
  const store = opts.store ?? prismaStore;
  const defs = (await store.listBlockDefs()).filter(
    (def) => def.isCurrent && def.status !== 'disabled'
  );

  const items = defs.map((def) => {
    let block: string;
    try {
      block = renderBlock(def, def.sampleData, {
        mode: opts.mode,
        blockId: `gallery-${def.key}`,
        currencyCode: 'CAD',
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      block = missing(def.key, `This block could not be drawn: ${reason}`);
    }
    return `<div class="gallery-item">
<div class="gallery-label"><b>${escapeHtml(def.name)}</b><code>${escapeHtml(def.key)}</code><span>${escapeHtml(def.description)}</span></div>
${block}
</div>`;
  });

  const head = `<div class="gallery-head"><h1>Report blocks</h1><p>Every block a report can use, drawn with sample data. The names and numbers are invented.</p></div>`;
  return renderShell({
    title: 'Report blocks',
    body: head + items.join('\n'),
    blockCss: GALLERY_CSS + blockStyles(defs),
    mode: opts.mode,
  });
}
