import axios from 'axios';
import * as cheerio from 'cheerio';
import { createAiToolLogger } from '@/lib/logging/journeys';
import { getOrCreateSettings } from '@/lib/settings';
import type { ToolSkill } from './types';

export const orgSearchTool: ToolSkill = {
  schema: {
    name: 'org_search',
    description:
      "Fetch and read a page from the organization's website, or search the org's domain for relevant content. Use this to understand campaign context and generate grounded content suggestions.",
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: "Full URL to fetch from the org's website. Must be on the org's domain.",
        },
        searchQuery: {
          type: 'string',
          description:
            "Search query to run scoped to the org's domain. Provide this OR url, not both.",
        },
        orgDomain: {
          type: 'string',
          description:
            "The organization's website domain (e.g., oxfam.ca). Required for domain validation.",
        },
      },
      required: ['orgDomain'],
    },
  },

  instructions: `Use this tool to understand the campaign, cause, or subject matter that a donation page supports. This helps you generate content suggestions grounded in the organization's own messaging.

Two modes:
1. URL mode: provide a specific URL from the org's website to fetch and read
2. Search mode: provide a searchQuery to find relevant pages on the org's domain

IMPORTANT: Only search or fetch from the specified orgDomain. Never fabricate campaign details — use this tool to verify facts about the organization and its campaigns.`,

  async execute(params) {
    const toolLog = createAiToolLogger('org_search');
    const start = Date.now();

    const { url, searchQuery, orgDomain } = params as {
      url?: string;
      searchQuery?: string;
      orgDomain: string;
    };

    try {
      // Check domain allowlist from settings
      const settings = await getOrCreateSettings();
      const allowedDomains = settings.aiOrgSearchDomains;
      if (allowedDomains.length > 0) {
        let domainToCheck: string | null = orgDomain;
        if (url) {
          try { domainToCheck = new URL(url).hostname; } catch { domainToCheck = null; }
        }
        if (domainToCheck && !allowedDomains.some((d) => domainToCheck === d || domainToCheck.endsWith(`.${d}`))) {
          return { data: null, summary: 'Domain not allowed', error: `Domain "${domainToCheck}" is not in the allowed domains list: ${allowedDomains.join(', ')}` };
        }
      }

      if (url) {
        // Validate URL is on org domain
        try {
          const parsed = new URL(url);
          if (!parsed.hostname.endsWith(orgDomain)) {
            return { data: null, summary: 'URL rejected', error: `URL must be on ${orgDomain}` };
          }
        } catch {
          return { data: null, summary: 'Invalid URL', error: 'Could not parse the provided URL' };
        }

        // Fetch and extract text
        const response = await axios.get(url, {
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ENOptimizer/1.0)' },
        });

        const $ = cheerio.load(response.data);
        $('script, style, nav, footer, header').remove();
        const title = $('title').text().trim();
        const text = $('main, article, .content, body')
          .first()
          .text()
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 3000);

        toolLog.orgSearch(url, 1);
        toolLog.executed(orgDomain, Date.now() - start, 1);

        return {
          data: { title, text, url },
          summary: `Fetched "${title}" (${text.length} chars)`,
        };
      }

      if (searchQuery) {
        // Site-scoped search via DuckDuckGo HTML (no API key needed)
        const query = encodeURIComponent(`site:${orgDomain} ${searchQuery}`);
        const response = await axios.get(`https://html.duckduckgo.com/html/?q=${query}`, {
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ENOptimizer/1.0)' },
        });

        const $ = cheerio.load(response.data);
        const results: Array<{ title: string; url: string; snippet: string }> = [];

        $('.result').each((i, el) => {
          if (i >= 3) return false; // Top 3 results
          const title = $(el).find('.result__title').text().trim();
          const href = $(el).find('.result__url').text().trim();
          const snippet = $(el).find('.result__snippet').text().trim();
          if (title) results.push({ title, url: href, snippet });
        });

        toolLog.orgSearch(searchQuery, results.length);
        toolLog.executed(orgDomain, Date.now() - start, results.length);

        return {
          data: { query: searchQuery, results },
          summary: `${results.length} results found for "${searchQuery}" on ${orgDomain}`,
        };
      }

      return { data: null, summary: 'No action taken', error: 'Provide either url or searchQuery' };
    } catch (err) {
      toolLog.error(orgDomain, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  },
};
