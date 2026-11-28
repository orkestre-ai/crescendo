import type { Page } from 'playwright';
import { getBrowser } from '@/lib/playwright-scraper';
import { renderShell, type RenderMode } from '../design/shell';
import { renderBlock } from './engine';
import type { BlockSeed } from './types';

/**
 * Pictures of one block, and the layout checks made on the same pages: on a
 * desktop, on a phone, in the dark theme and on paper. The pages are set
 * from a string, so no server has to be running.
 */

export type ShotName = 'desktop' | 'phone' | 'dark' | 'print';
export type BlockShots = Record<ShotName, Buffer>;

// Letter is 8.5 by 11 inches at 96 pixels an inch; the margins are 18 mm.
const LETTER_MARGIN = Math.round((18 / 25.4) * 96);
export const LETTER_COLUMN = 816 - 2 * LETTER_MARGIN;
export const LETTER_PAGE_HEIGHT = 1056 - 2 * LETTER_MARGIN;
const MIN_CONTRAST = 4.5;

const VIEWS: {
  name: ShotName;
  mode: RenderMode;
  width: number;
  height: number;
  scale: number;
  dark: boolean;
}[] = [
  { name: 'desktop', mode: 'screen', width: 1280, height: 800, scale: 1, dark: false },
  { name: 'phone', mode: 'screen', width: 375, height: 812, scale: 2, dark: false },
  { name: 'dark', mode: 'screen', width: 1280, height: 800, scale: 1, dark: true },
  // Print media, as wide as the text column of a Letter page.
  {
    name: 'print',
    mode: 'print',
    width: LETTER_COLUMN,
    height: LETTER_PAGE_HEIGHT,
    scale: 2,
    dark: false,
  },
];

/** One block alone on a page, in the report's shell. */
export function blockDocument(def: BlockSeed, data: unknown, mode: RenderMode): string {
  return renderShell({
    title: def.name,
    body: renderBlock(def, data, { mode, blockId: def.key, currencyCode: 'CAD' }),
    blockCss: def.css,
    mode,
  });
}

interface Measured {
  height: number;
  isTable: boolean;
  pageOverflow: number;
  tooWide: string[];
  lowContrast: string[];
}

// Runs in the page. Reads the rendered colours and boxes; changes nothing.
function measure(minContrast: number): Measured {
  const block = document.querySelector('.blk') as HTMLElement;
  const viewport = document.documentElement.clientWidth;
  const describe = (el: Element) => {
    const cls = el.getAttribute('class');
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `<${el.tagName.toLowerCase()}${cls ? `.${cls.trim().replace(/\s+/g, '.')}` : ''}> "${text}"`;
  };

  // Nothing wider than the window, unless it sits in a box that scrolls sideways.
  const scrolls = (el: Element): boolean => {
    for (let up = el.parentElement; up && up !== block.parentElement; up = up.parentElement) {
      const overflow = getComputedStyle(up).overflowX;
      if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') return true;
    }
    return false;
  };
  const tooWide: string[] = [];
  for (const el of [block, ...block.querySelectorAll('*')]) {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    if ((box.right > viewport + 0.5 || box.left < -0.5) && !scrolls(el)) {
      tooWide.push(`${describe(el)} spans ${Math.round(box.left)} to ${Math.round(box.right)}`);
    }
  }

  // Contrast of every piece of text against what is behind it.
  const parse = (colour: string): [number, number, number, number] | null => {
    const match = /rgba?\(([^)]+)\)/.exec(colour);
    if (!match) return null;
    const parts = match[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [parts[0], parts[1], parts[2], parts[3] === undefined ? 1 : parts[3]];
  };
  const luminance = ([r, g, b]: number[]) => {
    const [x, y, z] = [r, g, b].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * x + 0.7152 * y + 0.0722 * z;
  };
  const over = (top: number[], under: number[]) =>
    [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
  const background = (el: Element): number[] => {
    const layers: number[][] = [];
    for (let up: Element | null = el; up; up = up.parentElement) {
      const colour = parse(getComputedStyle(up).backgroundColor);
      if (colour && colour[3] > 0) {
        layers.push(colour);
        if (colour[3] === 1) break;
      }
    }
    let result = [255, 255, 255];
    for (const layer of layers.reverse()) result = over(layer, result);
    return result;
  };

  const lowContrast: string[] = [];
  for (const el of block.querySelectorAll('*')) {
    const hasText = [...el.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== ''
    );
    if (!hasText) continue;
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (box.width === 0 || box.height === 0 || style.visibility === 'hidden') continue;
    // A title or description inside a drawing is read aloud, never painted.
    if (el instanceof SVGElement && !(el instanceof SVGTextContentElement)) continue;
    const ink = parse(el instanceof SVGElement ? style.fill : style.color);
    if (!ink) continue;
    const behind = background(el);
    const front = over(ink, behind);
    const [a, b] = [luminance(front), luminance(behind)];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (ratio < minContrast) lowContrast.push(`${describe(el)} is ${ratio.toFixed(2)} to 1`);
  }

  return {
    height: block.getBoundingClientRect().height,
    isTable: block.querySelector(':scope > .table-wrap') !== null,
    pageOverflow: document.documentElement.scrollWidth - viewport,
    tooWide: [...new Set(tooWide)].slice(0, 5),
    lowContrast: [...new Set(lowContrast)].slice(0, 5),
  };
}

async function open(html: string, view: (typeof VIEWS)[number]): Promise<Page> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    deviceScaleFactor: view.scale,
    colorScheme: view.dark ? 'dark' : 'light',
  });
  const page = await context.newPage();
  if (view.mode === 'print') await page.emulateMedia({ media: 'print' });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate('document.fonts.ready.then(() => undefined)');
  // tsx wraps named inner functions in a helper the page does not have.
  await page.evaluate('globalThis.__name = (fn) => fn');
  return page;
}

/**
 * Draw one block four ways and check its layout: nothing wider than a
 * phone, a height above zero, every text at 4.5 to 1 or better against its
 * background in both themes, and on paper no taller than a Letter page
 * unless it is a table. `failures` is empty when every check passes.
 */
export async function checkBlockLayout(
  def: BlockSeed,
  data: unknown
): Promise<{ shots: BlockShots; failures: string[] }> {
  const shots = {} as BlockShots;
  const failures: string[] = [];

  for (const view of VIEWS) {
    const page = await open(blockDocument(def, data, view.mode), view);
    try {
      shots[view.name] = await page.screenshot({ fullPage: true, type: 'png' });
      const found = await page.evaluate(measure, MIN_CONTRAST);

      if (found.height <= 0) failures.push(`${view.name}: the block has no height`);
      for (const item of found.lowContrast) failures.push(`${view.name}: low contrast, ${item}`);
      if (view.name === 'phone') {
        if (found.pageOverflow > 0) {
          failures.push(`phone: the page scrolls sideways by ${found.pageOverflow}px`);
        }
        for (const item of found.tooWide) failures.push(`phone: wider than the screen, ${item}`);
      }
      if (view.name === 'print' && !found.isTable && found.height > LETTER_PAGE_HEIGHT) {
        failures.push(
          `print: ${Math.round(found.height)}px tall, more than one Letter page (${LETTER_PAGE_HEIGHT}px)`
        );
      }
    } finally {
      await page.context().close();
    }
  }
  return { shots, failures };
}

/** Pictures of a block with the given data: desktop, phone, dark theme and print. */
export async function captureBlockShots(def: BlockSeed, data: unknown): Promise<BlockShots> {
  return (await checkBlockLayout(def, data)).shots;
}
