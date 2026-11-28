import { createHash } from 'node:crypto';
import { FONT_FACES } from './fonts.generated';
import { BASE_CSS, PAGE_RULE, PRINT_PREVIEW_CSS, PRINT_RULES } from './styles';
import { tokensCss } from './tokens';

export type RenderMode = 'screen' | 'print';

/**
 * The one script a report runs: the theme switch, and the label a chart
 * shows under the pointer. A chart marks each hover target with data-tip
 * (lines split by a line break), and may add data-tx / data-ty (where the
 * label points, in the chart's own units) and data-dots (the heights at
 * which to show a dot on each line).
 */
export const SHELL_SCRIPT = `(() => {
  const root = document.documentElement;
  const button = document.getElementById('theme');
  if (button) {
    try {
      const saved = localStorage.getItem('crescendo-report-theme');
      if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
    } catch (e) {}
    button.addEventListener('click', () => {
      const dark = root.dataset.theme
        ? root.dataset.theme === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem('crescendo-report-theme', root.dataset.theme); } catch (e) {}
    });
  }

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'status');
  document.body.appendChild(tip);
  let shown = null;

  const hide = () => {
    if (!shown) return;
    const svg = shown.ownerSVGElement;
    if (svg) svg.querySelectorAll('.cross, .dot').forEach((mark) => mark.classList.remove('on'));
    tip.classList.remove('show');
    shown = null;
  };

  const show = (hit) => {
    if (shown === hit) return;
    hide();
    shown = hit;
    tip.textContent = '';
    (hit.getAttribute('data-tip') || '').split('\\n').forEach((line, i) => {
      const row = document.createElement(i ? 'div' : 'b');
      row.textContent = line;
      tip.appendChild(row);
    });

    const box = hit.getBoundingClientRect();
    let x = box.left + box.width / 2;
    let y = box.top;
    const svg = hit.ownerSVGElement;
    const m = svg && svg.getScreenCTM();
    if (m && hit.hasAttribute('data-tx')) {
      const tx = Number(hit.getAttribute('data-tx'));
      const ty = Number(hit.getAttribute('data-ty'));
      x = m.a * tx + m.e;
      y = m.d * ty + m.f;
      const dots = (hit.getAttribute('data-dots') || '').split(',').filter(Boolean).map(Number);
      const cross = svg.querySelector('.cross');
      if (cross && dots.length) {
        cross.setAttribute('x1', tx);
        cross.setAttribute('x2', tx);
        cross.classList.add('on');
      }
      svg.querySelectorAll('.dot').forEach((dot, i) => {
        if (dots[i] === undefined || Number.isNaN(dots[i])) return;
        dot.setAttribute('cx', tx);
        dot.setAttribute('cy', dots[i]);
        dot.classList.add('on');
      });
    }

    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.max(8, Math.min(x - w / 2, root.clientWidth - w - 8));
    const top = y - h - 10 < 8 ? y + 14 : y - h - 10;
    tip.style.left = left + scrollX + 'px';
    tip.style.top = top + scrollY + 'px';
    tip.classList.add('show');
  };

  const target = (e) => (e.target && e.target.closest ? e.target.closest('[data-tip]') : null);
  document.addEventListener('mouseover', (e) => { const hit = target(e); if (hit) show(hit); else hide(); });
  document.addEventListener('focusin', (e) => { const hit = target(e); if (hit) show(hit); });
  document.addEventListener('focusout', hide);
  document.addEventListener('touchstart', (e) => { const hit = target(e); if (hit) show(hit); else hide(); }, { passive: true });
  document.addEventListener('mouseleave', hide);
})();`;

const SCRIPT_HASH = createHash('sha256').update(SHELL_SCRIPT).digest('base64');

/**
 * Nothing loads from the network, and the only script that runs is the one
 * above, named by its hash. A script that slipped past the sanitiser inside
 * a block would not run.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  `script-src 'sha256-${SCRIPT_HASH}'`,
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * One complete, self-contained HTML document around rendered blocks.
 * `blockCss` is the styles of the blocks on the page; `body` is their
 * rendered, sanitised HTML.
 */
export function renderShell(opts: {
  title: string;
  body: string;
  blockCss: string;
  mode: RenderMode;
}): string {
  const print = opts.mode === 'print';
  const css = [
    FONT_FACES,
    tokensCss(),
    BASE_CSS,
    opts.blockCss,
    PAGE_RULE,
    `@media print {${PRINT_RULES}}`,
    print ? PRINT_RULES : '',
    print ? PRINT_PREVIEW_CSS : '',
  ].join('\n');

  // On paper there is nothing to switch or hover, so a print document runs no script.
  const toolbar = print
    ? ''
    : '<div class="toolbar"><button class="theme" id="theme" type="button" aria-label="Switch between light and dark theme">Theme</button></div>';
  const script = print ? '' : `<script>${SHELL_SCRIPT}</script>`;

  return `<!doctype html>
<html lang="en"${print ? ' data-theme="light" data-mode="print"' : ''}>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
${toolbar}
<main class="doc">
${opts.body}
</main>
</div>
${script}
</body>
</html>`;
}
