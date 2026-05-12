# Engaging Networks API Documentation

Complete reference for Engaging Networks REST API integration in the Crescendo platform.

**Official Documentation**: [https://developer.engagingnetworks.net/api/rest/](https://developer.engagingnetworks.net/api/rest/)

**Last Updated**: 2025-10-17

---

## Table of Contents

1. [Overview](#overview)
2. [Regional Instances](#regional-instances)
3. [Authentication](#authentication)
4. [API Endpoints](#api-endpoints)
5. [Rate Limits](#rate-limits)
6. [Error Handling](#error-handling)
7. [Pagination](#pagination)
8. [Use Cases for Crescendo](#use-cases-for-crescendo)
9. [Code Examples](#code-examples)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Engaging Networks REST API provides programmatic access to your organization's fundraising pages, supporter data, and campaign metrics.

**Base URL Structure**: `https://{region}.e-activist.com/ens/service` or `https://{region}.engagingnetworks.app/ens/service`

**Authentication**: API token via `ens-auth-token` header

**Format**: JSON (request and response)

**Protocol**: HTTPS only

---

## Regional Instances

Engaging Networks has different regional deployments. Your organization will use one of these:

### United States (US)

- **Legacy**: `https://us.e-activist.com/ens/service`
- **Current**: `https://us.engagingnetworks.app/ens/service`

### Canada (CA)

- **Legacy**: `https://ca.e-activist.com/ens/service`
- **Current**: `https://ca.engagingnetworks.app/ens/service`

### Europe (EU)

- **Legacy**: `https://eu.e-activist.com/ens/service`
- **Current**: `https://eu.engagingnetworks.app/ens/service`

### Australia (AU)

- **Legacy**: `https://au.e-activist.com/ens/service`
- **Current**: `https://au.engagingnetworks.app/ens/service`

**Important**: Check your EN admin panel URL to determine your region. Update `src/lib/engaging-networks.ts` with the correct base URL if needed.

**Our Implementation**: Currently configured for **US region**. Change `EN_BASE_URL` in `src/lib/engaging-networks.ts` if your organization uses a different region.

---

## Authentication

### API Token

Engaging Networks uses token-based authentication with the `ens-auth-token` header.

**Official Docs**: [Authentication](https://developer.engagingnetworks.net/api/rest/index.html#/operations/authenticate)

### Getting Your API Token

1. Log into your EN admin panel
2. Navigate to **Settings** → **API**
3. Find or generate your API token
4. Copy the token (long alphanumeric string)
5. Add to `.env.local`:
   ```env
   EN_API_TOKEN="your_token_here"
   ```

### Authentication Test

Test your token with a simple request:

```bash
curl --request GET \
  --url https://us.e-activist.com/ens/service/page \
  --header 'Accept: application/json' \
  --header 'ens-auth-token: YOUR_TOKEN_HERE'
```

**Expected**: JSON array of your pages
**Error 401**: Invalid or expired token
**Error 403**: Token lacks necessary permissions

### Token Security

- ✅ Store in environment variables (`.env.local`)
- ✅ Never commit to version control
- ✅ Rotate tokens periodically (every 90 days)
- ❌ Never expose in client-side code
- ❌ Never log or display in error messages

---

## API Endpoints

### 1. List Pages

Get a list of all pages in your account.

**Official Docs**: [List Pages](https://developer.engagingnetworks.net/api/rest/index.html#/operations/listPages)

**Endpoint**: `GET /page`

**Query Parameters**:

- `type` (string, optional): Filter by page type
  - `donation` - Donation pages
  - `advocacy` - Advocacy/petition pages
  - `event` - Event registration pages
  - `survey` - Survey pages
- `status` (string, optional): Filter by status
  - `live` - Published pages
  - `draft` - Unpublished drafts
  - `archived` - Archived pages
- `limit` (integer, optional): Number of results (default: 10, max: 100)
- `offset` (integer, optional): Pagination offset (default: 0)

**Request Example**:

```bash
curl --request GET \
  --url 'https://us.e-activist.com/ens/service/page?type=donation&status=live&limit=50' \
  --header 'Accept: application/json' \
  --header 'ens-auth-token: YOUR_TOKEN'
```

**Response Example**:

```json
[
  {
    "id": "12345",
    "name": "Emergency Relief Fund",
    "type": "donation",
    "status": "live",
    "url": "https://example.org/donate/emergency-relief",
    "createdDate": "2024-01-15T10:30:00Z",
    "modifiedDate": "2024-10-10T14:22:00Z",
    "locale": "en_US",
    "campaign": "Q4 2024 Campaign"
  },
  {
    "id": "12346",
    "name": "Monthly Giving Program",
    "type": "donation",
    "status": "live",
    "url": "https://example.org/donate/monthly",
    "createdDate": "2024-02-01T09:00:00Z",
    "modifiedDate": "2024-10-12T11:45:00Z",
    "locale": "en_US",
    "campaign": "Monthly Donors"
  }
]
```

**Use in Crescendo**: We use this endpoint to fetch all active donation pages for daily monitoring.

---

### 2. Get Page Details

Get detailed information about a specific page.

**Official Docs**: [Get Page Details](https://developer.engagingnetworks.net/api/rest/index.html#/operations/getPageDetails)

**Endpoint**: `GET /page/{pageId}`

**Path Parameters**:

- `pageId` (string, required): The page ID

**Request Example**:

```bash
curl --request GET \
  --url https://us.e-activist.com/ens/service/page/12345 \
  --header 'Accept: application/json' \
  --header 'ens-auth-token: YOUR_TOKEN'
```

**Response Example**:

```json
{
  "id": "12345",
  "name": "Emergency Relief Fund",
  "type": "donation",
  "status": "live",
  "url": "https://example.org/donate/emergency-relief",
  "createdDate": "2024-01-15T10:30:00Z",
  "modifiedDate": "2024-10-10T14:22:00Z",
  "locale": "en_US",
  "campaign": "Q4 2024 Campaign",
  "pageTemplate": {
    "id": "template_123",
    "name": "Standard Donation Template",
    "version": "2.0"
  },
  "formFields": [
    {
      "name": "firstName",
      "label": "First Name",
      "type": "text",
      "required": true
    },
    {
      "name": "lastName",
      "label": "Last Name",
      "type": "text",
      "required": true
    },
    {
      "name": "emailAddress",
      "label": "Email",
      "type": "email",
      "required": true
    },
    {
      "name": "donationAmt",
      "label": "Donation Amount",
      "type": "radio",
      "required": true,
      "options": ["25", "50", "100", "250", "500", "other"]
    }
  ],
  "settings": {
    "thankYouPage": "https://example.org/thank-you",
    "confirmationEmail": true,
    "goalAmount": 100000,
    "goalProgress": 45230
  }
}
```

**Use in Crescendo**: We use this to get page configuration details, form fields, and donation amount options for AI analysis.

---

### 3. Get Page Transactions (Submissions)

Get transaction/submission data for a page.

**Endpoint**: `GET /page/{pageId}/transaction`

**Query Parameters**:

- `startDate` (string, optional): ISO 8601 date (e.g., "2024-10-01")
- `endDate` (string, optional): ISO 8601 date (e.g., "2024-10-17")
- `limit` (integer, optional): Number of results (default: 10, max: 100)
- `offset` (integer, optional): Pagination offset

**Request Example**:

```bash
curl --request GET \
  --url 'https://us.e-activist.com/ens/service/page/12345/transaction?startDate=2024-10-01&endDate=2024-10-17&limit=100' \
  --header 'Accept: application/json' \
  --header 'ens-auth-token: YOUR_TOKEN'
```

**Response Example**:

```json
{
  "total": 234,
  "count": 100,
  "offset": 0,
  "transactions": [
    {
      "id": "txn_abc123",
      "pageId": "12345",
      "submissionDate": "2024-10-17T10:30:00Z",
      "amount": 50.0,
      "currency": "USD",
      "frequency": "single",
      "status": "completed",
      "supporter": {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@example.com"
      }
    },
    {
      "id": "txn_abc124",
      "pageId": "12345",
      "submissionDate": "2024-10-17T11:45:00Z",
      "amount": 100.0,
      "currency": "USD",
      "frequency": "monthly",
      "status": "completed",
      "supporter": {
        "firstName": "Jane",
        "lastName": "Smith",
        "email": "jane.smith@example.com"
      }
    }
  ]
}
```

**Use in Crescendo**: We primarily rely on Google Analytics for page views and conversions, but this endpoint can supplement with EN-specific transaction data.

---

### 4. Get Page Statistics (Summary Metrics)

Get aggregated statistics for a page.

**Endpoint**: `GET /page/{pageId}/statistics`

**Query Parameters**:

- `startDate` (string, optional): ISO 8601 date
- `endDate` (string, optional): ISO 8601 date

**Request Example**:

```bash
curl --request GET \
  --url 'https://us.e-activist.com/ens/service/page/12345/statistics?startDate=2024-10-01&endDate=2024-10-17' \
  --header 'Accept: application/json' \
  --header 'ens-auth-token: YOUR_TOKEN'
```

**Response Example**:

```json
{
  "pageId": "12345",
  "startDate": "2024-10-01",
  "endDate": "2024-10-17",
  "submissions": 234,
  "totalRevenue": 15670.0,
  "averageDonation": 66.97,
  "uniqueVisitors": 5234,
  "conversionRate": 0.0447,
  "topDonationAmount": 100.0,
  "monthlyDonors": 45,
  "oneTimeDonors": 189
}
```

**Use in Crescendo**: This provides high-level metrics that complement GA4 data. Useful for cross-validation and EN-specific insights.

---

## Rate Limits

### Current Limits (as of 2024)

- **Rate**: ~1000 requests per hour per account
- **Burst**: Up to 10 requests per second
- **Throttling**: HTTP 429 response when exceeded

### Rate Limit Headers

EN API includes rate limit information in response headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1698336000
```

### Best Practices

1. **Implement Exponential Backoff**:

   ```typescript
   // Already implemented in src/lib/engaging-networks.ts
   if (error.response?.status === 429) {
     const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
     await new Promise((resolve) => setTimeout(resolve, delay));
   }
   ```

2. **Cache Results**: Store page metadata locally, refresh only when needed

3. **Batch Requests**: Use pagination efficiently (limit=100)

4. **Schedule Wisely**: Run data collection during off-peak hours

5. **Monitor Usage**: Log API calls to track against limits

### Rate Limit Response

When rate limited, you'll receive:

```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again later.",
  "retryAfter": 3600
}
```

**HTTP Status**: 429 Too Many Requests
**Retry-After Header**: Seconds until rate limit resets

---

## Error Handling

### Common Error Codes

| Status Code | Error                 | Cause                       | Solution                            |
| ----------- | --------------------- | --------------------------- | ----------------------------------- |
| 400         | Bad Request           | Invalid parameters          | Check request format and parameters |
| 401         | Unauthorized          | Invalid or missing token    | Verify token in .env.local          |
| 403         | Forbidden             | Token lacks permissions     | Contact EN admin for access         |
| 404         | Not Found             | Page/resource doesn't exist | Verify page ID                      |
| 429         | Too Many Requests     | Rate limit exceeded         | Implement exponential backoff       |
| 500         | Internal Server Error | EN server error             | Retry with exponential backoff      |
| 503         | Service Unavailable   | EN maintenance/downtime     | Check EN status page                |

### Error Response Format

```json
{
  "error": "InvalidParameter",
  "message": "The 'type' parameter must be one of: donation, advocacy, event, survey",
  "field": "type",
  "value": "fundraiser"
}
```

### Error Handling in Code

Our implementation (`src/lib/engaging-networks.ts`) includes:

```typescript
async fetchWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      // Retry on rate limit (429)
      if (error.response?.status === 429 && i < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, i) + Math.random() * 1000, 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      // Retry on server errors (5xx)
      if (error.response?.status >= 500 && i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

## Pagination

### Query Parameters

- `limit`: Number of results per page (default: 10, max: 100)
- `offset`: Number of records to skip (default: 0)

### Example: Fetching All Pages

```typescript
async function getAllPages(): Promise<ENPage[]> {
  const allPages: ENPage[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const pages = await enClient.getPages({
      type: 'donation',
      status: 'live',
      limit,
      offset,
    });

    allPages.push(...pages);

    // If we got fewer results than the limit, we've reached the end
    hasMore = pages.length === limit;
    offset += limit;
  }

  return allPages;
}
```

### Pagination Best Practices

1. **Use Maximum Limit**: Always use `limit=100` to minimize API calls
2. **Check Result Count**: Stop when results < limit
3. **Handle Timeouts**: Implement pagination in chunks with breaks
4. **Track Progress**: Store offset in database for resumable pagination

---

## Use Cases for Crescendo

### 1. Daily Data Collection

**Goal**: Fetch all active donation pages for monitoring

**Endpoint**: `GET /page?type=donation&status=live&limit=100`

**Frequency**: Once per day (via Vercel Cron)

**Implementation**: `src/lib/jobs.ts` → `collectPageData()`

```typescript
// Get all active donation pages
const pages = await enClient.getPages({
  type: 'donation',
  status: 'live',
  limit: 100,
});

// Store in database
for (const page of pages) {
  await prisma.fundraisingPage.upsert({
    where: { enPageId: page.id },
    update: {
      name: page.name,
      url: page.url,
      status: 'ACTIVE',
    },
    create: {
      enPageId: page.id,
      name: page.name,
      url: page.url,
      pageType: page.type,
      status: 'ACTIVE',
    },
  });
}
```

### 2. Page Detail Enrichment

**Goal**: Get page configuration for AI analysis

**Endpoint**: `GET /page/{pageId}`

**Frequency**: Once per page when first discovered, or when page is modified

**Implementation**: Called from data collection job

```typescript
// Get detailed page information
const pageDetail = await enClient.getPage(page.enPageId);

// Extract donation amounts from form fields
const donationField = pageDetail.formFields.find((f) => f.name === 'donationAmt');
const donationAmounts = donationField?.options?.map(parseFloat) || [];

// Update database with details
await prisma.fundraisingPage.update({
  where: { enPageId: page.enPageId },
  data: {
    donationAmounts,
    // Note: We scrape H1, CTA from actual page HTML
    // EN API provides form structure, not rendered content
  },
});
```

### 3. Transaction Metrics (Optional)

**Goal**: Supplement GA4 data with EN transaction details

**Endpoint**: `GET /page/{pageId}/statistics`

**Frequency**: Daily, for past 24 hours

**Implementation**: Optional enhancement to cross-validate GA4 data

```typescript
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = yesterday.toISOString().split('T')[0];

const stats = await enClient.getPageMetrics(page.enPageId, yesterdayStr, yesterdayStr);

// Cross-validate with GA4 data
console.log(`EN Submissions: ${stats.submissions}`);
console.log(`GA4 Conversions: ${gaMetrics.conversions}`);
// Ideally these should match
```

---

## Code Examples

### Example 1: Test Connection

```typescript
// test-en-connection.ts
import { enClient } from '@/lib/engaging-networks';

async function testConnection() {
  try {
    console.log('Testing Engaging Networks API connection...');

    const pages = await enClient.getPages({ limit: 5 });

    console.log(`✓ Connected successfully!`);
    console.log(`Found ${pages.length} pages`);
    console.log(`First page: ${pages[0]?.name}`);
  } catch (error) {
    console.error('✗ Connection failed:', error);
  }
}

testConnection();
```

### Example 2: Fetch All Donation Pages

```typescript
// fetch-all-pages.ts
import { enClient } from '@/lib/engaging-networks';

async function fetchAllDonationPages() {
  const allPages = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = await enClient.getPages({
      type: 'donation',
      status: 'live',
      limit: 100,
      offset,
    });

    allPages.push(...batch);
    hasMore = batch.length === 100;
    offset += 100;

    console.log(`Fetched ${allPages.length} pages so far...`);
  }

  console.log(`Total pages found: ${allPages.length}`);
  return allPages;
}

fetchAllDonationPages();
```

### Example 3: Get Page Details with Error Handling

```typescript
// get-page-safe.ts
import { enClient } from '@/lib/engaging-networks';

async function getPageSafe(pageId: string) {
  try {
    const page = await enClient.getPage(pageId);
    console.log(`Page: ${page.name}`);
    console.log(`URL: ${page.url}`);
    console.log(`Status: ${page.status}`);
    console.log(`Form Fields: ${page.formFields.length}`);
    return page;
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.error(`Page ${pageId} not found`);
    } else if (error.response?.status === 403) {
      console.error(`Access denied to page ${pageId}`);
    } else {
      console.error(`Error fetching page ${pageId}:`, error.message);
    }
    return null;
  }
}

getPageSafe('12345');
```

---

## Troubleshooting

### Issue: "401 Unauthorized"

**Cause**: Invalid or missing API token

**Solutions**:

1. Verify token in `.env.local` matches EN admin panel
2. Check for extra spaces or quotes in token
3. Regenerate token in EN admin if expired
4. Ensure token has necessary permissions

**Test**:

```bash
# Verify token works
curl -H "ens-auth-token: YOUR_TOKEN" \
  https://us.e-activist.com/ens/service/page
```

### Issue: "404 Not Found"

**Cause**: Incorrect endpoint or page doesn't exist

**Solutions**:

1. Verify page ID is correct
2. Check that page isn't archived or deleted
3. Confirm base URL matches your region (US/CA/EU/AU)
4. Use `/page` endpoint to list all pages first

### Issue: "429 Rate Limit Exceeded"

**Cause**: Too many API requests

**Solutions**:

1. Our retry logic should handle this automatically
2. If persistent, reduce data collection frequency
3. Implement caching for page metadata
4. Contact EN support to increase rate limits

### Issue: Wrong Regional Instance

**Cause**: Using wrong base URL for your account

**Solution**:
Update `src/lib/engaging-networks.ts`:

```typescript
// Change this line to match your region:
const EN_BASE_URL = 'https://ca.engagingnetworks.app/ens/service'; // Canada
// OR
const EN_BASE_URL = 'https://eu.engagingnetworks.app/ens/service'; // Europe
// OR
const EN_BASE_URL = 'https://au.engagingnetworks.app/ens/service'; // Australia
```

**How to verify**: Check your EN admin panel URL

- If you log in at `ca.engagingnetworks.app` → Use CA instance
- If you log in at `us.e-activist.com` → Use US instance

### Issue: Missing or Incomplete Data

**Cause**: Page configuration or permissions

**Solutions**:

1. Verify page is published (`status: 'live'`)
2. Check page type is `donation` (not `advocacy` or `event`)
3. Ensure API token has read access to pages
4. Some fields may be null if not configured in EN

### Issue: Slow Response Times

**Cause**: Large datasets or EN server load

**Solutions**:

1. Use pagination (`limit=100`) instead of fetching all at once
2. Cache page metadata that doesn't change often
3. Run data collection during off-peak hours
4. Implement timeout handling (our client has 30s timeout)

---

## API Changes and Updates

### Monitoring for Changes

Engaging Networks occasionally updates their API. To stay current:

1. **Subscribe to EN API updates**: Contact your account manager
2. **Check developer portal**: [https://developer.engagingnetworks.net/](https://developer.engagingnetworks.net/)
3. **Test regularly**: Our integration tests should catch breaking changes
4. **Monitor error logs**: Unexpected 400 errors may indicate API changes

### Version History

- **2024**: Current API version (no version number in URL)
- **Legacy**: Older `/ea` endpoints deprecated
- **Current**: `/ens/service` endpoints (what we use)

### Deprecation Notices

If EN deprecates endpoints, they typically:

- Announce 6 months in advance
- Provide migration guide
- Support legacy endpoints during transition

**Action**: Check [EN Developer Portal](https://developer.engagingnetworks.net/) quarterly for updates

---

## Additional Resources

### Official Documentation

- **API Reference**: [https://developer.engagingnetworks.net/api/rest/](https://developer.engagingnetworks.net/api/rest/)
- **Authentication**: [https://developer.engagingnetworks.net/api/rest/index.html#/operations/authenticate](https://developer.engagingnetworks.net/api/rest/index.html#/operations/authenticate)
- **List Pages**: [https://developer.engagingnetworks.net/api/rest/index.html#/operations/listPages](https://developer.engagingnetworks.net/api/rest/index.html#/operations/listPages)
- **Get Page Details**: [https://developer.engagingnetworks.net/api/rest/index.html#/operations/getPageDetails](https://developer.engagingnetworks.net/api/rest/index.html#/operations/getPageDetails)

### Support

- **EN Support Portal**: Contact through your EN admin panel
- **Account Manager**: Your organization's dedicated EN contact
- **Developer Community**: EN user forums and Slack channels

### Related Documentation

- **Our Implementation**: `src/lib/engaging-networks.ts`
- **GA4 Integration**: `docs/CREDENTIAL-SETUP-GUIDE.md` (GA4 section)
- **Job Processing**: `src/lib/jobs.ts`

---

**Last Updated**: 2025-10-17
**Maintained By**: Orkestre AI
