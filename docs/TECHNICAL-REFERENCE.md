# Crescendo: Technical Reference

> Comprehensive module-by-module documentation, data flow analysis, configuration inventory, and technical audit for the Crescendo fundraising page optimization platform.

**Generated**: 2026-04-12
**Codebase Version**: Commit `5830b7c` (main branch)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Module Reference](#2-module-reference)
   - [2.1 Engaging Networks REST API Client](#21-engaging-networks-rest-api-client)
   - [2.2 EN Public API Client (NetDonor)](#22-en-public-api-client-netdonor)
   - [2.3 Web Scraping System](#23-web-scraping-system)
   - [2.4 Playwright Browser Engine](#24-playwright-browser-engine)
   - [2.5 Gateway Detection](#25-gateway-detection)
   - [2.6 Google Analytics 4 Client](#26-google-analytics-4-client)
   - [2.7 AI Recommendation Engine](#27-ai-recommendation-engine)
   - [2.8 Job Processing System](#28-job-processing-system)
   - [2.9 Scheduler & Cron](#29-scheduler--cron)
   - [2.10 Settings Management](#210-settings-management)
   - [2.11 Encryption (crypto.ts)](#211-encryption-cryptots)
   - [2.12 Data Utilities](#212-data-utilities)
   - [2.13 Logging Architecture](#213-logging-architecture)
   - [2.14 Cleanup & Retention](#214-cleanup--retention)
3. [Database Schema](#3-database-schema)
4. [Job Phase Pipeline](#4-job-phase-pipeline)
   - [4.1 SYNCING Phase](#41-syncing-phase)
   - [4.2 SCRAPING Phase](#42-scraping-phase)
   - [4.3 COLLECTING Phase](#43-collecting-phase)
   - [4.4 FILLING_MISSING Phase](#44-filling_missing-phase)
   - [4.5 GENERATING_RECS Phase](#45-generating_recs-phase)
   - [4.6 FINALIZING Phase](#46-finalizing-phase)
5. [Snapshot System](#5-snapshot-system)
   - [5.1 Content Hash & Change Detection](#51-content-hash--change-detection)
   - [5.2 Content Snapshot Lifecycle](#52-content-snapshot-lifecycle)
   - [5.3 Performance Snapshots](#53-performance-snapshots)
   - [5.4 Fundraising Snapshots](#54-fundraising-snapshots)
6. [Decision Logic Reference](#6-decision-logic-reference)
7. [Configuration Inventory](#7-configuration-inventory)
   - [7.1 Environment Variables](#71-environment-variables)
   - [7.2 Application Constants](#72-application-constants)
   - [7.3 AI Configuration](#73-ai-configuration)
   - [7.4 Framework Configuration](#74-framework-configuration)
   - [7.5 Package Dependencies](#75-package-dependencies)
8. [API Route Reference](#8-api-route-reference)
9. [Technical Audit](#9-technical-audit)
   - [9.1 Security Findings](#91-security-findings)
   - [9.2 Code Smells](#92-code-smells)
   - [9.3 Architectural Concerns](#93-architectural-concerns)
   - [9.4 Testing Gaps](#94-testing-gaps)
   - [9.5 Positive Patterns](#95-positive-patterns)
10. [Data Flow Diagrams](#10-data-flow-diagrams)

---

## 1. System Overview

Crescendo is a fundraising page optimization platform for Engaging Networks (EN). It syncs donation pages from EN, collects analytics from Google Analytics 4, scrapes page content with Cloudflare bypass, and generates AI-powered conversion rate optimization recommendations.

**Core Data Pipeline:**
```
EN REST API  -->  Page Sync  -->  Content Scraping  -->  GA4 Metrics  -->  AI Recommendations
     |                |                  |                    |                    |
     v                v                  v                    v                    v
  Page List     FundraisingPage    ContentSnapshot    PerformanceSnapshot   Recommendation
```

**Stack**: Next.js 15.5, React 19, TypeScript 5.9, Prisma 6.17, PostgreSQL, Tailwind CSS 4.1, shadcn/ui

---

## 2. Module Reference

### 2.1 Engaging Networks REST API Client

**File**: `src/lib/engaging-networks.ts`
**Purpose**: Authenticated access to EN REST API for page discovery, detail retrieval, and metrics.

#### Authentication Flow

1. First request without auth triggers automatic authentication
2. POST to `/authenticate` with API token as plain string body
3. EN returns `{"ens-auth-token": "...", "expires": 3600000}`
4. Token cached in `authToken` property for subsequent requests
5. All requests attach `ens-auth-token` header after authentication

#### Key Methods

| Method | Purpose | Returns |
|--------|---------|---------|
| `getPages(options)` | Fetch paginated list of live fundraising pages (type=`nd`) | `ENPage[]` |
| `getPage(pageId)` | Get detailed page info (campaign status, template, tracking params) | `ENPageDetail` |
| `getPageMetrics(pageId, start, end)` | Fetch historical page-level metrics | `ENPageMetrics` |

#### Error Handling & Retry Logic

- **Rate Limiting (429)**: Exponential backoff with jitter, max 10 seconds
- **Unauthorized (401)**: Single re-authentication attempt, then retry once
- **Timeouts**: 30-second request timeout; logged with full context
- **Generic Retry**: `fetchWithRetry(fn, maxRetries=3)` with exponential backoff

#### Axios Interceptors

- **Request**: Auto-authentication, timing metadata (`_startTime`)
- **Response**: Duration calculation, response size tracking
- **Error**: Status-aware logging, conditional retry logic, timeout detection

#### Data Structures

```typescript
ENPage: { id, name, url, type, status, createdDate, modifiedDate }
ENPageDetail: { id, campaignId, name, title, type, subType, clientId, status, template, trackingParameters }
ENPageMetrics: { pageId, submissions, totalRevenue, avgDonation }
```

---

### 2.2 EN Public API Client (NetDonor)

**File**: `src/lib/en-public-client.ts`
**Purpose**: Access EN Public Data API for aggregate fundraising data. Separate from REST API with different auth (query param token) and endpoints.

#### Key Methods

| Method | Purpose | Returns |
|--------|---------|---------|
| `fetchNetDonor(campaignId)` | Get fundraising summary (donations, amounts, supporter count) | Flattened row objects |
| `fetchFundraisingSummaryByPage(pageId, start, end, currency)` | Period-specific donation stats by currency | Flattened row objects |
| `testConnection()` | Verify API token validity via EaSupporterCount service | Boolean |

#### Configuration

- **Base URLs**: US (`us.engagingnetworks.app`) or CA (`ca.engagingnetworks.app`)
- **Region**: Selectable via `ENPublicClientConfig`, defaults to `ca`
- **Timeout**: 30-second default with AbortController

#### Response Transformation

EN Public API returns a nested format:
```json
{ "rows": [{ "columns": [{ "name": "...", "value": "...", "type": "xs:int" }] }] }
```

The client flattens this to an array of objects with type coercion:
- `xs:int` -> `parseInt()`
- `xs:decimal` -> `parseFloat()`
- Empty array = no data (campaign not found or no donations in period)

#### Singleton Pattern

- `getENPublicClient()` returns cached instance or creates if token configured
- `isENPublicConfigured()` checks for `EN_PUBLIC_TOKEN` env var
- `resetENPublicClient()` for testing/reconfiguration

---

### 2.3 Web Scraping System

**File**: `src/lib/scraper.ts`
**Purpose**: Extract structured content from EN donation pages using a dual-path strategy (axios + Playwright fallback).

#### Dual-Path Strategy

1. **Primary (axios)**: Fast HTTP fetch with cookie jar support
   - Detects Cloudflare challenges via markers: `_cf_chl_opt`, `Just a moment`, `cf-mitigated`
   - 15-second timeout, 10 max redirects
   - Mozilla Chrome user agent with full Accept headers

2. **Fallback (Playwright)**: Headless browser for Cloudflare-blocked pages
   - Launched only when CF detected in 200 response or 403 error
   - Browser singleton reused across scrapes
   - Auto-detects if future attempts need Playwright (stores `requiresPlaywright` flag)

#### Content Extraction Pipeline

| Field | Strategy | Selectors/Patterns |
|-------|----------|-------------------|
| Title (h1) | Multiple selectors with fallback | `h1`, `.page-title h1`, `.en__component--page-title`, headers in hero/nav |
| Meta Title | `<title>` tag | Direct extraction |
| Meta Description | Meta tags + OG | `meta[name="description"]`, `meta[property="og:description"]` |
| CTA Buttons | Form buttons + links | `.en__submit button`, `button.donate-button`, unique text extraction |
| Donation Amounts | Three patterns (P1-P3) | Input values, data attributes, label text with `$` regex |
| Appeal Text | EN body-top section | `.body-top .en__component--copyblock` children (h1-h6, p, li) |
| Narrative Text | Comprehensive extraction | h1-h6, p, li, blockquote, content divs; removes footer, nav, scripts, form fields |
| Page Flow | JavaScript variable | `var pageJson = {...}` regex, extracts pageNumber, pageCount, redirectPresent, giftProcess |

#### Fee Cover Detection

- DOM check: `input[name="transaction.feeCover"]` or `.en__field--feeCover`
- Display amount extraction: `[data-token="amount-fee"]`
- **Filtering**: Donations matching fee cover amount excluded (within $0.01 tolerance)

#### Monthly Giving & Currency

- Extracted from EN runtime JavaScript when available (via Playwright)
- Runtime data overrides cheerio extraction
- Stored in: `monthlyDonationAmounts`, `hasMonthlyGiving`, `currency`, `minDonationAmount`

#### Parallel Scraping

- `scrapePagesParallel()` with p-limit concurrency control
- Known Playwright pages skip HTTP attempt
- Progress callback for UI updates
- Graceful error handling per page (minimal data on error, continues batch)

---

### 2.4 Playwright Browser Engine

**File**: `src/lib/playwright-scraper.ts`
**Purpose**: Headless browser automation for Cloudflare bypass and runtime JavaScript extraction.

#### Browser Singletons

- `browserInstance`: Generic screenshots/diagnostics
- `scrapingBrowserInstance`: Stealth scraping (rebrowser-playwright when enabled)

#### Stealth Mode

- Detects `REBROWSER_ENABLED` env var
- Falls back to vanilla Playwright if rebrowser module unavailable
- Webshare proxy support when `PROXY_CONFIG` set

#### Scrape Flow

1. Navigate with `waitUntil: 'domcontentloaded'` (avoids persistent analytics blocking)
2. Wait for EN-specific content: `form`, `.en__component`, `script[src]` (up to 15s, non-blocking)
3. 2-second additional JS render time
4. Extract runtime data via `page.evaluate()`
5. Capture HTML content

#### Runtime Data Extraction

```javascript
{
  paymentGateways: EngagingNetworks.paymentGateways || [],
  vault: EngagingNetworks.vault || null,
  feeCover: EngagingNetworks.feeCover || null,
  altLists: EngagingNetworks.altLists || [],
  dependencies: EngagingNetworks.dependencies || [],
  validators: EngagingNetworks.validators || [],
  currency: input[name="transaction.paycurrency"].value || null
}
```

#### Screenshot & Diagnostics

- `captureScreenshot(url, {timeoutMs, width})`: Full-page PNG at specified viewport (default 1280px)
- `capturePageDiagnostics()`: Console errors/warnings (limit 50 each), JS exceptions, failed requests by status/type, total request count, transfer size, timing, mobile screenshot (390px)

---

### 2.5 Gateway Detection

**File**: `src/lib/gateway-detection.ts`
**Purpose**: Identify payment gateway configuration (Stripe, VGS, etc.) from page HTML.

#### Phase 1: Classification

- `isCloudflareChallenge()`: Checks for CF markers
- `extractPaymentGateways()`: Regex extraction of `window.EngagingNetworks.paymentGateways` and `vault`
- `classifyDetection()`: Returns discriminated union:
  - `gateway-found`: paymentGateways populated, includes gatewayType
  - `vgs-only`: paymentGateways empty + vault present
  - `inconclusive`: CF challenge, minimal HTML (<500 bytes), or no gateway variables

#### Phase 2: DOM Analysis

- `extractPaymentMethods()`: `<select name="transaction.paymenttype">` options
- `extractDigitalWallets()`: ENgrid body data attributes (`data-engrid-payment-type-option-*`)
- `hasStripeElements()`: Check for `#en__digitalWallet__stripeButtons`
- `hasVgsElements()`: iframes with `name="vgs-collect-cvv-field"` or class `vgs-collect`

#### Data Safety

**Never persisted**: Raw gateway objects, Stripe keys, account IDs, VGS vault IDs, route IDs. Only type strings and capability flags are stored.

---

### 2.6 Google Analytics 4 Client

**File**: `src/lib/google-analytics.ts`
**Purpose**: Fetch performance metrics via GA4 Reporting API v1 using service account authentication.

#### Authentication

- Service account credentials from `GA4_SERVICE_ACCOUNT_KEY` env var (JSON)
- `BetaAnalyticsDataClient` instantiated once per app instance
- Property ID from `GA4_PROPERTY_ID`

#### Key Methods

| Method | Purpose |
|--------|---------|
| `getPageMetrics(pagePath, start, end)` | Single day/range metrics |
| `getBatchPageMetrics(pages, start, end)` | Multiple pages with sequential delays |
| `getMetricsForDateRange(pagePath, start, end)` | Historical by-day metrics map |
| `getPagePurchaseData(pagePath, start, end)` | Revenue-only queries |

#### Purchase Data (Conversions + Revenue)

- Queries `/donate/2` confirmation page separately
- Filters: `eventName='purchase'` AND `pagePath=confirmationPath`
- `eventCount` = conversions, `eventValue` = revenue
- Extracts only purchase events (not generic GA4 conversions)

#### Rate Limiting

- Sequential processing with 100ms delay between requests
- 40,000 requests/day quota (~1,600/hour)
- API failures return zero metrics (graceful degradation)

#### Response Parsing

Converts GA4 string values to correct types:
- `int` for pageViews
- `float` for bounceRate, duration
- Returns `GA4PageMetrics`: pageViews, bounceRate, conversions, revenue, avgSessionDuration

---

### 2.7 AI Recommendation Engine

**File**: `src/lib/claude.ts` (via `src/lib/ai-client.ts`)
**Purpose**: LLM-powered conversion rate optimization recommendations using provider abstraction.

#### Provider Support

| Provider | Use Case |
|----------|----------|
| Anthropic (primary) | Recommendations, chat, exploration |
| OpenAI | Alternative provider |
| Google | Alternative provider |
| Ollama (local) | Development/testing |

#### Recommendation Categories

`CONTENT`, `DESIGN`, `PRICING`, `CTA`, `TECHNICAL`, `SOCIAL_PROOF`

#### Input Structure

```typescript
RecommendationInput {
  pageUrl,
  pageContent: { h1, description, cta[], donationAmounts[], appealText? },
  metrics: { pageViews, conversionRate, bounceRate, revenue },
  historicalData?: { avgConversionRate, trend: 'improving'|'declining'|'stable' }
}
```

#### Parsing Strategy (3 Fallbacks)

1. **Pipe Format**: `CATEGORY | 0.85 | Text` (strict)
2. **Markdown Fallback**: `**CATEGORY** (Confidence: 0.85)` with various separators
3. **Last Resort**: Numbered/bulleted items mentioning categories

#### Batch Processing

- Sequential with 500ms delay between requests
- Returns `Map<pageUrl, ParsedRecommendation[]>`
- Empty array on per-page failures (non-blocking)

---

### 2.8 Job Processing System

**File**: `src/lib/jobs.ts`
**Purpose**: Orchestrate multi-phase data collection and analysis workflows with phase-based routing and state machine transitions.

#### Job Types

| Type | Pipeline | Purpose |
|------|----------|---------|
| `SYNC` | SYNCING -> SCRAPING -> COLLECTING -> FILLING_MISSING -> FINALIZING | Full sync |
| `MANUAL_SCRAPE` | SCRAPING only | Single-page scrape |
| `MANUAL_RECS` | GENERATING_RECS only | Single-page recommendations |
| `BACKFILL` | COLLECTING only | GA4 historical backfill |

#### Phase Progress Mapping

```
SYNCING (0%) -> SCRAPING (10%) -> COLLECTING (30%) -> FILLING_MISSING (60%) -> GENERATING_RECS (70%) -> FINALIZING (90%) -> 100%
```

#### Phase Skipping Logic

`shouldSkipPhase()` evaluates settings:
- SYNCING and FINALIZING: **never skipped**
- SCRAPING: skipped if `!syncBehavior.contentScrape || !scrapingSettings.enabled`
- COLLECTING: skipped if `!syncBehavior.fundraisingData`
- FILLING_MISSING: skipped if `!syncBehavior.fillGaps`
- Single-page debug jobs (`targetPageId` set): always execute requested phase

#### Processing Model

- `processJobToCompletion()`: Auto-continues with up to 100 iterations, 100ms delay between chunks
- `processJobChunk()`: Single chunk processing, immediate return
- Lock mechanism (`processingLock` Set) prevents duplicate processing of same job
- Processing stops on terminal status (COMPLETED, FAILED, CANCELLED)

#### Job Creation

```typescript
createCollectionJob(triggeredBy: 'cron'|'user'|'api'|'settings', jobType: JobType)
// Sets status: PENDING, phase: firstEnabledPhase, totalPages: active count
// Respects SYNC_DEBUG_LIMIT env var for development testing
```

#### Single-Page Debug Mode

```typescript
createSinglePageJob(pageId, startPhase, triggeredBy='debug')
// Syncs only one page, runs single phase, auto-completes
```

---

### 2.9 Scheduler & Cron

**File**: `src/lib/scheduler.ts`
**Purpose**: In-process cron scheduler for automated data collection and cleanup.

#### Scheduled Jobs

| Schedule | Cron | Purpose |
|----------|------|---------|
| Hourly | `0 * * * *` | Check scheduled refresh, create SYNC job if due |
| Weekly | `0 2 * * 0` | Cleanup old data (Sundays 2 AM) |

#### Guards

- Disabled if `ENABLE_SCHEDULER=false`
- `hasActiveJob()` checks for PENDING or PROCESSING jobs
- Hourly tick skipped if job active (prevents overlaps)

#### Cron API Routes

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/cron/daily-collection` | CRON_SECRET bearer token | External trigger for collection |
| `GET /api/cron/cleanup` | CRON_SECRET bearer token | External trigger for cleanup |

---

### 2.10 Settings Management

**File**: `src/lib/settings.ts`
**Purpose**: Singleton application configuration with encrypted credential storage.

#### Singleton Pattern

- Single `AppSettings` record per app (id=`'singleton'`)
- Fetched via `getOrCreateSettings()` (Prisma upsert)

#### Encrypted Fields

All API keys are encrypted at rest with AES-256-GCM:
- `enApiKeyEncrypted`, `enPublicTokenEncrypted`
- `ga4PropertyIdEncrypted`, `ga4ServiceAccountKeyEncrypted`
- `anthropicApiKeyEncrypted`, `aiOpenaiKeyEncrypted`, `aiGoogleKeyEncrypted`
- `aiOllamaBaseUrl`: **NOT encrypted** (plain text, not a secret)

#### Masking for Display

- `maskApiKey(key)`: Returns `****<last4chars>` for safe logging
- `safeDecryptMask(encrypted)`: Decrypt and mask, return `****????` on failure

#### Refresh Schedule Logic

| Schedule | Next Refresh |
|----------|-------------|
| `ON_DEMAND` | Manual only (returns null) |
| `HOURLY` | +1 hour from last refresh |
| `DAILY` | Next day at 6 AM |
| `WEEKLY` | Next Monday at 6 AM |

#### Connection Testing

- EN: Test API key via `getPages()`, stores status/error/pageCount
- GA4: Test via `getPageMetrics()`, stores status/error
- Separate from schedule evaluation

---

### 2.11 Encryption (crypto.ts)

**File**: `src/lib/crypto.ts`
**Purpose**: AES-256-GCM authenticated encryption for stored API keys.

#### Scheme

- **Algorithm**: AES-256-GCM (authenticated encryption with associated data)
- **Key**: 64-char hex string from `ENCRYPTION_KEY` env var (32 bytes)
- **IV**: 16 random bytes per encryption (prevents pattern attacks)
- **Auth Tag**: 16-byte authentication tag (prevents tampering)
- **Storage Format**: `iv:authTag:ciphertext` (all base64-encoded)

#### API

```typescript
encrypt(plaintext: string): string    // Returns "iv:authTag:ciphertext"
decrypt(encrypted: string): string    // Parses format, decrypts, verifies auth tag
```

---

### 2.12 Data Utilities

#### analytics.ts
- `calculatePercentageChange()`: Null-safe percentage delta
- `calculateTrend()`: 7+ days -> improving/declining/stable (+-10% threshold)
- `detectAnomalies()`: Z-score detection (threshold=2 std dev)
- `comparePeriods()`: Period-over-period metrics comparison

#### currency-utils.ts
- `formatCurrency(amount, currency)`: Intl.NumberFormat with proper locales
- `formatCurrencyCompact(amount)`: Compact notation ($1.2M, 45K)
- Supports: USD, CAD, GBP, EUR, AUD

#### date-utils.ts
- `getPeriodDates()`: Calculate date ranges (LAST_7_DAYS, PREV_7_DAYS, LAST_30_DAYS, LIFETIME)
- `getPeriodDatesForCampaign()`: Adjust for campaign creation date
- `formatDateYYYYMMDD()`: ISO format for API requests

#### url-utils.ts
- `isScrapeable(campaignStatus)`: Checks `['new', 'live', 'tested']`
- `getScrapableUrl(page)`: Appends `?mode=DEMO` for consistent access

#### snapshot-utils.ts
- ContentSnapshot lifecycle helpers
- Validity period calculations

---

### 2.13 Logging Architecture

**Two separate log systems must be read together for full picture.**

#### `logs/nextjs.log` (stdout, framework-level)

Captured from terminal via `tee`. Contains Next.js HTTP request logs and Prisma SQL queries:
```
GET /api/jobs?status=PENDING&limit=1 200 in 9ms
prisma:query SELECT "public"."CollectionJob"."id" ...
```

#### `logs/dev-logs.json` (structured app logs, business-level)

Written by the app's logger. Contains job lifecycle events, API call tracking, processing status:
```
[2026-03-05T15:20:23Z] INFO job.phase.entering -> Entering GENERATING_RECS phase
[2026-03-05T15:20:30Z] INFO api.request.completed -> Completed /messages
```

#### Environment-Based Config

| Environment | Min Level | Transports | Stack Traces | Sample Rate |
|-------------|-----------|------------|--------------|-------------|
| Local Dev | DEBUG | Console (colorized, pretty) | Yes | 100% |
| Development | DEBUG | Console (pretty) + JSON file | Yes | 100% |
| Production | INFO | Console (JSON) + JSON file | No | 10% for DEBUG |

---

### 2.14 Cleanup & Retention

**File**: `src/lib/cleanup.ts`

| Data Type | Retention | Action |
|-----------|-----------|--------|
| PerformanceSnapshot | 90 days | DELETE |
| CollectionJob | 30 days | DELETE |
| PageInsight | 30 days | DELETE |
| OptimizationRecommendation | 180 days | Mark SUPERSEDED (never deleted) |

---

## 3. Database Schema

### Core Entities

#### FundraisingPage
Primary entity tracking fundraising pages from Engaging Networks.

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `id` | CUID | PK | Internal identifier |
| `enPageId` | String | Unique | Engaging Networks page ID |
| `enPageType` | String | No | Page type (`nd`, `ss`, etc.) |
| `name`, `url` | String | Yes | Page title and URL |
| `status` | Enum | Yes | ACTIVE / PAUSED / ARCHIVED |
| `campaignId` | Int | No | EN campaign ID for Public API |
| `headline`, `metaTitle`, `metaDescription` | String | No | Scraped text elements |
| `appealText`, `narrativeText` | String | No | Detailed copy for LLM context |
| `ctaButtons[]` | String[] | No | CTA button texts |
| `donationAmounts[]` | Float[] | No | One-time donation options |
| `monthlyDonationAmounts[]` | Float[] | No | Recurring amounts |
| `hasFeeCover`, `feeCoverConfig` | Bool/JSON | No | Fee cover configuration |
| `hasMonthlyGiving` | Bool | No | Recurring donation support |
| `currency` | String | No | Transaction currency |
| `contentHash` | String | No | SHA-256 of key content fields |
| `paymentGateway` | JSON | No | Payment processor detection |
| `enRuntimeConfig` | JSON | No | Sanitized EN config snapshot |
| `lastScrapedAt` | DateTime | No | Last successful scrape |
| `requiresPlaywright` | Bool | Default false | Cloudflare-blocked flag |
| `fundraisingTotalDonated` | Float | No | From NetDonor |
| `fundraisingHighestDonation` | Float | No | From NetDonor |
| `fundraisingSupporters` | Int | No | From NetDonor |
| `lastSyncStatus` | Enum | Yes | PENDING / SUCCESS / FAILED |
| `lastSyncedAt` | DateTime | No | Last sync timestamp |
| `aiProfileId` | String | No | AI context profile (null = "general-donation") |

**Indexes**: `status`, `enPageId`, `lastScrapedAt`, `enModifiedAt`, `campaignStatus`

**Relations**: snapshots (1:many), recommendations (1:many), contentSnapshots (1:many), fundraisingSnapshots (1:many), conversations (1:many)

#### PerformanceSnapshot
Daily GA4 metrics per page.

| Field | Type | Purpose |
|-------|------|---------|
| `pageId` | FK | Links to FundraisingPage |
| `date` | Date | Unique with pageId |
| `pageViews`, `bounceRate`, `conversions`, `revenue`, `avgSessionDuration` | Numeric | GA4 metrics |
| `conversionRate` | Float | Calculated: conversions/pageViews |
| `gaCollectedAt`, `enCollectedAt` | DateTime | Collection timestamps |

**Unique**: `[pageId, date]`

#### ContentSnapshot
Versioned page content captures with lifecycle tracking.

| Field | Type | Purpose |
|-------|------|---------|
| `pageId` | FK | Links to FundraisingPage |
| `contentHash` | String | SHA-256 of content |
| `metaTitle`, `appealText`, `narrativeText` | Text | Captured content |
| `screenshotUrl`, `mobileScreenshotUrl` | String | Visual snapshot URLs |
| `diagnostics` | JSON | Console errors, timing, failed requests |
| `validFrom` | DateTime | When this version became active |
| `validTo` | DateTime? | When superseded (NULL = currently active) |

**Unique**: `[pageId, contentHash]`

#### FundraisingSnapshot
Period-based fundraising data from EN Public API.

| Field | Type | Purpose |
|-------|------|---------|
| `pageId` | FK | Links to FundraisingPage |
| `periodType` | Enum | LAST_7_DAYS / PREV_7_DAYS / LAST_30_DAYS / LIFETIME |
| `periodStart`, `periodEnd` | Date | Period bounds |
| `totalAmount`, `donationCount` | Numeric | Donation metrics |
| `singleCount`, `singleAmount` | Numeric | One-time donations |
| `recurringCount`, `recurringAmount` | Numeric | Recurring donations |
| `currency` | String | Reporting currency |

**Unique**: `[pageId, periodType, periodStart, periodEnd]`

#### CollectionJob
Background job for data collection.

| Field | Type | Purpose |
|-------|------|---------|
| `status` | Enum | PENDING / PROCESSING / COMPLETED / COMPLETED_WITH_ERRORS / FAILED / CANCELLED |
| `jobType` | Enum | SYNC / MANUAL_SCRAPE / MANUAL_RECS / BACKFILL |
| `triggeredBy` | String | cron / user / api / settings |
| `phase` | Enum | Current processing phase |
| `totalPages`, `processedPages`, `progress` | Numeric | Progress tracking |
| `errors[]` | JSON | Array of `{page, phase, subPhase?, error, timestamp}` |
| `targetPageId` | FK? | Single-page debug mode |

#### AppSettings
Singleton configuration record (id = `'singleton'`).

Contains encrypted API keys, sync behavior toggles, scraping depth toggles, AI model configuration per surface, and reporting preferences. See [Section 7.3](#73-ai-configuration) for details.

#### OptimizationRecommendation

| Field | Type | Purpose |
|-------|------|---------|
| `category` | Enum | CONTENT / DESIGN / PRICING / CTA / TECHNICAL / SOCIAL_PROOF |
| `text` | String | Recommendation text |
| `confidence` | Float | 0.0-1.0 confidence score |
| `status` | Enum | ACTIVE / IMPLEMENTED / DISMISSED / SUPERSEDED |
| `modelUsed` | String | LLM model identifier |

#### Conversation & Message
Persistent chat with AI per page.

#### Exploration
Configurable AI queries with tool selection.

#### PageInsight
AI analysis results from Explore/Chat modes.

---

## 4. Job Phase Pipeline

### Full SYNC Pipeline

```
POST /api/jobs  -->  PENDING
                       |
    +---------+--------+--------+-----------+------------+
    |         |                 |           |            |
 SYNCING  SCRAPING       COLLECTING  FILLING_MISSING  FINALIZING
  (0%)     (10%)           (30%)        (60%)          (90%)
    |         |                 |           |            |
    v         v                 v           v            v
  EN API   Axios/PW         GA4 API    Gap backfill   Cleanup
  Pages    Scrape          NetDonor    NetDonor retry  Status
  Sync     Snapshot        FR Snaps   FR Snap retry   Complete
```

### 4.1 SYNCING Phase

**Process**:
1. Fetch all live EN pages (type=`nd`) via REST API with pagination (limit=100, max 5000 pages)
2. For each page: fetch full details (title, campaignId, status, template, tracking params)
3. Create or update `FundraisingPage` record (upsert by `enPageId`)
4. Mark ACTIVE pages not returned by EN as PAUSED (unless debug-limited)

**API Calls**: `enClient.getPages()` (paginated) + `enClient.getPage(pageId)` per page

**Decision Logic**:
- New page (enPageId not in DB) -> CREATE with status ACTIVE
- Existing page with newer `enModifiedAt` -> UPDATE
- Existing page unchanged -> SKIP
- Debug limit (`SYNC_DEBUG_LIMIT > 0`): stop early, skip pausing check

**Data Written**: `FundraisingPage` inserts/updates + PAUSED status updates

---

### 4.2 SCRAPING Phase

**Page Selection** (4-signal OR):
1. Never scraped: `lastScrapedAt IS NULL`
2. No hash: `contentHash IS NULL`
3. Stale: `lastScrapedAt < NOW - stalenessThresholdDays` (default: 14)
4. Modified in EN: `enModifiedAt > lastScrapedAt`

**Process per page**:
1. Scrape content (axios with Playwright fallback)
2. Extract: h1, meta, appeal text, narrative, CTAs, donation amounts, fee cover, monthly giving
3. Detect payment gateway
4. Compute `contentHash` (SHA-256 of key fields)
5. Compare hash to stored `page.contentHash`
6. UPDATE page with all scraped fields
7. If hash changed -> create ContentSnapshot with screenshots

**Parallel Execution**: p-limit with `DEEP_SCAN_CONCURRENCY` (3)

**Cloudflare Handling**: CF blocks counted as `cfBlockedCount` (NOT errors), page marked as processed, `requiresPlaywright` set to true

**Progress**: 10% + 20% * (processedPages / totalPages)

---

### 4.3 COLLECTING Phase

**Per Page (3 sub-phases)**:

1. **GA4 Metrics** (BLOCKING):
   - If no existing snapshots: auto-backfill from `enCreatedAt` to yesterday (up to 14 months)
   - If snapshots exist: fetch yesterday only
   - Upsert `PerformanceSnapshot` with `conversionRate = conversions / pageViews`

2. **NetDonor Data** (NON-BLOCKING):
   - Requires EN Public API configured + page has `campaignId`
   - Updates page: `fundraisingTotalDonated`, `fundraisingHighestDonation`, etc.

3. **Fundraising Snapshots** (NON-BLOCKING):
   - Periods: LAST_7_DAYS, PREV_7_DAYS, LAST_30_DAYS, LIFETIME
   - Upserts `FundraisingSnapshot` per period

**Error Classification**:
- GA4 failure -> page marked failed (blocking)
- NetDonor/FundraisingSnapshot failures -> logged in errors array with `subPhase` field (non-blocking)

---

### 4.4 FILLING_MISSING Phase

**Four sub-operations**:

1. **GA4 Gap Backfill** (parallelized, concurrency: 3):
   - Find date ranges without snapshots
   - Skip dormant pages: coverage < 10% AND > 30 missing days
   - Trim gaps to most recent 14 days (`GA4_BACKFILL_MAX_RECENT_DAYS`)
   - Query GA4 per gap range, upsert snapshots

2. **NetDonor Retry**: Pages with `campaignId` but null `fundraisingTotalDonated`

3. **FundraisingSnapshot Retry**: Pages missing any of the 4 period types

4. **Content Depth Filling**: Missing screenshots/diagnostics on latest ContentSnapshot

---

### 4.5 GENERATING_RECS Phase

- Query Claude for optimization recommendations per page
- Mark old ACTIVE recommendations as SUPERSEDED
- Create new `OptimizationRecommendation` records
- 500ms delay between pages, batch size 5

---

### 4.6 FINALIZING Phase

- Close Playwright browser sessions
- Aggregate totals and error summaries
- Set job status: `COMPLETED` (zero errors) or `COMPLETED_WITH_ERRORS`
- Log completion summary with duration and iteration metrics

---

## 5. Snapshot System

### 5.1 Content Hash & Change Detection

**Hash Computation** (SHA-256):
- **Fields included**: h1, metaDescription, metaTitle, appealText, narrativeText, ctaButtons[], donationAmounts[], monthlyDonationAmounts[]
- **Normalization**: null/undefined -> empty string; string arrays sorted alphabetically; number arrays rounded to 2 decimals and sorted numerically
- **Process**: JSON.stringify normalized object -> SHA-256 hex digest

**Change Detection**: `newHash !== page.contentHash` triggers snapshot creation.

### 5.2 Content Snapshot Lifecycle

```
Scrape T1 (hash: abc123)
  -> Create snapshot: validFrom=T1, validTo=NULL   [ACTIVE]

Scrape T2 (hash: abc123, unchanged)
  -> No action (hash match)

Scrape T3 (hash: def456, CHANGED)
  -> UPDATE snapshot A: validTo=T3                   [SUPERSEDED]
  -> Create snapshot B: validFrom=T3, validTo=NULL   [ACTIVE]

Scrape T4 (hash: def456, unchanged)
  -> No action (unique constraint prevents duplicate)
```

**Key Properties**:
- Only created when content actually changed
- `validTo = NULL` marks the currently active version
- Unique constraint `[pageId, contentHash]` prevents duplicates
- Screenshots captured on change (desktop 1280px + mobile 390px + diagnostics)

### 5.3 Performance Snapshots

- One snapshot per page per day (`[pageId, date]` unique)
- Created during COLLECTING phase from GA4 metrics
- Backfilled during initial sync and FILLING_MISSING phase
- Retained for 90 days

### 5.4 Fundraising Snapshots

- Four period types per page: LAST_7_DAYS, PREV_7_DAYS, LAST_30_DAYS, LIFETIME
- Created during COLLECTING phase from EN Public API
- Unique on `[pageId, periodType, periodStart, periodEnd]`
- Re-collected on each sync (upsert pattern)

---

## 6. Decision Logic Reference

### When to Scrape a Page

All conditions OR'd together (any one triggers a scrape):

| Condition | Check | Rationale |
|-----------|-------|-----------|
| Never scraped | `lastScrapedAt IS NULL` | New page needs initial content |
| No hash | `contentHash IS NULL` | Missing change detection baseline |
| Stale | `lastScrapedAt < NOW - 14 days` | Periodic re-check for changes |
| EN Modified | `enModifiedAt > lastScrapedAt` | EN reports content was updated |

### When to Create a Content Snapshot

- **Only when** `newHash !== page.contentHash` (content actually changed)
- Never on re-scrape of unchanged content
- Deduplication via unique `[pageId, contentHash]` constraint

### When to Mark a Page as PAUSED

- Page exists in local DB but NOT returned by EN API `getPages()`
- Only during full sync (debug mode skips pausing to protect real pages)

### When to Skip a Phase

| Phase | Skip Condition |
|-------|---------------|
| SYNCING | Never skipped |
| SCRAPING | `!syncBehavior.contentScrape OR !scrapingSettings.enabled` |
| COLLECTING | `!syncBehavior.fundraisingData` |
| FILLING_MISSING | `!syncBehavior.fillGaps` |
| GENERATING_RECS | Not in pipeline (separate job type or settings) |
| FINALIZING | Never skipped |

### When to Use Playwright vs Axios

| Scenario | Strategy |
|----------|----------|
| First scrape of page | Try axios first |
| Previous scrape got CF block | Go directly to Playwright |
| Axios returns CF challenge markers | Fall back to Playwright |
| Axios gets 403 | Fall back to Playwright |
| `requiresPlaywright` flag set | Skip axios, go to Playwright |

### Blocking vs Non-Blocking Errors

| Sub-Phase | Type | Effect |
|-----------|------|--------|
| GA4 Metrics | Blocking | Page marked failed, error logged |
| NetDonor Data | Non-blocking | Logged in errors array, page continues |
| Fundraising Snapshots | Non-blocking | Logged in errors array, page continues |
| Screenshot Capture | Non-blocking | Warning logged, snapshot created without screenshots |
| Cloudflare Block | Non-error | Counted in cfBlockedCount, page marked processed |

### GA4 Backfill Dormancy Detection

- Calculate `coverage = actualDays / expectedDays`
- Skip if `coverage < 0.1 AND missingDays > 30` (page not generating data)
- Trim backfill to most recent 14 days (avoid expensive historical queries)

---

## 7. Configuration Inventory

### 7.1 Environment Variables

#### Required

| Variable | Type | Purpose |
|----------|------|---------|
| `POSTGRES_URL` | URL | Primary DB connection (pooled) |
| `POSTGRES_PRISMA_URL` | URL | Prisma connection (pooled) |
| `POSTGRES_URL_NON_POOLING` | URL | Direct connection for migrations |
| `EN_API_TOKEN` | String | EN REST API authentication token |
| `GA4_PROPERTY_ID` | String (`properties/\d+`) | GA4 property identifier |
| `GA4_SERVICE_ACCOUNT_KEY` | JSON String | Google service account credentials |
| `ENCRYPTION_KEY` | 64-char hex | AES-256 key for encrypting stored API keys |

#### Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `EN_BASE_URL` | `https://ca.engagingnetworks.app/ens/service` | EN API base URL |
| `EN_PUBLIC_TOKEN` | - | NetDonor fundraising data access |
| `EN_REGION` | `ca` | `us` or `ca` |
| `ANTHROPIC_API_KEY` | - | Claude API key (starts with `sk-ant-`) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public app URL |
| `CRON_SECRET` | - | External cron auth (min 16 chars) |
| `SCREENSHOT_DIR` | `public/screenshots` | Screenshot storage path |
| `ENABLE_SCHEDULER` | `true` | Enable/disable in-process cron |
| `SYNC_DEBUG_LIMIT` | `0` | Limit sync to N pages (0 = unlimited) |
| `REBROWSER_ENABLED` | - | Use rebrowser-playwright for CF bypass |
| `WEBSHARE_PROXY_HOST` | - | Proxy hostname (all 4 proxy vars required together) |
| `WEBSHARE_PROXY_PORT` | - | Proxy port |
| `WEBSHARE_PROXY_USER` | - | Proxy username |
| `WEBSHARE_PROXY_PASS` | - | Proxy password |

---

### 7.2 Application Constants

**File**: `src/config/constants.ts`

#### Job Processing

| Constant | Value | Purpose |
|----------|-------|---------|
| `JOB_MAX_RETRIES` | 3 | Max retry attempts for failed jobs |
| `JOB_RETRY_DELAY_MS` | 2000 | Base delay for exponential backoff |
| `PHASE_DELAY_MS` | 100 | Delay between phase transitions |
| `MAX_ITERATIONS` | 100 | Max iterations per completion call |

#### API Rate Limits & Concurrency

| Constant | Value | Purpose |
|----------|-------|---------|
| `SYNC_PAGE_LIMIT` | 100 | EN API pagination batch size |
| `EN_API_RATE_LIMIT` | 1000 | Requests/hour to EN API |
| `GA4_API_RATE_LIMIT` | 40000 | Requests/day to GA4 API |
| `SCRAPER_CONCURRENT_LIMIT` | 5 | Parallel HTTP scraping requests |
| `SCRAPER_TIMEOUT_MS` | 10000 | Scraper request timeout (ms) |
| `DEEP_SCAN_CONCURRENCY` | 3 | Parallel Playwright browser contexts |

#### GA4 Backfill

| Constant | Value | Purpose |
|----------|-------|---------|
| `GA4_BACKFILL_MAX_RECENT_DAYS` | 14 | Only backfill most recent N missing days |
| `GA4_BACKFILL_CONCURRENCY` | 3 | Pages processed in parallel during backfill |
| `GA4_BACKFILL_DORMANCY_THRESHOLD` | 0.1 | Skip if <10% coverage |

#### Data Retention

| Constant | Value | Purpose |
|----------|-------|---------|
| `SNAPSHOTS_RETENTION_DAYS` | 90 | Performance snapshot retention |
| `JOBS_RETENTION_DAYS` | 30 | Job record retention |
| `RECOMMENDATIONS_RETENTION_DAYS` | 180 | Recommendation retention |

#### CRO Benchmarks

| Constant | Value | Purpose |
|----------|-------|---------|
| `CONVERSION_RATE_POOR` | 0.02 | <2% = poor performance |
| `CONVERSION_RATE_GOOD` | 0.05 | >5% = good performance |
| `BOUNCE_RATE_POOR` | 0.6 | >60% = poor |
| `BOUNCE_RATE_GOOD` | 0.4 | <40% = good |
| `MIN_RECOMMENDATION_CONFIDENCE` | 0.6 | Minimum confidence to show |
| `HIGH_CONFIDENCE_THRESHOLD` | 0.8 | High-confidence marker |

#### UI & Pagination

| Constant | Value | Purpose |
|----------|-------|---------|
| `TREND_ANALYSIS_DAYS` | 30 | Trend calculation window |
| `DASHBOARD_DEFAULT_DAYS` | 7 | Default dashboard view |
| `HISTORICAL_COMPARISON_DAYS` | 90 | Historical comparison window |
| `DEFAULT_PAGE_SIZE` | 50 | Default pagination |
| `MAX_PAGE_SIZE` | 200 | Max pagination |
| `CACHE_TTL_SECONDS` | 300 | Cache time-to-live |

#### Performance SLO Targets

| Constant | Value | Purpose |
|----------|-------|---------|
| `DASHBOARD_LOAD_TARGET_MS` | 30000 | Dashboard load SLO |
| `AI_RECS_TARGET_MS` | 120000 | AI recommendation generation SLO |
| `COLLECTION_JOB_TARGET_MS` | 900000 | Collection job completion SLO |
| `ON_DEMAND_REFRESH_TARGET_MS` | 300000 | On-demand refresh SLO |
| `PAGE_DETAIL_LOAD_TARGET_MS` | 3000 | Page detail view load SLO |

---

### 7.3 AI Configuration

#### Context Profiles (`src/config/ai-profiles.ts`)

| Profile ID | Name | Messaging Strategy | CTA Pattern | Min Gift | Mobile Focus |
|------------|------|-------------------|-------------|----------|--------------|
| `emergency-campaign` | Emergency Campaign | Urgency (+65.9% lift) | "CRISIS: ACT NOW" | $50 | Mobile-first |
| `general-donation` | General Donation | Narrative (+16.2% lift) | "JOIN OUR MOVEMENT" | $100 | Desktop |
| `paid-ads-landing` | Paid Ads Landing | Ultra-short | "CRISIS RELIEF NOW" | $50 | 40-70% mobile |
| `email-appeal` | Email Appeal | Hybrid (Narrative+Urgency) | "TOGETHER FOR URGENT RELIEF" | $100 | Desktop-dominant |
| `recurring-giving` | Recurring Giving | Long-term impact | "PARTNER WITH US" | $10-50/mo | Narrative |
| `event-campaign` | Event/Campaign | Deadline/goal-oriented | Campaign-specific | Varies | Event-specific |

#### Per-Surface Model Selection

| Surface | Default Provider | Default Model |
|---------|-----------------|---------------|
| Chat | Anthropic | claude-sonnet-4-6 |
| Explore | Anthropic | claude-sonnet-4-6 |
| Recommendations | Anthropic | claude-haiku-4-5-20251001 |

#### Available Models

- **Anthropic**: claude-haiku-4-5-20251001, claude-sonnet-4-6, claude-opus-4-6
- **OpenAI**: gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini
- **Google**: gemini-2.5-pro, gemini-2.5-flash
- **Ollama**: Configurable via `aiOllamaBaseUrl`

#### AI Defaults (`src/config/ai-defaults.ts`)

- System prompt provides CRO expertise with industry benchmarks (M+R, NextAfter, Blackbaud: 8-16% nonprofit conversion rates)
- Messaging hierarchy: Narrative > Urgency > Generic > Investment
- CTA best practices: 5-8 words max, specific action verbs
- Output format: Pipe-delimited recommendations (`CATEGORY | CONFIDENCE | TEXT`)

#### AI Tools (`src/config/ai-queries.ts`)

| Tool Key | Label | Description |
|----------|-------|-------------|
| `ga4_query` | GA4 Query | Query Google Analytics data |
| `org_search` | Org Search | Search organization context |
| `page_performance` | Page Performance | Get page metric trends |
| `sitewide_compare` | Sitewide Compare | Compare against portfolio averages |
| `snapshot_compare` | Snapshot Compare | Compare content versions |

---

### 7.4 Framework Configuration

#### Next.js (`next.config.js`)

| Setting | Value | Purpose |
|---------|-------|---------|
| `output` | `standalone` | Docker-optimized build |
| `typescript.ignoreBuildErrors` | `false` | Strict TS during build |
| `eslint.ignoreDuringBuilds` | `false` | Strict linting during build |
| `serverExternalPackages` | `['rebrowser-playwright']` | Server-side package |
| `serverActions.bodySizeLimit` | `2mb` | Max POST body size |

#### TypeScript (`tsconfig.json`)

- Target: ES2020, Strict mode enabled
- Path alias: `@/*` -> `./src/*`
- Module resolution: `bundler`

#### Docker (`docker-compose.yml`)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `postgres` | `postgres:15-alpine` | 54320:5432 | PostgreSQL |
| `pgadmin` | `dpage/pgadmin4:latest` | 50500:80 | DB admin UI |
| `app` | Local build | 3000:3000 | Next.js app |

---

### 7.5 Package Dependencies

#### AI & LLM
`@ai-sdk/anthropic` v3.0.69, `@ai-sdk/google` v3.0.61, `@ai-sdk/openai` v3.0.52, `@ai-sdk/react` v3.0.160, `ai` v6.0.158, `ollama-ai-provider-v2` v3.5.0

#### Database
`@prisma/client` v6.17.1, `prisma` v6.17.1

#### APIs & Integration
`@google-analytics/data` v5.2.1, `axios` v1.12.2, `axios-cookiejar-support` v6.0.5, `tough-cookie` v6.0.0

#### Scraping
`playwright` v1.58.2, `cheerio` v1.1.2, `rebrowser-playwright` v1.52.0 (optional)

#### UI Framework
`react` v19.2.0, `next` v15.5.12, `tailwindcss` v4.1.14, `recharts` v2.15.4, `lucide-react` v0.546.0

#### Utilities
`zod` v4.1.12, `date-fns` v4.1.0, `p-limit` v7.3.0, `node-cron` v4.2.1

---

## 8. API Route Reference

### Jobs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/jobs` | Create collection job (validates EN key, 409 if active) |
| GET | `/api/jobs` | List jobs (filter by status, limit max 50) |
| GET | `/api/jobs/[id]` | Get job status (includes stuck detection, canRetry flag) |
| POST | `/api/jobs/[id]/process` | Process single chunk (manual recovery) |
| POST | `/api/jobs/[id]/debug/[phase]` | Debug single page in specific phase |

### Pages

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/pages` | List pages with metrics (sortable, paginated) |
| GET | `/api/pages/[id]` | Page detail with latest snapshot |
| GET | `/api/pages/[id]/content-snapshots` | Content version history (last 50) |
| POST | `/api/pages/[id]/scrape` | Trigger single-page scrape |

### Settings

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/settings` | Get all settings (keys masked) |
| PUT | `/api/settings` | Update settings (encrypts new keys) |
| POST | `/api/settings/test-en` | Test EN API connection |
| POST | `/api/settings/test-ga` | Test GA4 connection |
| POST | `/api/settings/clear` | Reset to defaults |

### Cron

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/cron/daily-collection` | CRON_SECRET bearer | External collection trigger |
| GET | `/api/cron/cleanup` | CRON_SECRET bearer | External cleanup trigger |

### Other

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/dashboard/summary` | Dashboard aggregations |
| GET | `/api/recommendations` | List recommendations |
| POST | `/api/recommendations/[id]/dismiss` | Dismiss recommendation |

---

## 9. Technical Audit

### 9.1 Security Findings

#### CRITICAL

**9.1.1 Exposed Service Account Key in Repository**
- **File**: `marketflow-pro-462203-bca4ef89cfe1.json` (project root)
- **Issue**: Google Cloud service account private key committed to repo. Contains full RSA private key and client email. Referenced in `.gitignore` but was committed before being added.
- **Impact**: Full access to Google Cloud project, potential data exfiltration
- **Remediation**:
  1. Immediately revoke this service account key in Google Cloud Console
  2. Create a new key
  3. Remove from git history via `git filter-branch` or BFG
  4. Audit GA4 API access logs

**9.1.2 ENCRYPTION_KEY as Single Point of Failure**
- **Issue**: While crypto.ts implements AES-256-GCM for stored keys, the `ENCRYPTION_KEY` itself is in `.env` as plaintext
- **Impact**: If `.env` compromised, all encrypted values are exposed
- **Remediation**: Use secrets manager (AWS Secrets Manager, HashiCorp Vault) for production

#### HIGH

**9.1.3 No Input Validation on Scraper URLs (Potential SSRF)**
- **File**: `src/lib/scraper.ts` line ~471
- **Issue**: `scrapePage(url)` accepts URLs without domain validation
- **Remediation**: Add URL allowlist validation for EN domains only

**9.1.4 CRON_SECRET Validation Edge Case**
- **File**: `src/app/api/cron/daily-collection/route.ts` line ~19
- **Issue**: If `CRON_SECRET` is empty/undefined, the check `!expectedAuth` silently passes
- **Remediation**: Require `CRON_SECRET` in production, throw error if missing

#### MEDIUM

**9.1.5 No Rate Limiting on API Routes**
- **Impact**: All API endpoints vulnerable to brute force
- **Remediation**: Add rate limiting middleware

**9.1.6 Error Messages May Leak Implementation Details**
- **File**: `src/lib/api-helpers.ts`
- **Issue**: `error.message` exposed directly to clients in 500 responses
- **Remediation**: Generic message in production, log full details server-side only

**9.1.7 No Explicit CORS Configuration**
- Default same-origin is secure, but should be explicitly documented if cross-origin access needed

---

### 9.2 Code Smells

#### HIGH

**9.2.1 `jobs.ts` is a God File (3,308 lines)**
- **File**: `src/lib/jobs.ts`
- Single `JobProcessor` class handles: job creation, scheduling, execution, page scraping orchestration, GA4 collection, recommendation generation, error handling, progress tracking
- **Remediation**: Extract into focused classes:
  - `SyncPhaseOrchestrator` for phase management
  - `JobStatusManager` for state transitions
  - `ScrapingOrchestrator` for scraping logic
  - `CollectionOrchestrator` for data collection
  - Target ~600 lines each

**9.2.2 Excessive `any` and `unknown` Types**
- 181 instances of `any` or `unknown` in `/src/lib` directory
- Example: `(job.errors as any[])?.filter((e: any) => ...)`
- **Remediation**: Create strict types for error arrays, use discriminated unions

**9.2.3 Inconsistent Error Handling Across API Routes**
- Mix of: try/catch with `handleApiError()`, throw with top-level handler, custom responses
- **Remediation**: Standardized error middleware for all API routes

#### MEDIUM

**9.2.4 In-Memory Sorting in /api/pages**
- **File**: `src/app/api/pages/route.ts` line ~85
- All pages fetched into memory before sorting (`[...pagesWithMetrics].sort(...)`)
- **Impact**: O(n) memory for large page sets
- **Remediation**: Move sorting to database query

**9.2.5 Missing Input Validation on URL Path Parameters**
- Page IDs from URL params not validated as valid CUIDs before processing
- **Remediation**: Validate with zod schema

#### LOW

**9.2.6 Magic Numbers**
- `amount <= 100000` (scraper.ts), hardcoded timeouts (`30000`), phase progress values
- **Remediation**: Extract to constants

---

### 9.3 Architectural Concerns

#### HIGH

**9.3.1 Single-Process Scheduler Not Horizontally Scalable**
- **File**: `src/lib/scheduler.ts`
- Cron jobs run in-process via `node-cron`. Cannot scale to multiple processes/containers. If main process crashes, cron stops. No job persistence between restarts.
- **Remediation**: External job queue (Bull, Cloud Tasks) with leader election

**9.3.2 Potential Race Condition in Job Processing**
- **File**: `src/lib/jobs.ts` line ~238
- `processingLock` is a JavaScript Set, not atomic. Two concurrent calls could both pass the `has()` check.
- **Note**: Lower risk in practice due to Node.js single-threaded event loop, but problematic in clustered deployments
- **Remediation**: Database-level locking with Prisma optimistic concurrency

**9.3.3 Incomplete Job Recovery on Failure**
- No automatic resume mechanism when phases fail. Manual intervention via `/api/jobs/[id]/process`. No circuit breaker pattern.
- **Remediation**: Exponential backoff retry, circuit breaker, retry count tracking

#### MEDIUM

**9.3.4 N+1 Query Pattern in Data Collection**
- Multiple database queries per page inside processing loops
- **Remediation**: Use Prisma `include` for batch loading

**9.3.5 Memory Leak Risk in Browser Singleton**
- Browser instances rely on explicit `closeBrowser()` call. No automatic cleanup timeout.
- **Remediation**: Add cleanup interval, use `finally` blocks in all scraping routes

**9.3.6 Missing Database Indexes**
- `CollectionJob.status` alone (frequently filtered, only composite exists)
- **Remediation**: Add targeted indexes for common query patterns

---

### 9.4 Testing Gaps

**CRITICAL**: No test suite exists. `/tests/` directory is empty.

**Minimum Viable Test Coverage Needed**:
1. Encryption/decryption roundtrip tests
2. Job state machine transition tests
3. API input validation tests
4. Content hash computation tests
5. Error handling path tests
6. Integration tests for external API clients (mocked)
7. E2E tests for full sync pipeline

---

### 9.5 Positive Patterns

**Architecture**:
- Core business logic properly separated in `/src/lib`, API routes are thin
- Custom error types provide semantic error handling
- Comprehensive env validation with Zod

**Security**:
- API keys encrypted at rest with AES-256-GCM
- Displayed keys are masked (`****abcd`)
- CRON_SECRET auth on scheduled endpoints
- No SQL injection risk (Prisma ORM throughout, no raw queries)
- Only one `dangerouslySetInnerHTML` instance, and it's safe (hardcoded CSS)

**Database Design**:
- Proper foreign keys with cascade deletes
- Composite indexes on frequently filtered columns
- Audit fields (`createdAt`, `updatedAt`) on all tables
- Unique constraints where needed

**Logging**:
- Structured logging with levels, context, and correlation
- Dual transport (console + file) with environment-specific config
- API call tracking with timing and error details
- Slow query detection

**Operational**:
- Automated cleanup job with configurable retention
- Connection testing separate from runtime operations
- Graceful Cloudflare handling (non-error, continues processing)
- Phase skipping respects settings (configurable pipeline)

---

## 10. Data Flow Diagrams

### Complete SYNC Job Data Flow

```
USER/CRON
   |
   v
POST /api/jobs (or scheduler tick)
   |
   v
JobProcessor.createCollectionJob()
   |- Status: PENDING
   |- Phase: First enabled (SYNCING)
   |- totalPages: Count of ACTIVE pages
   |
   v
processJobToCompletion() [auto-loop, max 100 iterations]
   |
   v
+------------------------------------------------------------------+
| SYNCING PHASE                                                     |
|  |- EN API: GET /page (paginated, limit=100)                     |
|  |- Per page: GET /page/{id} (details)                           |
|  |- DB: Create/update FundraisingPage records                    |
|  |- Mark missing pages as PAUSED                                  |
+------------------------------------------------------------------+
   |
   v
+------------------------------------------------------------------+
| SCRAPING PHASE                                                    |
|  |- Select pages (smart scan: 4-signal OR)                       |
|  |- Parallel scrape (p-limit, concurrency=3)                     |
|  |- Per page:                                                     |
|  |   |- Axios fetch (CF fallback: Playwright)                    |
|  |   |- Extract: h1, meta, appeal, narrative, CTAs, amounts      |
|  |   |- Detect payment gateway                                    |
|  |   |- Compute contentHash (SHA-256)                             |
|  |   |- DB: UPDATE FundraisingPage (all scraped fields)          |
|  |   |- If hash changed:                                          |
|  |       |- Backfill prev snapshot validTo                        |
|  |       |- Capture screenshots (desktop + mobile)                |
|  |       |- DB: CREATE ContentSnapshot                            |
+------------------------------------------------------------------+
   |
   v
+------------------------------------------------------------------+
| COLLECTING PHASE                                                  |
|  |- Per page:                                                     |
|  |   |- [BLOCKING] GA4: getMetricsForDateRange()                 |
|  |   |   |- DB: Upsert PerformanceSnapshot (per day)             |
|  |   |                                                            |
|  |   |- [NON-BLOCKING] NetDonor: fetchNetDonor()                 |
|  |   |   |- DB: UPDATE FundraisingPage (fundraising fields)      |
|  |   |                                                            |
|  |   |- [NON-BLOCKING] FundraisingSummary (4 periods)            |
|  |       |- DB: Upsert FundraisingSnapshot (per period)          |
+------------------------------------------------------------------+
   |
   v
+------------------------------------------------------------------+
| FILLING_MISSING PHASE                                             |
|  |- GA4 gap backfill (parallel, concurrency=3)                   |
|  |   |- Find date gaps, trim to 14 most recent days              |
|  |   |- DB: Upsert PerformanceSnapshot per gap                   |
|  |                                                                |
|  |- NetDonor retry (pages with campaignId but null data)         |
|  |- FundraisingSnapshot retry (missing period types)             |
|  |- Content depth fill (missing screenshots/diagnostics)          |
+------------------------------------------------------------------+
   |
   v
+------------------------------------------------------------------+
| FINALIZING PHASE                                                  |
|  |- Close Playwright browser sessions                             |
|  |- Aggregate totals and error summary                            |
|  |- DB: UPDATE CollectionJob status                               |
|  |   |- COMPLETED (zero errors)                                   |
|  |   |- COMPLETED_WITH_ERRORS (some pages failed)                |
+------------------------------------------------------------------+
```

### Database Write Summary Per Page (Full Sync)

| Table | Writes | Condition |
|-------|--------|-----------|
| FundraisingPage | 1 update (sync) + 1 update (scrape) | Always |
| ContentSnapshot | 0-1 insert | Only if content hash changed |
| PerformanceSnapshot | 1+ upsert | 1 per day of GA4 data |
| FundraisingSnapshot | 0-4 upserts | Per period from EN Public API |
| OptimizationRecommendation | 0-6 inserts | If GENERATING_RECS enabled |

---

## Appendix: Database Enums

| Enum | Values |
|------|--------|
| PageStatus | ACTIVE, PAUSED, ARCHIVED |
| SyncStatus | PENDING, SUCCESS, FAILED |
| JobStatus | PENDING, PROCESSING, COMPLETED, COMPLETED_WITH_ERRORS, FAILED, CANCELLED |
| JobPhase | SYNCING, SCRAPING, COLLECTING, FILLING_MISSING, GENERATING_RECS, FINALIZING |
| JobType | SYNC, MANUAL_SCRAPE, MANUAL_RECS, BACKFILL |
| RecommendationCategory | CONTENT, DESIGN, PRICING, CTA, TECHNICAL, SOCIAL_PROOF |
| RecommendationStatus | ACTIVE, IMPLEMENTED, DISMISSED, SUPERSEDED |
| ConnectionStatus | UNKNOWN, CONNECTED, DISCONNECTED, TESTING |
| RefreshSchedule | ON_DEMAND, HOURLY, DAILY, WEEKLY |
| PeriodType | LAST_7_DAYS, PREV_7_DAYS, LAST_30_DAYS, LIFETIME |
