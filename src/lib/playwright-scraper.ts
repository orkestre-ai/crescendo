import { chromium, type Browser } from 'playwright';
import type { RuntimeGatewayData, ENRuntimeRaw } from '@/types/gateway';
import type { PageDiagnostics, FailedRequest, ConsoleEntry } from '@/types';
import { isRebrowserEnabled, getProxyConfig } from '@/config/env';
import {
  PLAYWRIGHT_NAVIGATION_TIMEOUT_MS,
  PLAYWRIGHT_SELECTOR_TIMEOUT_MS,
  PLAYWRIGHT_JS_SETTLE_MS,
  PLAYWRIGHT_VIEWPORT_SETTLE_MS,
  BROWSER_IDLE_TIMEOUT_MS,
} from '@/config/constants';
import { rootLogger } from '@/lib/logging';

const log = rootLogger.child({ journey: 'playwright' });

export interface PlaywrightScrapeResult {
  html: string;
  runtimeGateway: RuntimeGatewayData | null;
  enRuntimeRaw: ENRuntimeRaw | null;
}

// Browser idle cleanup tracking
let activeScrapeCount = 0;
let idleCleanupTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer(): void {
  if (idleCleanupTimer) {
    clearTimeout(idleCleanupTimer);
    idleCleanupTimer = null;
  }
}

function startIdleTimer(): void {
  resetIdleTimer();
  idleCleanupTimer = setTimeout(() => {
    if (activeScrapeCount === 0) {
      log.info({ event: 'playwright.idle.cleanup' }, 'Idle timeout reached, closing browser instances');
      closeBrowser().catch((err) => {
        log.error({ event: 'playwright.idle.cleanup.error', err: err instanceof Error ? err : undefined }, 'Error during idle cleanup');
      });
    }
    idleCleanupTimer = null;
  }, BROWSER_IDLE_TIMEOUT_MS);
}

function trackScrapeStart(): void {
  activeScrapeCount++;
  resetIdleTimer();
}

function trackScrapeEnd(): void {
  activeScrapeCount = Math.max(0, activeScrapeCount - 1);
  if (activeScrapeCount === 0) {
    startIdleTimer();
  }
}

// Browser singleton -- reuse across scrapes for performance
let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserInstance;
}

// Scraping browser singleton — uses rebrowser when enabled, vanilla Playwright otherwise
let scrapingBrowserInstance: Browser | null = null;
let scrapingEngineLogged = false;
let proxyLogged = false;

async function getScrapingBrowser(): Promise<Browser> {
  if (!scrapingBrowserInstance || !scrapingBrowserInstance.isConnected()) {
    const useRebrowser = isRebrowserEnabled();
    let engine: typeof chromium;
    if (useRebrowser) {
      try {
        const mod = await import('rebrowser-playwright');
        engine = mod.chromium as unknown as typeof chromium;
      } catch {
        log.warn({ event: 'playwright.rebrowser.fallback' }, 'rebrowser-playwright not installed — falling back to vanilla Playwright');
        engine = (await import('playwright')).chromium;
      }
    } else {
      engine = (await import('playwright')).chromium;
    }

    if (!scrapingEngineLogged) {
      log.info({ event: 'playwright.engine', engine: useRebrowser ? 'rebrowser-playwright' : 'vanilla Playwright' }, `Using ${useRebrowser ? 'rebrowser-playwright' : 'vanilla Playwright'} for scraping`);
      scrapingEngineLogged = true;
    }

    scrapingBrowserInstance = await engine.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return scrapingBrowserInstance!;
}

export async function closeBrowser(): Promise<void> {
  // Defer when other scrapes are still in flight — closing the singleton would
  // kill their contexts mid-flight (TargetClosedError). The idle timer started
  // by trackScrapeEnd() will eventually clean up once everyone is done.
  if (activeScrapeCount > 0) {
    log.info(
      { event: 'playwright.close.deferred', activeScrapeCount },
      'Browser close deferred — scrapes in progress'
    );
    return;
  }
  resetIdleTimer();
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
  if (scrapingBrowserInstance) {
    await scrapingBrowserInstance.close();
    scrapingBrowserInstance = null;
  }
}

export async function scrapeWithBrowser(
  url: string,
  options: { timeoutMs?: number } = {}
): Promise<PlaywrightScrapeResult> {
  trackScrapeStart();
  const timeoutMs = options.timeoutMs ?? PLAYWRIGHT_NAVIGATION_TIMEOUT_MS;
  const browser = await getScrapingBrowser();
  const proxyConfig = getProxyConfig();
  if (proxyConfig && !proxyLogged) {
    log.info({ event: 'playwright.proxy.enabled', server: proxyConfig.server }, `Webshare proxy enabled (${proxyConfig.server})`);
    proxyLogged = true;
  }
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...(proxyConfig && { proxy: proxyConfig }),
  });
  const page = await context.newPage();

  try {
    // Use domcontentloaded instead of networkidle -- EN pages have persistent
    // analytics connections that prevent networkidle from ever resolving
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    // Wait for EN-specific content to be present (donation form, page scripts)
    // This ensures Cloudflare challenge has been solved and page is fully loaded
    await page
      .waitForSelector('form, .en__component, script[src]', { timeout: PLAYWRIGHT_SELECTOR_TIMEOUT_MS })
      .catch(() => {
        // Not all pages have forms -- this is a best-effort wait
      });

    // Brief additional wait for JS-injected content (gateway variables, etc.)
    await page.waitForTimeout(PLAYWRIGHT_JS_SETTLE_MS);

    // Extract EN runtime data before capturing HTML.
    // window.EngagingNetworks is injected by EN's JS at runtime — not in static HTML.
    let runtimeGateway: RuntimeGatewayData | null = null;
    let enRuntimeRaw: ENRuntimeRaw | null = null;
    try {
      const enData = await page.evaluate(() => {
        const en = (window as any).EngagingNetworks;
        if (!en) return null;

        // Extract currency from DOM
        const currencyInput = document.querySelector(
          'input[name="transaction.paycurrency"]'
        ) as HTMLInputElement | null;

        return {
          paymentGateways: Array.isArray(en.paymentGateways) ? en.paymentGateways : [],
          vault: en.vault ?? null,
          feeCover: en.feeCover ?? null,
          altLists: Array.isArray(en.altLists) ? en.altLists : [],
          dependencies: Array.isArray(en.dependencies) ? en.dependencies : [],
          validators: Array.isArray(en.validators) ? en.validators : [],
          currency: currencyInput?.value || null,
        };
      });

      if (enData) {
        runtimeGateway = {
          gateways: enData.paymentGateways.length > 0 ? enData.paymentGateways : null,
          vault: enData.vault,
        };
        enRuntimeRaw = enData;
      }
    } catch {
      // evaluate() can fail if page context is destroyed — graceful fallback
    }

    const html = await page.content();
    return { html, runtimeGateway, enRuntimeRaw };
  } finally {
    // Cleanup must not fail an already-successful scrape. Context can already
    // be closed if the shared browser was torn down by a concurrent job.
    await context.close().catch((err) => {
      log.warn(
        { event: 'playwright.context.close.failed', err: err instanceof Error ? err : undefined },
        'context.close() failed during scrapeWithBrowser cleanup'
      );
    });
    trackScrapeEnd();
  }
}

export interface DiagnosticsResult {
  diagnostics: PageDiagnostics;
  mobileScreenshot: Buffer;
}

const MAX_CONSOLE_ENTRIES = 50;
const MAX_URL_LENGTH = 200;

export interface PageBundleNeeds {
  html?: boolean;
  desktopShot?: boolean;
  mobileShot?: boolean;
  diagnostics?: boolean;
}

export interface PageBundleResult {
  html?: string;
  runtimeGateway?: RuntimeGatewayData | null;
  enRuntimeRaw?: ENRuntimeRaw | null;
  desktopScreenshot?: Buffer;
  mobileScreenshot?: Buffer;
  diagnostics?: PageDiagnostics;
}

/**
 * One Playwright navigation, returns whichever artifacts the caller asked for.
 * Replaces back-to-back captureScreenshot + capturePageDiagnostics + scrapeWithBrowser
 * trips when several are needed for the same URL (FILLING_MISSING gap fill).
 */
export async function capturePageBundle(
  url: string,
  needs: PageBundleNeeds,
  options: { timeoutMs?: number; desktopWidth?: number } = {}
): Promise<PageBundleResult> {
  if (!needs.html && !needs.desktopShot && !needs.mobileShot && !needs.diagnostics) {
    return {};
  }

  trackScrapeStart();
  const timeoutMs = options.timeoutMs ?? PLAYWRIGHT_NAVIGATION_TIMEOUT_MS;
  const desktopWidth = options.desktopWidth ?? 1280;

  // Use the scraping browser if we need HTML or diagnostics (rebrowser CF bypass).
  // Pure screenshot work uses the lighter screenshot browser.
  const wantsScrapingBrowser = needs.html || needs.diagnostics;
  const browser = wantsScrapingBrowser ? await getScrapingBrowser() : await getBrowser();

  const proxyConfig = wantsScrapingBrowser ? getProxyConfig() : null;
  if (proxyConfig && !proxyLogged) {
    log.info({ event: 'playwright.proxy.enabled', server: proxyConfig.server }, `Webshare proxy enabled (${proxyConfig.server})`);
    proxyLogged = true;
  }

  const context = await browser.newContext({
    viewport: { width: desktopWidth, height: 800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...(proxyConfig && { proxy: proxyConfig }),
  });
  const page = await context.newPage();

  // Diagnostics collectors — only attached if requested
  const consoleErrors: ConsoleEntry[] = [];
  const consoleWarnings: ConsoleEntry[] = [];
  const jsExceptions: string[] = [];
  const failedRequests: FailedRequest[] = [];
  let totalRequests = 0;
  let totalTransferSizeBytes = 0;

  if (needs.diagnostics) {
    page.on('console', (msg) => {
      const type = msg.type();
      const entry: ConsoleEntry = {
        text: msg.text().slice(0, 500),
        url: msg.location()?.url?.slice(0, MAX_URL_LENGTH),
        lineNumber: msg.location()?.lineNumber,
      };
      if (type === 'error' && consoleErrors.length < MAX_CONSOLE_ENTRIES) {
        consoleErrors.push(entry);
      } else if (type === 'warning' && consoleWarnings.length < MAX_CONSOLE_ENTRIES) {
        consoleWarnings.push(entry);
      }
    });
    page.on('pageerror', (error) => {
      if (jsExceptions.length < MAX_CONSOLE_ENTRIES) {
        jsExceptions.push(error.message.slice(0, 500));
      }
    });
    page.on('response', (response) => {
      totalRequests++;
      const contentLength = parseInt(response.headers()['content-length'] || '0', 10);
      if (!isNaN(contentLength)) totalTransferSizeBytes += contentLength;
      const status = response.status();
      if (status >= 400 && failedRequests.length < MAX_CONSOLE_ENTRIES) {
        failedRequests.push({
          url: response.url().slice(0, MAX_URL_LENGTH),
          status,
          resourceType: response.request().resourceType(),
        });
      }
    });
    page.on('requestfailed', (request) => {
      if (failedRequests.length < MAX_CONSOLE_ENTRIES) {
        failedRequests.push({
          url: request.url().slice(0, MAX_URL_LENGTH),
          status: null,
          resourceType: request.resourceType(),
        });
      }
    });
  }

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page
      .waitForSelector('form, .en__component, script[src]', { timeout: PLAYWRIGHT_SELECTOR_TIMEOUT_MS })
      .catch(() => {});
    await page.waitForTimeout(PLAYWRIGHT_JS_SETTLE_MS);

    const result: PageBundleResult = {};

    // EN runtime data is needed when HTML is requested (powers gateway / fee-cover detection)
    if (needs.html) {
      try {
        const enData = await page.evaluate(() => {
          const en = (window as any).EngagingNetworks;
          if (!en) return null;
          const currencyInput = document.querySelector(
            'input[name="transaction.paycurrency"]'
          ) as HTMLInputElement | null;
          return {
            paymentGateways: Array.isArray(en.paymentGateways) ? en.paymentGateways : [],
            vault: en.vault ?? null,
            feeCover: en.feeCover ?? null,
            altLists: Array.isArray(en.altLists) ? en.altLists : [],
            dependencies: Array.isArray(en.dependencies) ? en.dependencies : [],
            validators: Array.isArray(en.validators) ? en.validators : [],
            currency: currencyInput?.value || null,
          };
        });
        if (enData) {
          result.runtimeGateway = {
            gateways: enData.paymentGateways.length > 0 ? enData.paymentGateways : null,
            vault: enData.vault,
          };
          result.enRuntimeRaw = enData;
        } else {
          result.runtimeGateway = null;
          result.enRuntimeRaw = null;
        }
      } catch {
        result.runtimeGateway = null;
        result.enRuntimeRaw = null;
      }
    }

    // Capture load timing while we're still in desktop viewport
    let timing = { loadTimeMs: 0, domContentLoadedMs: 0 };
    if (needs.diagnostics) {
      timing = await page.evaluate(() => {
        const perf = performance.getEntriesByType('navigation')[0] as
          | PerformanceNavigationTiming
          | undefined;
        if (!perf) return { loadTimeMs: 0, domContentLoadedMs: 0 };
        return {
          loadTimeMs: Math.round(perf.loadEventEnd - perf.startTime),
          domContentLoadedMs: Math.round(perf.domContentLoadedEventEnd - perf.startTime),
        };
      });
    }

    // Desktop screenshot (before viewport switch)
    if (needs.desktopShot) {
      const buf = await page.screenshot({ fullPage: true, type: 'png' });
      result.desktopScreenshot = Buffer.from(buf);
    }

    // HTML capture — must happen before viewport switch so it's the desktop DOM
    if (needs.html) {
      result.html = await page.content();
    }

    // Mobile viewport for mobile screenshot
    if (needs.mobileShot) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(PLAYWRIGHT_VIEWPORT_SETTLE_MS);
      const buf = await page.screenshot({ fullPage: true, type: 'png' });
      result.mobileScreenshot = Buffer.from(buf);
    }

    if (needs.diagnostics) {
      result.diagnostics = {
        loadTimeMs: timing.loadTimeMs,
        domContentLoadedMs: timing.domContentLoadedMs,
        totalRequests,
        failedRequests,
        totalTransferSizeKb: Math.round(totalTransferSizeBytes / 1024),
        consoleErrors,
        consoleWarnings,
        jsExceptions,
        capturedAt: new Date().toISOString(),
      };
    }

    return result;
  } finally {
    await context.close().catch((err) => {
      log.warn(
        { event: 'playwright.context.close.failed', err: err instanceof Error ? err : undefined },
        'context.close() failed during capturePageBundle cleanup'
      );
    });
    trackScrapeEnd();
  }
}

/**
 * Capture a full-page desktop screenshot. Thin wrapper around capturePageBundle.
 */
export async function captureScreenshot(
  url: string,
  options: { timeoutMs?: number; width?: number } = {}
): Promise<Buffer> {
  const bundle = await capturePageBundle(
    url,
    { desktopShot: true },
    { timeoutMs: options.timeoutMs, desktopWidth: options.width }
  );
  if (!bundle.desktopScreenshot) {
    throw new Error(`captureScreenshot: no screenshot returned for ${url}`);
  }
  return bundle.desktopScreenshot;
}

/**
 * Capture page diagnostics + mobile screenshot. Thin wrapper around capturePageBundle.
 */
export async function capturePageDiagnostics(
  url: string,
  options: { timeoutMs?: number } = {}
): Promise<DiagnosticsResult> {
  const bundle = await capturePageBundle(
    url,
    { diagnostics: true, mobileShot: true },
    { timeoutMs: options.timeoutMs }
  );
  if (!bundle.diagnostics || !bundle.mobileScreenshot) {
    throw new Error(`capturePageDiagnostics: incomplete bundle for ${url}`);
  }
  return {
    diagnostics: bundle.diagnostics,
    mobileScreenshot: bundle.mobileScreenshot,
  };
}
