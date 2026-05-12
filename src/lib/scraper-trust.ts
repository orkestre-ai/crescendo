import { prisma } from './db';
import { scraper } from './scraper';
import { rootLogger } from './logging';

const log = rootLogger.child({ journey: 'scraper' });

// Trust model: a URL in FundraisingPage.url was written by sync against EN's
// authenticated REST API, so its host is in-bounds for scraping — even if it's
// a custom CNAME like secured.oxfam.ca that EN routes back to its own infra.
export async function refreshScraperTrustedHostsFromDb(): Promise<void> {
  try {
    const rows = await prisma.fundraisingPage.findMany({
      where: { status: 'ACTIVE' },
      select: { url: true },
    });
    const hosts = new Set<string>();
    for (const { url } of rows) {
      if (!url) continue;
      try {
        hosts.add(new URL(url).hostname);
      } catch {
        // Skip malformed URLs
      }
    }
    scraper.setTrustedHosts(hosts);
    log.info(
      { event: 'scraper.trusted_hosts.loaded', count: hosts.size },
      `Scraper trusted hosts loaded (${hosts.size})`
    );
  } catch (err) {
    log.warn(
      { event: 'scraper.trusted_hosts.load_failed', err: err as Error },
      'Failed to load scraper trusted hosts; built-in allowlist will be used'
    );
  }
}
