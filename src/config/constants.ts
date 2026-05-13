// Application Constants

// Job Processing
export const JOB_MAX_RETRIES = 3;
export const JOB_RETRY_DELAY_MS = 2000; // Base delay for exponential backoff

// Page Synchronization
export const SYNC_PAGE_LIMIT = 100; // Max pages per API call
export const SYNC_ON_COLLECTION = true; // Sync pages before each collection
export const SYNC_PAGE_TYPES = ['nd']; // Page types to sync (nd = NetDonor fundraising pages)

// API Rate Limits
export const EN_API_RATE_LIMIT = 1000; // Requests per hour
export const GA4_API_RATE_LIMIT = 40000; // Requests per day
export const SCRAPER_CONCURRENT_LIMIT = 5; // Concurrent requests
export const SCRAPER_TIMEOUT_MS = 10000; // 10 seconds
export const DEEP_SCAN_CONCURRENCY = 3; // Parallel Playwright browser contexts for deep scan

// GA4 Backfill Optimization
export const GA4_BACKFILL_MAX_RECENT_DAYS = 14; // Only backfill the 14 most recent missing days
export const GA4_BACKFILL_CONCURRENCY = 3; // Pages processed in parallel during FILLING_MISSING
export const GA4_BACKFILL_DORMANCY_THRESHOLD = 0.1; // Skip backfill if <10% of expected days have data

// FILLING_MISSING Phase Concurrency
export const FILL_MISSING_CONTENT_CONCURRENCY = 3; // Parallel Playwright nav for content-gap fill
export const FILL_MISSING_RETRY_CONCURRENCY = 5; // Parallel EN Public API retries (NetDonor / FundraisingSnapshot)

// NetDonor API
export const NETDONOR_SLOW_THRESHOLD_MS = 3000; // Warn when NetDonor call exceeds this

// Data Retention
export const SNAPSHOTS_RETENTION_DAYS = 90;
export const JOBS_RETENTION_DAYS = 30;
export const RECOMMENDATIONS_RETENTION_DAYS = 180;

// Performance Thresholds
export const DASHBOARD_LOAD_TARGET_MS = 30000; // SC-001
export const AI_RECS_TARGET_MS = 120000; // SC-002 (2 minutes)
export const COLLECTION_JOB_TARGET_MS = 900000; // SC-003 (15 minutes)
export const ON_DEMAND_REFRESH_TARGET_MS = 300000; // SC-004 (5 minutes)
export const PAGE_DETAIL_LOAD_TARGET_MS = 3000; // SC-008

// Claude AI Configuration
export const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
export const CLAUDE_MAX_TOKENS = 1024;
export const CLAUDE_TEMPERATURE = 0.7;
export const CLAUDE_BATCH_SIZE = 5; // Pages per batch

// Donation Velocity Thresholds (week-over-week % change)
export const VELOCITY_TRENDING_UP_THRESHOLD = 10; // >10% increase
export const VELOCITY_TRENDING_DOWN_THRESHOLD = -10; // >10% decrease

// Performance Benchmarks
export const CONVERSION_RATE_POOR = 0.02; // < 2%
export const CONVERSION_RATE_GOOD = 0.05; // > 5%
export const BOUNCE_RATE_POOR = 0.6; // > 60%
export const BOUNCE_RATE_GOOD = 0.4; // < 40%

// Recommendation Confidence Thresholds
export const MIN_RECOMMENDATION_CONFIDENCE = 0.6;
export const HIGH_CONFIDENCE_THRESHOLD = 0.8;

// Date Ranges
export const TREND_ANALYSIS_DAYS = 30;
export const DASHBOARD_DEFAULT_DAYS = 7;
export const HISTORICAL_COMPARISON_DAYS = 90;

// Pagination
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

// Rate Limiting
export const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute window
export const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute

// Playwright Timeouts
export const PLAYWRIGHT_NAVIGATION_TIMEOUT_MS = 30_000;
export const PLAYWRIGHT_SELECTOR_TIMEOUT_MS = 15_000;
export const PLAYWRIGHT_JS_SETTLE_MS = 2_000;
export const PLAYWRIGHT_VIEWPORT_SETTLE_MS = 500;

// Browser Cleanup
export const BROWSER_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes idle before auto-close

// Scraper Validation
export const SCRAPER_MAX_DONATION_AMOUNT = 100_000;

// Caching (if implemented)
export const CACHE_TTL_SECONDS = 300; // 5 minutes
export const DASHBOARD_CACHE_KEY = 'dashboard:summary';
export const PAGES_CACHE_KEY = 'pages:list';

// GitHub Repository
export const GITHUB_REPO_URL = 'https://github.com/orkestre-ai/crescendo';
export const GITHUB_REPO_API_URL =
  'https://api.github.com/repos/orkestre-ai/crescendo';
export const GITHUB_RELEASES_URL =
  'https://github.com/orkestre-ai/crescendo/releases';
export const GITHUB_ISSUES_URL =
  'https://github.com/orkestre-ai/crescendo/issues';
export const GITHUB_DISCUSSIONS_URL =
  'https://github.com/orkestre-ai/crescendo/discussions';

// Version Check
export const VERSION_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
