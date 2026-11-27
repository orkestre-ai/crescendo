import { lightTokensCss } from './tokens';

/**
 * The shared styles of a report: type, the page column, and the parts every
 * block may use without styling them again (cards for figures, the table
 * wrapper, legends, chart text, "show the numbers", up and down colours,
 * bar lengths). A block's own styles sit on top of these.
 */

// Bar lengths as classes, w-0 to w-100: a percent of the row the bar is in.
// Templates may not write a style attribute, so a bar's length is a class.
const WIDTHS = Array.from({ length: 101 }, (_, i) => `.blk .w-${i} { width: ${i}%; }`).join(' ');

export const BASE_CSS = `
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: var(--fs-body)/1.6 Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-feature-settings: "tnum" 1;
}
.wrap { max-width: 920px; margin: 0 auto; padding: 16px 16px 80px; }
.toolbar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
.theme {
  font: 500 13px Inter, system-ui, sans-serif;
  background: transparent;
  color: var(--text-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  cursor: pointer;
}
.empty { color: var(--muted); padding: 48px 0; text-align: center; }

/* Type */
a { color: var(--accent); }
h1, h2, h3 { font-family: "Source Serif 4", Georgia, serif; line-height: 1.2; margin: 0; text-wrap: balance; }
h1 { font-size: var(--fs-2xl); }
h2 { font-size: var(--fs-xl); }
h3 { font-size: var(--fs-lg); }
p { margin: 0 0 14px; max-width: var(--measure); }
p:last-child { margin-bottom: 0; }
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .88em;
  background: var(--surface);
  padding: 1px 5px;
  border-radius: 4px;
  overflow-wrap: anywhere;
}

/* Blocks: one rhythm down the page. A block is kept whole on a printed page. */
.blk { margin: var(--sp-6) 0 0; break-inside: avoid; }
.doc > .blk:first-child { margin-top: 0; }
.blk h1, .blk h2, .blk h3 { break-after: avoid; }
.blk .up { color: var(--up); }
.blk .down { color: var(--down); }
.blk .s1 { --c: var(--s1); }
.blk .s2 { --c: var(--s2); }

/* Tables */
.blk .table-wrap {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--card);
  /* A table that runs over a page keeps its border on both pieces. */
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
.blk table { border-collapse: collapse; width: 100%; font-size: var(--fs-md); }
.blk th, .blk td { text-align: right; padding: 9px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.blk th:first-child, .blk td:first-child { text-align: left; white-space: normal; min-width: 10em; }
.blk th.text, .blk td.text { text-align: left; }
.blk thead { display: table-header-group; }
.blk thead th { font-weight: 600; color: var(--text-2); background: var(--surface); font-size: var(--fs-sm); }
.blk tbody tr { break-inside: avoid; }
.blk tbody tr:last-child td { border-bottom: 0; }
.blk tr.total td { font-weight: 600; background: var(--surface); }
.blk caption { caption-side: bottom; text-align: left; font-size: var(--fs-sm); color: var(--muted); padding: 8px 12px; }
/* A block that is a table may run over a page; its header repeats. */
.blk:has(> .table-wrap) { break-inside: auto; }

/* Figures: the card a chart sits in */
.blk figure {
  margin: 0;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px 16px 14px;
}
.blk figure h3 { font-family: Inter, system-ui, sans-serif; font-size: var(--fs-body); font-weight: 600; line-height: 1.3; }
.blk figure .sub { font-size: var(--fs-sm); color: var(--muted); margin: 4px 0 0; max-width: 90ch; text-wrap: pretty; }
.blk .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: var(--fs-sm); color: var(--text-2); margin: 10px 0 0; }
.blk .legend span::before {
  content: "";
  display: inline-block;
  width: 12px;
  height: 3px;
  border-radius: 2px;
  margin-right: 6px;
  vertical-align: middle;
  background: var(--c);
}

/* Charts. Each chart is drawn twice: wide, and narrow for a phone. */
.blk .chart { margin: 12px 0 0; }
.blk .chart svg { display: block; width: 100%; height: auto; overflow: visible; }
.blk .chart text { fill: var(--muted); font: 11px Inter, system-ui, sans-serif; }
.blk .chart .grid line { stroke: var(--grid); stroke-width: 1; }
.blk .chart .axis line { stroke: var(--line); stroke-width: 1; }
.blk .chart .lbl { fill: var(--text-2); font-weight: 600; }
.blk .chart .line { fill: none; stroke: var(--c); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.blk .chart .bar { fill: var(--c); }
.blk .chart .hit { fill: transparent; outline: none; }
.blk .chart .hit:focus-visible { stroke: var(--accent); stroke-width: 1; }
.blk .chart .cross { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 3 3; opacity: 0; }
.blk .chart .dot { fill: var(--c); stroke: var(--card); stroke-width: 2; opacity: 0; }
.blk .chart .cross.on, .blk .chart .dot.on { opacity: 1; }
@media (max-width: 600px) { .blk .chart .wide { display: none; } }
@media (min-width: 601px) { .blk .chart .narrow { display: none; } }

/* Bars drawn as rows: a name, then a bar and its label */
.blk .rows { display: grid; gap: 10px; margin: 14px 0 2px; }
.blk .row { display: grid; grid-template-columns: 120px 1fr; gap: 10px; align-items: center; font-size: var(--fs-sm); }
.blk .row .name { color: var(--text-2); overflow-wrap: anywhere; }
.blk .row .tracks { display: grid; gap: 3px; min-width: 0; }
.blk .row .track { display: flex; align-items: center; gap: 6px; min-width: 0; }
/* The longest bar is 55% of its track, so the label after a bar always has room. */
.blk .row .fill { flex: 0 0 auto; height: 14px; min-width: 2px; border-radius: 0 4px 4px 0; background: var(--c); }
.blk .row .val { font-size: var(--fs-xs); font-weight: 500; line-height: 1.2; color: var(--text-2); flex: 1 1 0; min-width: 0; }
@media (max-width: 600px) { .blk .row { grid-template-columns: 1fr; gap: 4px; } }
${WIDTHS}

/* "Show the numbers": the table behind a chart, closed until asked for */
.blk details.numbers { margin: 8px 0 -4px; font-size: var(--fs-sm); }
.blk details.numbers summary { cursor: pointer; color: var(--accent); padding: 4px 0; }
.blk details.numbers .table-wrap { margin: 8px 0 6px; }

/* The label a chart shows under the pointer */
.tip {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  background: var(--text);
  color: var(--bg);
  font-size: 12px;
  line-height: 1.45;
  padding: 7px 9px;
  border-radius: 6px;
  white-space: nowrap;
  opacity: 0;
  transition: opacity .1s;
  z-index: 2;
}
.tip b { display: block; font-weight: 600; }
.tip.show { opacity: 1; }
`;

/**
 * What changes on paper. Used under @media print in every document, and on
 * its own when the document is rendered for print.
 */
export const PRINT_RULES = `
${lightTokensCss(':root, :root[data-theme="dark"], :root:not([data-theme="light"])')}
:root, :root[data-theme="dark"], :root:not([data-theme="light"]) {
  --bg: #ffffff;
  --fs-xs: 11px; --fs-sm: 12px; --fs-md: 13px; --fs-body: 14px; --fs-lg: 17px; --fs-xl: 22px; --fs-2xl: 32px;
}
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { line-height: 1.5; }
.wrap { max-width: none; padding: 0; }
.toolbar, .tip { display: none; }
.blk .table-wrap { overflow: visible; }
.blk .chart .hit, .blk .chart .cross, .blk .chart .dot { display: none; }
.blk .chart .wide { display: block; }
.blk .chart .narrow { display: none; }
.blk details.numbers { display: none; }
`;

/** A print document shown on a screen: a Letter sheet with its margins. */
export const PRINT_PREVIEW_CSS = `
@media screen {
  html { background: #e9e8e4; }
  body { background: transparent; }
  .wrap { width: 8.5in; max-width: 100%; min-height: 11in; margin: 24px auto; padding: 18mm; background: #ffffff; box-shadow: 0 1px 4px rgba(0, 0, 0, .18); }
}
`;

export const PAGE_RULE = '@page { size: Letter; margin: 18mm; }';
