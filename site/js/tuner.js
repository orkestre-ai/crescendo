/* Floating tuner for the finale hairpin field — draft-review tool.
 * Live-edits window.finaleTune (read every frame by the shader driver in
 * hero.js). "Copy JSON" exports the current values so the picks can be
 * baked into FINALE_DEFAULTS. Remove (or gate) before production. */

const tune = window.finaleTune;
const defaults = window.finaleTuneDefaults;

const GLYPHS = [
  [0, 'Hairpin (stretched)'],
  [1, 'Chevron'],
  [2, 'Dot'],
  [3, 'Bar'],
  [4, 'Ring'],
];

const WAVE_MODES = [
  [0, 'Vertical (flat)'],
  [1, 'Sine front'],
  [2, 'Diagonal'],
  [3, 'Radial rings'],
  [4, 'Interference'],
];

const SLIDERS = [
  ['spacingPx', 'spacing px/cell', 20, 90, 1],
  ['glyphScale', 'glyph size', 0.3, 1.0, 0.01],
  ['cellAspect', 'row height', 0.4, 1.2, 0.01],
  ['strokeK', 'stroke weight', 0.015, 0.09, 0.001],
  ['restBase', 'resting opacity', 0, 0.35, 0.005],
  ['restRamp', 'resting ramp →', 0, 0.35, 0.005],
  ['waveGain', 'wave intensity', 0, 1.5, 0.05],
  ['waveSkew', 'sine amplitude', 0, 0.25, 0.005],
  ['waveFreq', 'sine/interf freq', 0.5, 5, 0.1],
  ['waveTilt', 'diagonal lean', 0, 0.8, 0.02],
  ['sweepMs', 'wave travel ms', 800, 6000, 100],
  ['gapMs', 'wave gap max ms', 0, 8000, 100],
  ['proxRadius', 'cursor radius', 0.04, 0.3, 0.005],
  ['proxGain', 'cursor intensity', 0, 1.5, 0.05],
  ['rippleMs', 'ripple travel ms', 400, 2500, 50],
];

function fmt(value, step) {
  if (step >= 1) return String(Math.round(value));
  return Number(value).toFixed(step < 0.01 ? 3 : 2);
}

function buildPanel() {
  const panel = document.createElement('details');
  panel.className = 'tuner';
  const summary = document.createElement('summary');
  summary.textContent = 'field tuner';
  panel.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'tuner-body';
  panel.appendChild(body);

  const refreshers = [];

  // dropdown builder — shared by the glyph and wave-mode selectors
  function addDropdown(key, labelText, options) {
    const row = document.createElement('label');
    row.className = 'tuner-row';
    const name = document.createElement('span');
    name.textContent = labelText;
    const select = document.createElement('select');
    for (const [value, text] of options) {
      const opt = document.createElement('option');
      opt.value = String(value);
      opt.textContent = text;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      tune[key] = Number(select.value);
      window.finaleRedraw?.();
    });
    refreshers.push(() => {
      select.value = String(tune[key]);
    });
    row.appendChild(name);
    row.appendChild(select);
    body.appendChild(row);
  }

  addDropdown('glyph', 'glyph', GLYPHS);
  addDropdown('waveMode', 'wave mode', WAVE_MODES);
  addDropdown('resCap', 'res cap (test)', [
    [0, 'Off (full res)'],
    [1, 'On (1×)'],
  ]);

  // sliders
  for (const [key, name, min, max, step] of SLIDERS) {
    const row = document.createElement('label');
    row.className = 'tuner-row';
    const head = document.createElement('span');
    head.textContent = name;
    const out = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.addEventListener('input', () => {
      tune[key] = Number(input.value);
      out.value = fmt(tune[key], step);
      window.finaleRedraw?.();
    });
    refreshers.push(() => {
      input.value = String(tune[key]);
      out.value = fmt(tune[key], step);
    });
    head.appendChild(out);
    row.appendChild(head);
    row.appendChild(input);
    body.appendChild(row);
  }

  // actions
  const actions = document.createElement('div');
  actions.className = 'tuner-actions';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'reset';
  reset.addEventListener('click', () => {
    Object.assign(tune, defaults);
    refreshers.forEach((fn) => fn());
    window.finaleRedraw?.();
  });
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'copy json';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(tune, null, 2));
      copy.textContent = 'copied ✓';
    } catch {
      copy.textContent = 'copy failed';
    }
    setTimeout(() => {
      copy.textContent = 'copy json';
    }, 1400);
  });
  actions.appendChild(reset);
  actions.appendChild(copy);
  body.appendChild(actions);

  refreshers.forEach((fn) => fn());
  document.body.appendChild(panel);
}

if (tune && defaults && new URLSearchParams(location.search).has('tuner')) {
  buildPanel();
}
