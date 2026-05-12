# Google Analytics 4 API Documentation

**Created**: 2025-10-20  
**Last Updated**: 2025-11-26  
**Status**: Active

Complete reference for Google Analytics 4 Data API integration in the Crescendo platform.

---

## Table of Contents

1. [Overview](#overview)
2. [Setup & Configuration](#setup--configuration)
3. [API Methods](#api-methods)
4. [Metrics Reference](#metrics-reference)
5. [Error Handling](#error-handling)
6. [Performance Characteristics](#performance-characteristics)
7. [Troubleshooting](#troubleshooting)
8. [Related Documentation](#related-documentation)

---

## Overview

We use the **Google Analytics Data API v1** to fetch page performance metrics (page views, bounce rate, conversions, revenue). This integration provides real-time performance data for optimization recommendations.

**Base API**: Google Analytics Data API (v1beta)  
**Authentication**: Service Account with JSON key  
**Format**: JSON (request and response)  
**Protocol**: HTTPS only

---

## Setup & Configuration

### Prerequisites

- Google Cloud Project with GA4 Data API enabled
- Service Account with GA4 property access
- JSON key file for authentication

See [Credential Setup Guide](../guides/credential-setup.md) for detailed setup instructions.

### Environment Variables

```bash
GA4_PROPERTY_ID="properties/123456789"
GA4_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
```

### Dependencies

```json
{
  "@google-analytics/data": "^5.2.1"
}
```

---

## API Methods

### getPageMetrics()

Get performance metrics for a specific page path over a date range.

**Signature**:

```typescript
async getPageMetrics(
  pagePath: string,
  startDate: string,
  endDate: string
): Promise<GA4PageMetrics>
```

**Parameters**:

- `pagePath` (string, required): Page path (e.g., "/page/100067/donate/1")
- `startDate` (string, required): ISO 8601 date (e.g., "2025-10-18")
- `endDate` (string, required): ISO 8601 date (e.g., "2025-10-18")

**Returns**:

```typescript
interface GA4PageMetrics {
  pagePath: string;
  pageViews: number;
  bounceRate: number; // 0.0 to 1.0
  conversions: number;
  revenue: number; // USD
  avgSessionDuration: number; // seconds
}
```

**Example**:

```typescript
import { ga4Client } from '@/lib/google-analytics';

const metrics = await ga4Client.getPageMetrics('/page/100067/donate/1', '2025-10-18', '2025-10-18');

console.log(`Page Views: ${metrics.pageViews}`);
console.log(`Bounce Rate: ${metrics.bounceRate * 100}%`);
console.log(`Conversions: ${metrics.conversions}`);
console.log(`Revenue: $${metrics.revenue}`);
```

**Performance**: Average response time: 400-700ms per page

---

## Metrics Reference

### Primary Metrics

1. **Page Views** (`screenPageViews`)
   - Total page views for the specified path
   - Used for: Traffic analysis, conversion rate calculation

2. **Bounce Rate** (`bounceRate`)
   - Percentage of single-page sessions (0.0 to 1.0)
   - Used for: Engagement quality assessment

3. **Conversions** (`conversions`)
   - Total conversion events
   - Used for: Success metrics, conversion rate

4. **Revenue** (`totalRevenue`)
   - Total revenue in USD
   - Used for: Financial metrics, ROI calculation

5. **Avg Session Duration** (`averageSessionDuration`)
   - Average time spent on page (seconds)
   - Used for: Engagement depth analysis

### Calculated Metrics

```typescript
// Conversion Rate
const conversionRate = (conversions / pageViews) * 100;

// Revenue per View
const revenuePerView = revenue / pageViews;

// Revenue per Conversion
const revenuePerConversion = revenue / conversions;
```

---

## Error Handling

### Graceful Degradation

On error, the method returns empty metrics (zeros):

```typescript
{
  pagePath: "/page/123/donate/1",
  pageViews: 0,
  bounceRate: 0,
  conversions: 0,
  revenue: 0,
  avgSessionDuration: 0
}
```

### Error Scenarios Handled

1. **No Data for Page Path**: Returns zeros (normal)
2. **Network Errors**: Caught and logged
3. **Authentication Failures**: Throws descriptive error
4. **Rate Limiting**: 100ms delay between requests
5. **Timeout**: 15s timeout per request

### Error Logging

All API calls are logged via `ApiLogger`:

```
[23:29:46.798] DEBUG api.request.started → POST /runReport
[23:29:47.395] INFO  api.request.completed → Completed /runReport/cl
  endpoint: /runReport
  statusCode: 200
  duration: 589.139583ms
  status: success
```

---

## Performance Characteristics

### Response Times

| Metric                | Value     |
| --------------------- | --------- |
| Average Response Time | 400-700ms |
| Min Response Time     | 400ms     |
| Max Response Time     | 700ms     |
| Success Rate          | 100%      |

### Rate Limiting

- **Delay Between Requests**: 100ms
- **Timeout**: 15 seconds per request
- **Retry Logic**: Automatic retry with exponential backoff

---

## Troubleshooting

### Issue: No Data Returned

**Possible Causes**:

1. Page path doesn't match GA4 data (case-sensitive)
2. No traffic for the specified date range
3. GA4 tracking not installed on page
4. Conversion events not configured

**Solutions**:

1. Verify page path matches exactly (check GA4 property)
2. Test with pages that have known traffic
3. Confirm GA4 tracking code is installed
4. Check conversion events are configured

### Issue: Authentication Failures

**Possible Causes**:

1. Service account key invalid or expired
2. Service account doesn't have GA4 access
3. Property ID incorrect

**Solutions**:

1. Regenerate service account key
2. Verify service account has "Viewer" role in GA4
3. Confirm property ID format: `properties/123456789`

### Issue: Slow Response Times

**Possible Causes**:

1. Large date ranges
2. High traffic pages
3. Network latency

**Solutions**:

1. Use smaller date ranges (single day preferred)
2. Consider caching results
3. Check network connectivity

### Issue: Rate Limit Errors

**Possible Causes**:

1. Too many concurrent requests
2. Exceeding API quota

**Solutions**:

1. Increase delay between requests (currently 100ms)
2. Process pages in smaller batches
3. Monitor API quota usage

---

## Production Checklist

### Before Deploying

- [ ] Verify GA4 tracking code installed on live pages
- [ ] Test with actual production page URLs
- [ ] Verify page paths match GA4 data exactly (case-sensitive)
- [ ] Check conversion events are configured
- [ ] Confirm service account has "Viewer" role in GA4
- [ ] Access granted to correct GA4 property
- [ ] Permissions applied at property level (not just account)

### Monitoring

Monitor for:

- API errors (should be rare)
- Consistent zeros (indicates tracking issue)
- Slow response times (>2s)
- Rate limit errors

---

## Related Documentation

- [Credential Setup Guide](../guides/credential-setup.md) - GA4 setup instructions
- [Data Flow Architecture](../architecture/data-flow.md) - How GA4 data flows through the system
- [Engaging Networks API Reference](./engaging-networks.md) - EN API documentation

---

## Support Resources

- [GA4 Data API Documentation](https://developers.google.com/analytics/devguides/reporting/data/v1)
- [Service Account Setup](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart-client-libraries#set_up_authentication_and_authorization)
- [Metrics Reference](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)

---

## Implementation Files

- **Client Code**: `src/lib/google-analytics.ts`
- **Job Integration**: `src/lib/jobs.ts`
- **Type Definitions**: `src/types/index.ts`
- **Test Script**: `src/scripts/test-ga4-metrics.ts`
