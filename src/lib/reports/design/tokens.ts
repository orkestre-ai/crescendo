/**
 * The design tokens of every report: one palette in two themes, and a
 * spacing and type scale. Block styles may use these and nothing else for
 * colour, so a block built later sits beside the built-in ones.
 */

export const COLOR_TOKENS = [
  'bg',
  'surface',
  'card',
  'text',
  'text-2',
  'muted',
  'line',
  'grid',
  'accent',
  's1',
  's2',
  'up',
  'down',
  'flag-bg',
  'flag-line',
] as const;

type ColorToken = (typeof COLOR_TOKENS)[number];

export const LIGHT: Record<ColorToken, string> = {
  bg: '#fcfcfb',
  surface: '#f3f3f0',
  card: '#ffffff',
  text: '#1c1c1a',
  'text-2': '#4a4a45',
  muted: '#6b6b64',
  line: '#e2e1dc',
  grid: '#ecebe7',
  accent: '#1c5cab',
  s1: '#2a78d6',
  s2: '#eb6834',
  up: '#146c2e',
  down: '#a3332b',
  'flag-bg': '#fff3e8',
  'flag-line': '#f0b48c',
};

export const DARK: Record<ColorToken, string> = {
  bg: '#1a1a19',
  surface: '#242422',
  card: '#20201e',
  text: '#f0efec',
  'text-2': '#c3c2b7',
  muted: '#9b9a90',
  line: '#3a3a36',
  grid: '#2e2e2b',
  accent: '#86b6ef',
  s1: '#3987e5',
  s2: '#d95926',
  up: '#6fcf8a',
  down: '#f08a80',
  'flag-bg': '#3a2a1d',
  'flag-line': '#8a5a36',
};

/** Spacing, type sizes, radii and the text measure. The same in both themes. */
export const SCALE: Record<string, string> = {
  'sp-1': '4px',
  'sp-2': '8px',
  'sp-3': '12px',
  'sp-4': '16px',
  'sp-5': '20px',
  'sp-6': '24px',
  'sp-7': '32px',
  'sp-8': '48px',
  'sp-9': '64px',
  'fs-xs': '12px',
  'fs-sm': '13px',
  'fs-md': '14px',
  'fs-body': '16px',
  'fs-lg': '19px',
  'fs-xl': '26px',
  'fs-2xl': 'clamp(28px, 5vw, 40px)',
  radius: '10px',
  'radius-sm': '6px',
  // The widest a line of running text gets.
  measure: '720px',
};

/** Every custom property a block's styles may read, without the leading dashes. */
export const TOKEN_NAMES: ReadonlySet<string> = new Set([...COLOR_TOKENS, ...Object.keys(SCALE)]);

const declarations = (values: Record<string, string>) =>
  Object.entries(values)
    .map(([name, value]) => `--${name}: ${value};`)
    .join(' ');

/**
 * The token block. Light values sit on :root; dark values apply when the
 * reader's system asks for dark, unless the theme was set to light by hand,
 * and again when it was set to dark by hand.
 */
export function tokensCss(): string {
  const light = `${declarations(LIGHT)} ${declarations(SCALE)} color-scheme: light;`;
  const dark = `${declarations(DARK)} color-scheme: dark;`;
  return [
    `:root { ${light} }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${dark} } }`,
    `:root[data-theme="dark"] { ${dark} }`,
  ].join('\n');
}

/** The light palette again, for print: a page is always printed light. */
export function lightTokensCss(selector: string): string {
  return `${selector} { ${declarations(LIGHT)} color-scheme: light; }`;
}
