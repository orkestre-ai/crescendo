export type HelpContextKey =
  | 'dashboard'
  | 'page-detail:metrics'
  | 'page-detail:content'
  | 'page-detail:recommendations:generate'
  | 'page-detail:recommendations:explore'
  | 'page-detail:recommendations:chat'
  | 'settings:connections'
  | 'settings:sync'
  | 'settings:database'
  | 'ai-config'
  | 'ai-config:models'
  | 'ai-config:recommendations'
  | 'ai-config:explorations'
  | 'ai-config:chat-tools';

export interface MetricDefinition {
  name: string;
  description: string;
  source: string;
  format?: string;
}

export interface HelpSection {
  title: string;
  content: string;
  metrics?: MetricDefinition[];
  tips?: string[];
}

export interface HelpContext {
  title: string;
  subtitle: string;
  screenshotPath?: string;
  sections: HelpSection[];
}

export const helpContent: Record<HelpContextKey, HelpContext> = {
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Overview of all tracked fundraising pages',
    sections: [
      {
        title: 'Summary Cards',
        content:
          'Three summary cards at the top provide a high-level overview of your fundraising portfolio. All metrics are scoped to live campaigns (published and receiving public traffic) over the last 30 days.',
        metrics: [
          {
            name: 'Live Pages',
            description:
              'Count of fundraising pages with ACTIVE sync status and a live campaign status (published, receiving traffic). Secondary lines show broader counts: active pages (including new/tested) and total pages in the database.',
            source: 'EN REST API (page sync + campaign status)',
            format: 'Count',
          },
          {
            name: 'Total Donations',
            description:
              'Sum of donation transactions across all live pages in the last 30 days.',
            source: 'EN Public API (NetDonor 30-day snapshot)',
            format: 'Count',
          },
          {
            name: 'Total Revenue',
            description:
              'Sum of donation revenue across all live pages in the last 30 days, displayed in your reporting currency.',
            source: 'EN Public API (NetDonor 30-day snapshot)',
            format: 'Currency',
          },
        ],
      },
      {
        title: 'Fundraising Pages Table',
        content:
          'Each row represents one fundraising page synced from Engaging Networks. The table defaults to showing live pages only and is sorted by revenue (highest first). Use the filter box to search by name, toggle "Show Live Only" to include closed/blocked campaigns, and click the Columns dropdown to show or hide individual columns.',
        metrics: [
          {
            name: 'Status dot',
            description:
              'Coloured indicator next to the page name. Green = live campaign, active sync, last sync succeeded. Grey = campaign is closed/blocked/deleted, or sync is paused. Red = live campaign but the last sync job failed.',
            source: 'EN REST API + sync job status',
            format: 'Icon',
          },
          {
            name: 'Page Name',
            description:
              'The page name as it appears in Engaging Networks. Click to open the page detail view.',
            source: 'EN REST API',
            format: 'Text (link)',
          },
          {
            name: 'Modified',
            description:
              'When the page was last modified in Engaging Networks. Shown as relative time (e.g. "3 hours ago") for recent changes and as a date for older ones.',
            source: 'EN REST API (enModifiedAt field)',
            format: 'Relative date',
          },
          {
            name: 'Donations',
            description:
              'Total donation transaction count for this page in the last 30 days.',
            source: 'EN Public API (NetDonor 30-day snapshot)',
            format: 'Count',
          },
          {
            name: 'Revenue',
            description:
              'Total donation revenue for this page in the last 30 days, displayed in the reporting currency.',
            source: 'EN Public API (NetDonor 30-day snapshot)',
            format: 'Currency',
          },
          {
            name: 'Status badge',
            description:
              'Donation velocity indicator comparing the last 7 days to the previous 7 days. Trending Up: donations increased. Steady: roughly unchanged. Trending Down: donations decreased. New: not enough data for comparison.',
            source: 'Calculated from EN Public API (7-day snapshots)',
            format: 'Badge',
          },
        ],
        tips: [
          'The table defaults to showing live pages only — toggle "Show Live Only" off to see all pages including closed or blocked campaigns.',
          'All sortable columns have an ↑↓ button in the header — click to sort ascending or descending.',
          'Click any row to open the page detail view with metrics, content, and AI assistant.',
          'Use the Refresh button to trigger a new sync job that pulls the latest data from EN.',
          'The job status indicator below the header shows progress when a sync is running.',
        ],
      },
    ],
  },

  'page-detail:metrics': {
    title: 'Performance Metrics',
    subtitle: 'Detailed fundraising analytics for a single page',
    sections: [
      {
        title: 'Period Selector',
        content:
          'Switch between 7 Days, 30 Days, and All Time views. The period selector controls both the metric cards (Zone 1) and the trends chart (Zone 2) below.',
      },
      {
        title: '7-Day / 30-Day Metrics',
        content:
          'Three enhanced metric cards showing recent fundraising performance from the EN Public API (NetDonor). When prior-period data is available, delta badges show the percentage change.',
        metrics: [
          {
            name: 'Revenue',
            description:
              'Total donation revenue for the selected period. Includes a sparkline showing daily revenue trend and a delta badge comparing to the previous equivalent period.',
            source: 'EN Public API (NetDonor)',
            format: 'Currency + sparkline',
          },
          {
            name: 'Donations (Radial Chart)',
            description:
              'Half-circle radial chart showing one-time vs recurring donation counts. Center label shows total donations. Delta badge shows change in total donor count.',
            source: 'EN Public API (NetDonor)',
            format: 'Radial chart',
          },
          {
            name: 'Average Gift (Bar Chart)',
            description:
              'Side-by-side bars comparing average one-time gift vs average recurring gift. Delta badge shows overall average gift change.',
            source: 'Calculated (amount / count per type)',
            format: 'Bar chart',
          },
        ],
      },
      {
        title: 'All Time Metrics',
        content:
          'Three stat cards showing lifetime fundraising totals since the page was created in Engaging Networks.',
        metrics: [
          {
            name: 'Total Revenue',
            description: 'Cumulative donation revenue since page creation. Secondary stat shows average donation amount.',
            source: 'EN Public API (NetDonor)',
            format: 'Currency',
          },
          {
            name: 'Supporters',
            description: 'Total unique supporters who have donated. Secondary stat shows total registrations.',
            source: 'EN Public API (NetDonor)',
            format: 'Count',
          },
          {
            name: 'Highest Gift',
            description: 'Largest single donation amount received. Secondary stat shows the campaign start date.',
            source: 'EN Public API (NetDonor)',
            format: 'Currency',
          },
        ],
      },
      {
        title: 'Trends Chart',
        content:
          'Interactive line chart showing daily data over the selected period. Toggle between Conversion Rate, Revenue, and Page Views metrics. For All Time periods with more than 90 data points, data is automatically aggregated into weekly buckets. Includes AI-generated trend insights below the chart.',
        metrics: [
          {
            name: 'Conversion Rate',
            description: 'Daily GA4 conversion rate (sessions resulting in a donation / total sessions).',
            source: 'Google Analytics 4 (daily snapshots)',
            format: 'Percentage',
          },
          {
            name: 'Revenue',
            description: 'Daily donation revenue from GA4 snapshots.',
            source: 'Google Analytics 4',
            format: 'Currency',
          },
          {
            name: 'Page Views',
            description: 'Daily page view session counts.',
            source: 'Google Analytics 4',
            format: 'Count',
          },
        ],
      },
      {
        title: 'Tracking Accuracy',
        content:
          'Compares GA4 conversion tracking against EN donation records over the last 30 days to identify tracking gaps. A circular progress indicator shows the tracking rate with a status badge (Good / Needs Attention / Low Coverage).',
        metrics: [
          {
            name: 'GA4 Conversions',
            description: 'Conversion events recorded by Google Analytics 4 in the last 30 days.',
            source: 'Google Analytics 4',
            format: 'Count',
          },
          {
            name: 'EN Donations',
            description: 'Transaction count recorded by Engaging Networks in the last 30 days.',
            source: 'EN Public API (NetDonor)',
            format: 'Count',
          },
          {
            name: 'Tracking Rate',
            description:
              'GA4 conversions divided by EN donations, as a percentage. Good: >= 80%. Needs Attention: 50-79%. Low Coverage: < 50%.',
            source: 'Calculated (GA4 / EN)',
            format: 'Percentage (circular indicator)',
          },
          {
            name: 'Estimated Untracked Revenue',
            description:
              'Revenue from donations that GA4 did not track, estimated using average donation amount and the tracking gap.',
            source: 'Calculated',
            format: 'Currency',
          },
        ],
        tips: [
          'A low tracking rate usually means the GA4 tag is missing or misconfigured on some page variants.',
          'Check that the GA4 measurement ID is installed on all page templates, including mobile views.',
          'Tracking rates above 100% can occur when GA4 fires multiple events per donation (e.g., page redirect).',
        ],
      },
    ],
  },

  'page-detail:content': {
    title: 'Page Content & Gateway',
    subtitle: 'Scraped content, screenshots, payment gateway, and diagnostics',
    sections: [
      {
        title: 'Snapshot History',
        content:
          'A dropdown at the top lets you browse historical content snapshots. Each snapshot captures page content at a point in time, with a date range showing when that version was live. Use "Scrape Now" to trigger an immediate content refresh.',
      },
      {
        title: 'Page Content',
        content:
          'Displays scraped on-page content shown inside a browser-frame mockup with desktop/mobile toggle for screenshots. Content fields are extracted during DEEP scan jobs.',
        metrics: [
          {
            name: 'Page Title',
            description: 'The HTML meta title tag value.',
            source: 'Web scraper',
          },
          {
            name: 'Appeal Text',
            description: 'The main fundraising narrative / body copy.',
            source: 'Web scraper',
          },
          {
            name: 'Meta Description',
            description: 'The meta description tag for SEO.',
            source: 'Web scraper',
          },
          {
            name: 'CTA Buttons',
            description: 'Call-to-action button text found on the page.',
            source: 'Web scraper',
          },
          {
            name: 'Donation Amounts',
            description: 'Preset one-time donation amount buttons.',
            source: 'Web scraper',
          },
          {
            name: 'Monthly Amounts',
            description: 'Preset monthly/recurring donation amount buttons.',
            source: 'Web scraper',
          },
        ],
      },
      {
        title: 'Page Features',
        content:
          'Feature badges extracted from the page configuration, showing key donation page capabilities.',
        metrics: [
          {
            name: 'Fee Cover',
            description: 'Whether the page offers fee coverage and at what percentage.',
            source: 'Web scraper',
          },
          {
            name: 'Monthly Giving',
            description: 'Whether the page supports recurring monthly donations.',
            source: 'Web scraper',
          },
          {
            name: 'Payment Processor',
            description: 'The payment processor in use (Stripe, VGS, etc.).',
            source: 'Gateway detection',
          },
          {
            name: 'Currency',
            description: 'The currency configured for the donation page.',
            source: 'Web scraper',
          },
          {
            name: 'Min Amount',
            description: 'Minimum donation amount accepted.',
            source: 'Web scraper',
          },
        ],
      },
      {
        title: 'Screenshots',
        content:
          'Desktop and mobile screenshots of the live EN page, displayed inside a browser-frame mockup with device toggle. Captured during DEEP scans using a headless browser at 1280x800 (desktop) and 375x812 (mobile) viewports.',
      },
      {
        title: 'Payment Gateway',
        content:
          'Payment gateway information extracted during scraping by analyzing inline JavaScript variables on the page.',
        metrics: [
          {
            name: 'Gateway Type',
            description:
              'The detected payment gateway: Stripe, VGS, VGS-only, or Inconclusive if detection could not determine the type.',
            source: 'Gateway detection (inline JS analysis)',
          },
          {
            name: 'Accepted Payment Methods',
            description: 'Payment methods configured (e.g., Card, ACH, SEPA).',
            source: 'Gateway detection',
          },
          {
            name: 'Digital Wallets',
            description: 'Digital wallet support: Apple Pay, Google Pay, PayPal, Venmo.',
            source: 'Gateway detection',
          },
        ],
      },
      {
        title: 'Diagnostics',
        content:
          'Technical page health information collected during scraping. Shows load time, network request count, and issue counts organized into tabs: Errors (console errors + JS exceptions), Warnings (console warnings), and Failed Requests (network failures).',
        tips: [
          'Content is refreshed during DEEP scan jobs or by clicking "Scrape Now".',
          'Pages behind Cloudflare protection may show limited content. The scraper uses Playwright as a fallback for Cloudflare-protected pages.',
          'Use snapshot history to compare how page content has changed over time.',
        ],
      },
    ],
  },

  'page-detail:recommendations:generate': {
    title: 'AI Assistant - Generate',
    subtitle: 'Generate AI-powered optimization recommendations',
    sections: [
      {
        title: 'How It Works',
        content:
          'Select a Context Profile from the dropdown and click "Generate Recommendations" to analyze the page. The AI reviews page content, metrics, and fundraising data to produce actionable optimization suggestions. A background job is created and progress is shown in real time.',
      },
      {
        title: 'Context Profiles',
        content:
          'Context profiles are AI personas with specialized CRO guidelines. For example, "General Donation" provides broad optimization advice, while "Emergency Appeal" focuses on urgency and emotional impact. Profiles are managed in AI Config > Recommendations.',
      },
      {
        title: 'Recommendation Cards',
        content:
          'Each recommendation includes a title, detailed suggestion text, and a confidence score. You can dismiss a recommendation to hide it, or mark it as implemented once you have applied the change.',
        tips: [
          'Different context profiles produce different recommendation angles for the same page.',
          'Generating new recommendations creates a background job — progress is polled automatically.',
          'The AI model used for generation is configured in AI Config > Models.',
        ],
      },
    ],
  },

  'page-detail:recommendations:explore': {
    title: 'AI Assistant - Explore',
    subtitle: 'Run curated AI queries about your page',
    sections: [
      {
        title: 'How It Works',
        content:
          'The Explore panel has a sidebar listing available explorations and a result window. Select an exploration from the sidebar and click "Run" to execute the query against the current page data. The AI streams its response in real time, including any tool calls it makes.',
      },
      {
        title: 'Exploration Sidebar',
        content:
          'Lists all enabled explorations. A dot indicator shows which explorations have cached results for this page. Click an exploration to view its cached result or run it fresh.',
      },
      {
        title: 'Result History',
        content:
          'Each exploration stores its results per page. Use the history dropdown in the result window to browse previous runs and compare how insights change over time.',
        tips: [
          'Results are cached after the first run — select a cached result to view it instantly.',
          'Re-run an exploration after a DEEP scan to get insights based on updated page content.',
          'Explorations are managed in AI Config > Explorations. You can add, remove, reorder, and toggle them.',
        ],
      },
    ],
  },

  'page-detail:recommendations:chat': {
    title: 'AI Assistant - Chat',
    subtitle: 'Conversational AI assistant for page-specific questions',
    sections: [
      {
        title: 'How It Works',
        content:
          'Chat mode provides a free-form conversational interface to ask questions about this specific page. The AI has access to page content, metrics, scraped data, fundraising performance, and can use tools like web search during the conversation.',
      },
      {
        title: 'Conversations',
        content:
          'Chat history is persisted per page. The most recent conversation loads automatically. Use the conversation header to browse previous conversations, start a new one, or delete the current one.',
      },
      {
        title: 'Tool Activity',
        content:
          'A side panel shows tool calls the AI makes during the conversation (e.g., web searches). Each tool call can be expanded to see its input and output.',
        tips: [
          'Be specific in questions for better answers — e.g., "Why might our recurring donation rate be low?" rather than "How can we improve?".',
          'The AI can use tools like web search to find relevant information during the conversation.',
          'Conversation history persists across browser sessions — use the header to manage conversations.',
          'The chat model is configured separately from other models in AI Config > Models.',
        ],
      },
    ],
  },

  'settings:connections': {
    title: 'Connections',
    subtitle: 'Configure API connections for data sources',
    sections: [
      {
        title: 'Engaging Networks',
        content:
          'Your EN REST API token, used to sync the list of fundraising pages from EN. Enter the token and click "Save & Test" to validate and store it. Tokens are encrypted at rest using AES-256-GCM. A status badge shows the current connection state (Connected, Disconnected, or Not Tested).',
      },
      {
        title: 'Google Analytics 4',
        content:
          'GA4 integration is configured via environment variables (GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_KEY). The panel shows configuration status, property ID, and connection test results. GA4 data feeds the trends chart and tracking accuracy on the page detail Metrics tab.',
        metrics: [
          {
            name: 'Page Views',
            description: 'Total views per page.',
            source: 'GA4 Reporting API',
          },
          {
            name: 'Bounce Rate',
            description: 'Percentage of single-page sessions.',
            source: 'GA4 Reporting API',
          },
          {
            name: 'Conversions',
            description: 'Completed donation transactions.',
            source: 'GA4 Reporting API',
          },
          {
            name: 'Revenue',
            description: 'Total donation revenue.',
            source: 'GA4 Reporting API',
          },
          {
            name: 'Session Duration',
            description: 'Average time on page.',
            source: 'GA4 Reporting API',
          },
        ],
      },
      {
        title: 'Reporting Currency',
        content:
          "Select the currency used to display all monetary values across the app. Supported currencies: USD, CAD, GBP, EUR, AUD. Changes take effect immediately across all pages and dashboards.",
        tips: [
          'Test each connection after saving to verify credentials are working.',
          'The GA4 service account needs at minimum the Viewer role on your GA4 property.',
          'EN API tokens can be generated from the Engaging Networks admin panel under API settings.',
          'All credentials are encrypted at rest using AES-256-GCM encryption.',
        ],
      },
    ],
  },

  'settings:sync': {
    title: 'Sync Settings',
    subtitle: 'Configure data collection behavior, scraping, and schedule',
    sections: [
      {
        title: 'Sync Behavior',
        content: 'Toggle which data collection tasks run during sync jobs.',
        metrics: [
          {
            name: 'Scrape new/modified pages',
            description: 'Fetch page content for new or recently changed pages during DEEP scans.',
            source: 'Setting',
          },
          {
            name: 'Create content snapshots',
            description: 'Save a timestamped copy of page content for change tracking.',
            source: 'Setting',
          },
          {
            name: 'Update fundraising data',
            description: 'Pull latest donation totals and campaign metrics from the EN Public API.',
            source: 'Setting',
          },
          {
            name: 'Fill missing data gaps',
            description: 'Backfill data for pages that were skipped or had errors.',
            source: 'Setting',
          },
          {
            name: 'Include non-live pages',
            description: "Sync and track pages with 'new' or 'tested' status. When off, only live pages are synced.",
            source: 'Setting',
          },
        ],
      },
      {
        title: 'Scraping',
        content: 'Control automatic page content scraping during scheduled sync jobs. Set a re-scrape interval (in days) to determine how often existing pages are re-scraped for fresh content.',
      },
      {
        title: 'Content Depth',
        content: 'Choose what to capture during page scraping. Page text content is always extracted.',
        metrics: [
          {
            name: 'Desktop + mobile screenshots',
            description: 'Capture visual screenshots at desktop (1280x800) and mobile (375x812) breakpoints.',
            source: 'Setting',
          },
          {
            name: 'Console errors & diagnostics',
            description: 'Record browser console errors and warnings found on pages.',
            source: 'Setting',
          },
          {
            name: 'Donation amount extraction',
            description: 'Extract available donation amounts and default selections.',
            source: 'Setting',
          },
        ],
      },
      {
        title: 'Schedule',
        content: 'How often automatic syncs should run: On Demand (manual only), Hourly, Daily, or Weekly. The last and next refresh timestamps are shown below.',
        tips: [
          'On Demand mode still allows triggering syncs via the Dashboard Refresh button.',
          'Disable screenshots if storage space is a concern.',
          'Fill data gaps is useful when first setting up the app to backfill historical data.',
        ],
      },
    ],
  },

  'settings:database': {
    title: 'Database Management',
    subtitle: 'Data management, job history, and maintenance',
    sections: [
      {
        title: 'Database Summary',
        content:
          'Shows current record counts across all data types: pages, content snapshots, performance snapshots, fundraising snapshots, recommendations, explorations, and conversations. Provides a quick view of overall data volume.',
      },
      {
        title: 'Job History',
        content:
          'Lists recent sync jobs with status, type (QUICK/DEEP), phase, progress percentage, and timing. Expandable rows show error details for failed or partially-failed jobs.',
      },
      {
        title: 'Data Management',
        content:
          'Provides options to clear stored data by category: pages, analytics data, jobs, recommendations, or all data. Each action shows a confirmation dialog before proceeding.',
        tips: [
          'Clearing data is irreversible. Consider exporting or backing up important data first.',
          'Clearing pages removes all synced pages, their snapshots, and associated recommendations.',
          'Clearing jobs removes the history of sync job runs but does not affect page data.',
        ],
      },
    ],
  },
  'ai-config': {
    title: 'AI Config',
    subtitle: 'Configure AI models, prompts, explorations, and tool settings',
    sections: [
      {
        title: 'Overview',
        content:
          'AI Config manages all AI-related settings in one place. Use the four tabs to configure different aspects of the AI system: model connections and assignments, recommendation prompts, exploration queries, and chat behavior.',
        tips: [
          'Models tab: connect AI providers and assign models to each feature.',
          'Recommendations tab: customize prompts and CRO context profiles.',
          'Explorations tab: manage the AI queries available on the page Explore tab.',
          'Chat & Tools tab: customize the chat system prompt and restrict web search domains.',
        ],
      },
    ],
  },

  'ai-config:models': {
    title: 'AI Config - Models',
    subtitle: 'Configure AI providers and model assignments',
    sections: [
      {
        title: 'Model Assignment',
        content:
          'Assign which AI model to use for each feature. Three features have independent model assignments: Chat (page conversations), Explore (exploration queries), and Recommendations (optimization suggestions). Only models from configured providers appear in the dropdowns.',
      },
      {
        title: 'AI Providers',
        content:
          'Configure API credentials for each supported AI provider. Each provider card shows connection status, API key management, and model list editing.',
        metrics: [
          {
            name: 'Anthropic',
            description: 'Claude models. Supports API key from settings or ANTHROPIC_API_KEY environment variable as fallback.',
            source: 'Anthropic API',
          },
          {
            name: 'OpenAI',
            description: 'GPT models for chat, explorations, and recommendations.',
            source: 'OpenAI API',
          },
          {
            name: 'Google AI',
            description: 'Gemini models for chat, explorations, and recommendations.',
            source: 'Google AI API',
          },
          {
            name: 'Ollama (Local)',
            description: 'Run models locally. Requires Ollama running on your machine. Use "Refresh Models" to auto-discover installed models.',
            source: 'Local Ollama server',
          },
        ],
      },
      {
        title: 'AI Limits',
        content: 'Configure token limits for Chat and Explore modes. Max Context controls input tokens per request. Max Response controls output tokens per response.',
        tips: [
          'Save & Test on each provider card validates the API key and tests connectivity.',
          'Ollama models are auto-discovered when you click "Refresh Models".',
          'Model assignment changes require clicking "Save Model Settings" at the bottom.',
        ],
      },
    ],
  },

  'ai-config:recommendations': {
    title: 'AI Config - Recommendations',
    subtitle: 'Configure prompts and context profiles for AI recommendations',
    sections: [
      {
        title: 'System Instructions',
        content:
          'The base system prompt sent to the AI with every recommendation request. Defines the AI role, tone, and output format. Expand the collapsible section to view or customize. A "Custom prompt in use" indicator shows when the default has been modified.',
      },
      {
        title: 'User Prompt Template',
        content:
          'The template for the user message sent with page data. Supports template variables that are filled per-page: {{pageUrl}}, {{headline}}, {{metaDescription}}, {{ctaButtons}}, {{donationAmounts}}, {{appealText}}, {{pageViews}}, {{conversionRate}}, {{bounceRate}}, {{revenue}}, {{historicalContext}}.',
      },
      {
        title: 'Context Profiles',
        content:
          'Named AI personas with specialized CRO guidelines. Each profile adds context-specific instructions to the base system prompt. Default profiles are built in; custom profiles can be added, edited, or deleted. Profiles are selected per-page when generating recommendations.',
        tips: [
          'Click the pencil icon on a profile to expand and edit its context instructions.',
          'Default profiles cannot be deleted but their context can be customized.',
          'Use "Reset" to restore all profiles to built-in defaults.',
          'Create profiles for different campaign types: annual fund, emergency appeal, monthly giving, etc.',
        ],
      },
    ],
  },

  'ai-config:explorations': {
    title: 'AI Config - Explorations',
    subtitle: 'Manage AI exploration queries for the Explore tab',
    sections: [
      {
        title: 'Exploration System Instructions',
        content:
          'Global system prompt sent to the AI for all exploration queries. Expand the collapsible to view or customize. Template variables are available for injecting page data into the prompt.',
      },
      {
        title: 'Exploration List',
        content:
          'Lists all explorations with drag-and-drop reordering, enable/disable toggles, and edit/delete actions. Each exploration card shows its name, description, icon, and enabled status. Click "Add exploration" to create a new one — this opens a full-page editor.',
      },
      {
        title: 'Danger Zone',
        content:
          'Provides an option to clear all exploration results across all pages. This is irreversible and removes all cached AI responses for explorations.',
        tips: [
          'Drag exploration cards to reorder — the order determines how they appear in the Explore sidebar.',
          'Disabled explorations are hidden from the page detail Explore tab but their data is preserved.',
          'Clearing exploration history removes cached results but keeps the exploration definitions.',
        ],
      },
    ],
  },

  'ai-config:chat-tools': {
    title: 'AI Config - Chat & Tools',
    subtitle: 'Configure chat behavior and tool guardrails',
    sections: [
      {
        title: 'Chat System Prompt',
        content:
          'The system prompt sent to the AI for page chat conversations. Expand the collapsible to view or customize. Controls the AI personality, response style, and behavior in chat mode.',
      },
      {
        title: 'Tool Guardrails',
        content:
          'Control how AI tools interact with external services. The Web Search Domain Allowlist restricts the org_search tool to specific domains. When empty, all domains are allowed. Up to 5 domains can be added.',
      },
      {
        title: 'Danger Zone',
        content:
          'Provides an option to clear all chat conversations across all pages. This permanently deletes all message history.',
        tips: [
          'Domain allowlist accepts bare domains (e.g., example.org) — protocols and paths are stripped automatically.',
          'Chat system prompt changes affect new messages only, not existing conversation history.',
          'Clearing chat history is irreversible — consider whether any conversations contain important insights.',
        ],
      },
    ],
  },
};
