import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import { PageScraper } from '@/lib/scraper';
import type { PageContent } from '@/types';

test('scrapePage returns rawHtml in the payload', async () => {
  const html =
    '<html><head><title>t</title></head><body><h1>Hello</h1><button type="submit">Donate</button></body></html>';

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  // PageScraper.isAllowedUrl is private and enforces an EN-domain allowlist.
  // We bypass it at runtime (not type-level) by patching the instance via `any`
  // so we can hit a local test server without subclassing.
  const scraper = new PageScraper();
  (scraper as any).isAllowedUrl = () => true;

  try {
    const result = await scraper.scrapePage(`http://127.0.0.1:${port}/`);
    assert.equal(result.rawHtml, html);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('PageContent type includes optional rawHtml field', () => {
  // Compile-time contract: rawHtml must be assignable as string | null | undefined.
  const content: PageContent = {
    url: 'https://example.org',
    h1: null,
    metaDescription: null,
    cta: [],
    donationAmounts: [],
    scrapedAt: new Date(),
    rawHtml: '<html></html>',
  };
  assert.equal(content.rawHtml, '<html></html>');

  const contentNoHtml: PageContent = {
    url: 'https://example.org',
    h1: null,
    metaDescription: null,
    cta: [],
    donationAmounts: [],
    scrapedAt: new Date(),
  };
  assert.equal(contentNoHtml.rawHtml, undefined);
});
