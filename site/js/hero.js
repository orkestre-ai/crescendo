/* Crescendo hero — option B "Swell Lines"
 *
 * Division of labor: the fragment shader owns geometry (lines, crescendo
 * ramp, pointer bump); anime.js owns choreography (entry timeline, ambient
 * breathing, eased pointer retargeting). The two meet in `uniforms`, a plain
 * object anime mutates and the render loop reads every frame.
 *
 * Fallbacks: no WebGL2 → option C lattice (DOM + anime stagger ripple);
 * prefers-reduced-motion → one static frame, no loops, no entry animation.
 */
import { animate, createTimeline, stagger } from './anime.esm.min.js';

const hero = document.querySelector('[data-hero]');
const canvas = document.querySelector('[data-hero-canvas]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* anime.js writes here; the render loop reads. uPhase is the one exception —
 * it's the geometry clock, advanced by the render loop itself so wave drift
 * pauses exactly when rendering pauses (offscreen / hidden tab). */
const uniforms = {
  uSwell: reducedMotion ? 1 : 0,
  uPhase: 0,
  uPointerX: 0.62,
  uPointerY: 0.5,
  uPointerBoost: 0,
};

/* Resolve a CSS custom property (oklch) to linear-ish sRGB triplet via a
 * 2d-canvas probe — keeps the shader palette identical to the token sheet. */
function resolveColor(varName, fallback, scope = document.documentElement) {
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  const css = getComputedStyle(scope).getPropertyValue(varName).trim();
  ctx.fillStyle = fallback;
  if (css) ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

const VERT = `#version 300 es
void main() {
  // fullscreen triangle
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uSwell;
uniform float uPhase;
uniform float uPointerX;
uniform float uPointerY;
uniform float uPointerBoost;
uniform vec3 uInk;
uniform vec3 uPaper;
out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float x = uv.x;

  // the crescendo: amplitude ramps left -> right
  float ramp = pow(smoothstep(0.02, 0.98, x), 1.35);

  // pointer-conducted swell: gaussian bump centered on pointer x
  float sigma = 0.09;
  float dx = x - uPointerX;
  float bump = exp(-dx * dx / (2.0 * sigma * sigma));
  float amp = ramp * uSwell * (1.0 + 1.4 * uPointerBoost * bump);

  // lines bend gently toward pointer y inside the bump
  float bend = (uPointerY - 0.5) * -0.12 * bump * uPointerBoost;

  float aa = 1.5 / uResolution.y;
  float alpha = 0.0;

  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float freq = 5.0 + fi * 2.1;
    float speed = 0.55 + fi * 0.16;
    float lineAmp = 0.16 * (0.55 + 0.45 * sin(fi * 1.7 + 2.0));
    float base = 0.5 + (fi - 2.5) * 0.014;
    // negative phase term: crests travel left -> right, quiet toward loud
    float y = base + bend
      + sin(x * freq * 6.28318 - uPhase * speed + fi * 1.9) * amp * lineAmp;

    // ink on paper: weight varies per line instead of glow
    float halfW = (0.7 + 0.85 * (1.0 - fi / 5.0)) / uResolution.y;
    float d = abs(uv.y - y);
    float m = 1.0 - smoothstep(halfW - aa, halfW + aa, d);
    float lineOpacity = 0.9 - fi * 0.115;
    alpha = max(alpha, m * lineOpacity);
  }

  // quiet zone: the ink fades to a whisper behind the hero text
  // (wider on narrow/portrait viewports where the text fills the width)
  float aspect = uResolution.x / uResolution.y;
  float qx = mix(0.62, 0.36, clamp((aspect - 0.55) / 0.9, 0.0, 1.0));
  vec2 c = (uv - vec2(0.5, 0.52)) / vec2(qx, 0.34);
  float inside = 1.0 - smoothstep(0.7, 1.2, length(c));
  alpha *= mix(1.0, 0.1, inside);

  outColor = vec4(mix(uPaper, uInk, alpha), 1.0);
}`;

/* ---------- Option C lattice — WebGL fallback ---------- */
function buildLattice() {
  canvas.remove();
  const grid = document.createElement('div');
  grid.className = 'hero-lattice';
  grid.setAttribute('aria-hidden', 'true');
  const COLS = 12;
  const ROWS = 5;
  for (let i = 0; i < COLS * ROWS; i++) {
    const s = document.createElement('span');
    s.textContent = '<';
    grid.appendChild(s);
  }
  hero.prepend(grid);
  if (reducedMotion) return; // static lattice
  animate('.hero-lattice span', {
    opacity: [0.1, 0.85, 0.1],
    scale: [0.85, 1.2, 0.85],
    delay: stagger(90, { grid: [COLS, ROWS], from: 'center' }),
    duration: 2600,
    loop: true,
    ease: 'inOutSine',
  });
}

/* ---------- Entry + ambient choreography (shared by both renderers) ---------- */
function playEntry(onSettled) {
  if (reducedMotion) return;
  const tl = createTimeline({
    defaults: { ease: 'inOutSine' },
    onComplete: () => {
      // ambient: slow breathing swell, forever
      animate(uniforms, {
        uSwell: [1, 1.18],
        duration: 5200,
        alternate: true,
        loop: true,
        ease: 'inOutSine',
      });
      if (onSettled) onSettled();
    },
  });
  tl.add(uniforms, { uSwell: [0, 1], duration: 2400 });
  tl.add(
    '[data-hero] .line',
    { opacity: [0, 1], y: ['0.4em', '0em'], delay: stagger(120), duration: 900 },
    '-=1600'
  );
}

/* ---------- WebGL renderer ---------- */
function startWebGL(gl) {
  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
    }
    return sh;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || 'program link failed');
  }
  gl.useProgram(prog);

  const loc = {};
  for (const name of [
    'uResolution',
    'uSwell',
    'uPhase',
    'uPointerX',
    'uPointerY',
    'uPointerBoost',
    'uInk',
    'uPaper',
  ]) {
    loc[name] = gl.getUniformLocation(prog, name);
  }
  gl.uniform3fv(loc.uInk, resolveColor('--primary', '#7c3aed'));
  gl.uniform3fv(loc.uPaper, resolveColor('--background', '#f2f2f5'));

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let inView = true;
  let rafId = null;
  let lastT = null;

  function resize() {
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (w === canvas.width && h === canvas.height) return;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    // setting canvas dimensions clears the buffer — without a running loop
    // (reduced motion, paused) the hero would stay black until the next wake
    if (rafId === null) requestAnimationFrame(frame);
  }
  function frame(t) {
    rafId = null;
    if (lastT !== null) uniforms.uPhase += Math.min(t - lastT, 100) / 1000;
    lastT = t;
    gl.uniform2f(loc.uResolution, canvas.width, canvas.height);
    gl.uniform1f(loc.uSwell, uniforms.uSwell);
    gl.uniform1f(loc.uPhase, uniforms.uPhase);
    gl.uniform1f(loc.uPointerX, uniforms.uPointerX);
    gl.uniform1f(loc.uPointerY, uniforms.uPointerY);
    gl.uniform1f(loc.uPointerBoost, uniforms.uPointerBoost);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reducedMotion && inView && !document.hidden) {
      rafId = requestAnimationFrame(frame);
    }
  }
  function wake() {
    if (rafId === null && inView && !document.hidden && !reducedMotion) {
      lastT = null;
      rafId = requestAnimationFrame(frame);
    }
  }

  new ResizeObserver(resize).observe(canvas);
  resize();

  new IntersectionObserver(
    (entries) => {
      inView = entries[0].isIntersecting;
      wake();
    },
    { threshold: 0 }
  ).observe(canvas);
  document.addEventListener('visibilitychange', wake);

  if (reducedMotion) {
    // static single frame — drawn once, no loop
    requestAnimationFrame(frame);
    return;
  }

  /* conduct with the mouse: the local bump glides after the cursor */
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    animate(uniforms, {
      uPointerX: (e.clientX - r.left) / r.width,
      uPointerY: 1 - (e.clientY - r.top) / r.height, // gl y-up
      uPointerBoost: 1,
      duration: 300,
      ease: 'outQuint',
    });
  });
  hero.addEventListener('pointerleave', () => {
    // the swell decays like a released note
    animate(uniforms, { uPointerBoost: 0, duration: 1200, ease: 'outSine' });
  });

  playEntry();
  wake();
}

/* ---------- Scroll reveals: movement headings only, once, never scrubbing.
 * Classes are added by JS, so a no-JS visit sees everything immediately. */
if (!reducedMotion) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('shown');
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.35 }
  );
  document.querySelectorAll('.movement .dyn-mark, .movement h2').forEach((el) => {
    el.classList.add('reveal');
    io.observe(el);
  });
}

/* ---------- Finale lattice: a field of stretched crescendo hairpins.
 * WebGL2 fragment shader draws the grid as a signed-distance field — real
 * hairpin notation (2.5:1), hundreds of glyphs, per-cell randomness from an
 * in-shader hash, with a quiet left -> loud right resting ramp. anime.js
 * choreographs the uniforms: ambient waves sweep left -> right at random
 * intervals, the cursor lifts nearby glyphs, and pressing the mouse rings
 * a ripple out from the pressed point. Falls back to the DOM chevron
 * lattice when WebGL2 is unavailable; static under reduced motion. */
const FINALE_FRAG = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uWaveX;
uniform float uWaveAmp;
uniform vec2 uClick;
uniform float uClickR;
uniform float uClickAmp;
uniform vec2 uPointer;
uniform float uPointerBoost;
uniform vec3 uInk;
uniform float uCols;
out vec4 outColor;

float hash21(vec2 c) {
  return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453123);
}

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * t);
}

// tunables (driven by the floating tuner panel)
uniform int uGlyph;        // 0 hairpin · 1 chevron · 2 dot · 3 bar · 4 ring
uniform float uGlyphScale; // glyph width as a fraction of cell width
uniform float uCellAspect; // cell height / cell width (row spacing)
uniform float uStrokeK;    // stroke weight as a fraction of cell width
uniform float uRestBase;   // resting opacity
uniform float uRestRamp;   // extra resting opacity at the loud (right) edge
uniform float uWaveGain;   // ambient wave intensity
uniform int uWaveMode;     // 0 vertical · 1 sine · 2 diagonal · 3 radial · 4 interference
uniform float uWaveSkew;   // sine-front amplitude (mode 1)
uniform float uWaveFreq;   // sine/interference cycles (modes 1, 4)
uniform float uWaveTilt;   // diagonal lean (mode 2)
uniform float uProxSigma2; // cursor lift radius (2·sigma²)
uniform float uProxGain;   // cursor lift intensity

float glyphDist(vec2 q, float gw, int g) {
  if (g == 2) return length(q) - gw * 0.28; // dot (filled)
  if (g == 3) {
    vec2 b = abs(q) - vec2(gw * 0.09, gw * 0.32); // bar (filled)
    return length(max(b, vec2(0.0))) + min(max(b.x, b.y), 0.0);
  }
  if (g == 4) return abs(length(q) - gw * 0.3); // ring (stroked)
  float hr = (g == 1) ? 0.45 : 0.2; // chevron vs stretched hairpin (2.5:1)
  vec2 A = vec2(-gw * 0.5, 0.0);
  vec2 B = vec2(gw * 0.5, gw * hr);
  vec2 C = vec2(gw * 0.5, -gw * hr);
  return min(segDist(q, A, B), segDist(q, A, C));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  float cellW = aspect / uCols;
  vec2 cellSize = vec2(cellW, cellW * uCellAspect);
  vec2 ci = floor(p / cellSize);
  vec2 local = p - (ci + 0.5) * cellSize;
  float rnd = hash21(ci);

  vec2 center = (ci + 0.5) * cellSize;
  float cx = center.x / aspect;

  // the field itself is a crescendo: quieter at rest on the left
  float rest = uRestBase + uRestRamp * cx;

  // ambient wave: jittered front, random per-cell response, traversal by mode
  float cy = center.y;
  float perCell = 0.3 + 0.7 * hash21(ci + 7.31);
  float wave;
  if (uWaveMode == 3) {                 // radial rings from left-center source
    float rr = distance(vec2(cx, cy), vec2(0.0, 0.5));
    float fr = rr - (uWaveX + 0.35) + (rnd - 0.5) * 0.1;
    wave = exp(-fr * fr / 0.0072);
  } else if (uWaveMode == 4) {          // interference / standing shimmer — runs continuously off uTime
    float g1 = cos(cx * 6.2831 * uWaveFreq - uTime * 1.6);
    float g2 = cos(cy * 6.2831 * uWaveFreq * 0.7 + uTime * 1.1);
    wave = 0.5 + 0.5 * (g1 * g2);
  } else {                              // directional fronts (0 vertical · 1 sine · 2 diagonal)
    float front = uWaveX + (rnd - 0.5) * 0.1;
    if (uWaveMode == 1) front += uWaveSkew * sin(cy * 6.2831 * uWaveFreq + uWaveX * 3.0);
    else if (uWaveMode == 2) front -= (cy - 0.5) * uWaveTilt;
    float fx = cx - front;
    wave = exp(-fx * fx / 0.0072);
  }
  wave *= uWaveAmp * uWaveGain * perCell;

  // press ripple: a ring expanding from the pressed point
  vec2 cpos = vec2(uClick.x * aspect, uClick.y);
  float ring = distance(vec2(center.x, center.y), cpos) - uClickR;
  float ripple = exp(-ring * ring / 0.005) * uClickAmp * (0.45 + 0.55 * hash21(ci + 3.77));

  // cursor proximity lift
  vec2 dp = vec2(center.x - uPointer.x * aspect, center.y - uPointer.y);
  float prox = exp(-dot(dp, dp) / uProxSigma2) * uPointerBoost * uProxGain;

  float boost = min(wave + ripple + prox, 1.0);
  float alpha = rest + boost * 0.8;
  float scale = 1.0 + boost * 0.45;

  vec2 q = local / scale;
  float gw = cellW * uGlyphScale;
  float d = glyphDist(q, gw, uGlyph) * scale;
  bool filled = (uGlyph == 2 || uGlyph == 3);
  float edge = filled ? 0.0 : uStrokeK * cellW * (1.0 + boost * 0.6);
  float aa = 1.2 * aspect / uResolution.x;
  float mask = 1.0 - smoothstep(edge - aa, edge + aa, d);

  float a = alpha * mask;
  outColor = vec4(uInk * a, a); // premultiplied over the gradient beneath
}`;

/* Tunable parameters for the finale field — read every frame by the shader
 * driver and live-editable via the floating tuner panel (js/tuner.js). */
const FINALE_DEFAULTS = {
  // Ryan's picks, 2026-07-15 draft review round 6
  glyph: 3, // 0 hairpin · 1 chevron · 2 dot · 3 bar · 4 ring
  spacingPx: 20, // cell width in CSS px (smaller = denser)
  cellAspect: 0.72, // row height as a fraction of cell width
  glyphScale: 0.3, // glyph width as a fraction of cell width
  strokeK: 0.015, // stroke weight as a fraction of cell width
  restBase: 0, // resting opacity
  restRamp: 0.015, // extra resting opacity at the loud edge
  waveGain: 0.9, // ambient wave intensity
  waveMode: 0, // 0 vertical · 1 sine · 2 diagonal · 3 radial · 4 interference
  waveSkew: 0.08, // sine-front amplitude (mode 1)
  waveFreq: 1.5, // sine/interference cycles (modes 1, 4)
  waveTilt: 0.3, // diagonal lean (mode 2)
  resCap: 0, // 0 full res · 1 cap at 1× dpr (perf test toggle)
  sweepMs: 4500, // ambient wave travel time
  gapMs: 6200, // max random silence between waves
  proxRadius: 0.125, // cursor lift radius (fraction of band height)
  proxGain: 0.2, // cursor lift intensity
  rippleMs: 2250, // press ripple travel time
};
window.finaleTune = { ...FINALE_DEFAULTS };
window.finaleTuneDefaults = { ...FINALE_DEFAULTS };

const finale = document.querySelector('.finale');

function startFinaleShader(gl, fc) {
  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || 'finale shader compile failed');
    }
    return sh;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FINALE_FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || 'finale program link failed');
  }
  gl.useProgram(prog);

  const loc = {};
  for (const name of [
    'uResolution',
    'uTime',
    'uWaveX',
    'uWaveAmp',
    'uClick',
    'uClickR',
    'uClickAmp',
    'uPointer',
    'uPointerBoost',
    'uInk',
    'uCols',
    'uGlyph',
    'uGlyphScale',
    'uCellAspect',
    'uStrokeK',
    'uRestBase',
    'uRestRamp',
    'uWaveGain',
    'uWaveMode',
    'uWaveSkew',
    'uWaveFreq',
    'uWaveTilt',
    'uProxSigma2',
    'uProxGain',
  ]) {
    loc[name] = gl.getUniformLocation(prog, name);
  }
  gl.uniform3fv(loc.uInk, resolveColor('--primary', '#b79ded', finale));
  const tune = window.finaleTune;

  const fu = {
    waveX: -0.4,
    waveAmp: reducedMotion ? 0 : 1,
    clickX: 0.5,
    clickY: 0.5,
    clickR: 0,
    clickAmp: 0,
    px: 0.5,
    py: 0.5,
    pBoost: 0,
  };

  let inView = false;
  let rafId = null;
  let lastDrawT = 0;
  const FRAME_MS = 1000 / 30; // 30fps lock — decorative field, no need for 60

  // canvas backing store; resCap toggle caps at 1× dpr for the perf test
  function syncSize() {
    const dpr = tune.resCap ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(fc.clientWidth * dpr);
    const h = Math.round(fc.clientHeight * dpr);
    if (w === fc.width && h === fc.height) return;
    fc.width = w;
    fc.height = h;
    gl.viewport(0, 0, w, h);
  }

  function draw() {
    syncSize();
    gl.uniform2f(loc.uResolution, fc.width, fc.height);
    gl.uniform1f(loc.uTime, performance.now() / 1000);
    gl.uniform1f(loc.uCols, Math.min(200, Math.max(8, Math.round(fc.clientWidth / tune.spacingPx))));
    gl.uniform1i(loc.uGlyph, tune.glyph | 0);
    gl.uniform1f(loc.uGlyphScale, tune.glyphScale);
    gl.uniform1f(loc.uCellAspect, tune.cellAspect);
    gl.uniform1f(loc.uStrokeK, tune.strokeK);
    gl.uniform1f(loc.uRestBase, tune.restBase);
    gl.uniform1f(loc.uRestRamp, tune.restRamp);
    gl.uniform1f(loc.uWaveGain, tune.waveGain);
    gl.uniform1i(loc.uWaveMode, tune.waveMode | 0);
    gl.uniform1f(loc.uWaveSkew, tune.waveSkew);
    gl.uniform1f(loc.uWaveFreq, tune.waveFreq);
    gl.uniform1f(loc.uWaveTilt, tune.waveTilt);
    gl.uniform1f(loc.uProxSigma2, 2 * tune.proxRadius * tune.proxRadius);
    gl.uniform1f(loc.uProxGain, tune.proxGain);
    gl.uniform1f(loc.uWaveX, fu.waveX);
    gl.uniform1f(loc.uWaveAmp, fu.waveAmp);
    gl.uniform2f(loc.uClick, fu.clickX, fu.clickY);
    gl.uniform1f(loc.uClickR, fu.clickR);
    gl.uniform1f(loc.uClickAmp, fu.clickAmp);
    gl.uniform2f(loc.uPointer, fu.px, fu.py);
    gl.uniform1f(loc.uPointerBoost, fu.pBoost);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    rafId = null;
    now = now || performance.now();
    if (now - lastDrawT >= FRAME_MS) {
      lastDrawT = now;
      draw();
    }
    if (!reducedMotion && inView && !document.hidden) {
      rafId = requestAnimationFrame(frame);
    }
  }
  function wake() {
    if (rafId === null && inView && !document.hidden && !reducedMotion) {
      rafId = requestAnimationFrame(frame);
    }
  }
  // one-shot immediate redraw for the tuner / resize when the loop is idle
  window.finaleRedraw = () => {
    draw();
  };

  new ResizeObserver(() => {
    if (rafId === null) draw();
  }).observe(fc);
  draw(); // initial paint (also sizes the canvas)

  if (reducedMotion) {
    return; // static resting field, no loop
  }

  // ambient waves on randomized intervals
  let gapTimer = null;
  let sweeping = false;
  function sweep() {
    sweeping = true;
    animate(fu, {
      waveX: [-0.35, 1.35],
      duration: tune.sweepMs * (0.85 + Math.random() * 0.3),
      ease: 'inOutSine',
      onComplete: () => {
        sweeping = false;
        gapTimer = setTimeout(() => {
          gapTimer = null;
          if (inView) sweep();
        }, 500 + Math.random() * tune.gapMs);
      },
    });
  }

  new IntersectionObserver(
    (entries) => {
      inView = entries[0].isIntersecting;
      wake();
      if (inView && !sweeping && gapTimer === null) sweep();
      if (!inView && gapTimer !== null) {
        clearTimeout(gapTimer);
        gapTimer = null;
      }
    },
    { threshold: 0.05 }
  ).observe(finale);
  document.addEventListener('visibilitychange', wake);

  finale.addEventListener('pointermove', (e) => {
    const r = fc.getBoundingClientRect();
    animate(fu, {
      px: (e.clientX - r.left) / r.width,
      py: 1 - (e.clientY - r.top) / r.height,
      pBoost: 1,
      duration: 300,
      ease: 'outQuint',
    });
  });
  finale.addEventListener('pointerleave', () =>
    animate(fu, { pBoost: 0, duration: 900, ease: 'outSine' })
  );
  finale.addEventListener('pointerdown', (e) => {
    const r = fc.getBoundingClientRect();
    fu.clickX = (e.clientX - r.left) / r.width;
    fu.clickY = 1 - (e.clientY - r.top) / r.height;
    animate(fu, { clickR: [0, 2.2], clickAmp: [1, 0], duration: tune.rippleMs, ease: 'outSine' });
  });
}

/* DOM chevron lattice — fallback when WebGL2 is unavailable */
function buildDomLattice() {
  const grid = document.createElement('div');
  grid.className = 'finale-lattice';
  grid.setAttribute('aria-hidden', 'true');
  const COLS = 14;
  const ROWS = 8;
  const cells = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const sp = document.createElement('span');
    sp.textContent = '<';
    grid.appendChild(sp);
    cells.push(sp);
  }
  finale.prepend(grid);

  if (!reducedMotion) {
    const BASE = 0.07;
    // each cell's own voice: random peak, size, and timing jitter
    const voice = cells.map(() => ({
      peak: 0.22 + Math.random() * 0.42,
      scale: 1.12 + Math.random() * 0.45,
      jitter: Math.random() * 280,
    }));

    let inView = false;
    let sweepTimer = null;
    function sweep() {
      cells.forEach((el, i) => {
        const col = i % COLS;
        const v = voice[i];
        animate(el, {
          opacity: [BASE, v.peak, BASE],
          scale: [1, v.scale, 1],
          duration: 950,
          delay: col * 85 + v.jitter,
          ease: 'inOutSine',
        });
      });
      const total = COLS * 85 + 280 + 950;
      sweepTimer = setTimeout(() => {
        sweepTimer = null;
        if (inView) sweep();
      }, total + 600 + Math.random() * 3200);
    }
    new IntersectionObserver(
      (entries) => {
        inView = entries[0].isIntersecting;
        if (inView && sweepTimer === null) sweep();
        if (!inView && sweepTimer !== null) {
          clearTimeout(sweepTimer);
          sweepTimer = null;
        }
      },
      { threshold: 0.05 }
    ).observe(finale);

    // the cursor lifts nearby cells
    const lastBoost = new Float32Array(cells.length);
    let hoverRaf = null;
    finale.addEventListener('pointermove', (e) => {
      if (hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = null;
        const r = grid.getBoundingClientRect();
        const cw = r.width / COLS;
        const ch = r.height / ROWS;
        const R2 = 2 * 140 * 140 * 0.35;
        cells.forEach((el, i) => {
          const cx = r.left + ((i % COLS) + 0.5) * cw;
          const cy = r.top + (Math.floor(i / COLS) + 0.5) * ch;
          const dx = cx - e.clientX;
          const dy = cy - e.clientY;
          const boost = Math.exp(-(dx * dx + dy * dy) / R2);
          if (Math.abs(boost - lastBoost[i]) > 0.04) {
            lastBoost[i] = boost;
            animate(el, {
              opacity: BASE + boost * 0.75,
              scale: 1 + boost * 0.5,
              duration: 180,
              ease: 'outQuad',
            });
          }
        });
      });
    });
    finale.addEventListener('pointerleave', () => {
      cells.forEach((el, i) => {
        if (lastBoost[i] > 0.02) {
          lastBoost[i] = 0;
          animate(el, { opacity: BASE, scale: 1, duration: 650, ease: 'outSine' });
        }
      });
    });

    // pressing the mouse generates a wave from the pressed cell
    finale.addEventListener('pointerdown', (e) => {
      const r = grid.getBoundingClientRect();
      const col = Math.min(COLS - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * COLS)));
      const row = Math.min(ROWS - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * ROWS)));
      cells.forEach((el, i) => {
        const dc = (i % COLS) - col;
        const dr = Math.floor(i / COLS) - row;
        const dist = Math.hypot(dc, dr);
        const v = voice[i];
        animate(el, {
          opacity: [Math.min(0.95, v.peak + 0.35), BASE],
          scale: [Math.min(1.8, v.scale + 0.25), 1],
          duration: 750,
          delay: dist * 55 + v.jitter * 0.25,
          ease: 'outSine',
        });
      });
    });
  }
}

/* ---------- boot ---------- */
if (finale) {
  const fc = document.createElement('canvas');
  fc.className = 'finale-canvas';
  fc.setAttribute('aria-hidden', 'true');
  finale.prepend(fc);
  let fgl = null;
  try {
    fgl = fc.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
  } catch {
    fgl = null;
  }
  if (fgl) {
    try {
      startFinaleShader(fgl, fc);
    } catch {
      fc.remove();
      buildDomLattice();
    }
  } else {
    fc.remove();
    buildDomLattice();
  }
}

if (hero && canvas) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
  } catch {
    gl = null;
  }
  if (gl) {
    try {
      startWebGL(gl);
    } catch {
      buildLattice();
      playEntry();
    }
  } else {
    buildLattice();
    playEntry();
  }
}
