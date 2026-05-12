import { NextResponse } from 'next/server';
import { getGa4Credentials, updateGa4ConnectionStatus } from '@/lib/settings';
import { rootLogger } from '@/lib/logging';
import type { ConnectionTestResult, ErrorResponse } from '@/types/settings';

const logger = rootLogger.child({ journey: 'request', route: '/api/settings/test-ga' });

function classifyGa4Error(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('permission') || lower.includes('403') || lower.includes('forbidden')) {
    return 'The service account doesn\'t have access to this GA4 property. Check that you added it as a Viewer in GA4 Admin > Property Access Management. Permissions can take 2-5 minutes to propagate.';
  }
  if (lower.includes('not found') || lower.includes('404') || lower.includes('property')) {
    return 'GA4 property not found. Double-check your Property ID in Analytics > Admin > Property Settings.';
  }
  if (lower.includes('api') && lower.includes('enabled') || lower.includes('api_disabled') || lower.includes('accessnotconfigured')) {
    return 'The Google Analytics Data API is not enabled on the service account\'s project. Enable it in Google Cloud Console > APIs & Services > Library.';
  }
  if (lower.includes('invalid') || lower.includes('credential') || lower.includes('auth') || lower.includes('401')) {
    return 'The service account key appears to be invalid. Try re-downloading it from Google Cloud Console > IAM > Service Accounts > Keys.';
  }
  if (lower.includes('timeout') || lower.includes('econnrefused') || lower.includes('network')) {
    return 'Could not reach Google Analytics. Check your internet connection and try again.';
  }

  return message;
}

export async function POST() {
  const startTime = performance.now();

  try {
    const ga4 = await getGa4Credentials();

    if (!ga4) {
      const result: ConnectionTestResult = {
        success: false,
        status: 'DISCONNECTED',
        message: 'GA4 is not configured. Enter your credentials in the form above or set GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_KEY environment variables.',
      };
      await updateGa4ConnectionStatus('DISCONNECTED', result.message);
      return NextResponse.json(result);
    }

    await updateGa4ConnectionStatus('TESTING');

    try {
      const { BetaAnalyticsDataClient } = await import('@google-analytics/data');

      const client = new BetaAnalyticsDataClient({
        credentials: ga4.credentials,
      });

      const today = new Date().toISOString().split('T')[0];
      await client.runReport({
        property: ga4.propertyId,
        dateRanges: [{ startDate: today, endDate: today }],
        metrics: [{ name: 'screenPageViews' }],
        limit: 1,
      });

      const responseTimeMs = Math.round(performance.now() - startTime);

      const result: ConnectionTestResult = {
        success: true,
        status: 'CONNECTED',
        message: 'Successfully connected to Google Analytics 4.',
        details: { responseTimeMs },
      };

      await updateGa4ConnectionStatus('CONNECTED');
      return NextResponse.json(result);
    } catch (gaError: unknown) {
      const responseTimeMs = Math.round(performance.now() - startTime);
      const userMessage = classifyGa4Error(gaError);

      const result: ConnectionTestResult = {
        success: false,
        status: 'DISCONNECTED',
        message: userMessage,
        details: { responseTimeMs },
      };

      await updateGa4ConnectionStatus('DISCONNECTED', userMessage);
      return NextResponse.json(result);
    }
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'GA4 connection test failed');
    const errorResponse: ErrorResponse = {
      error: 'TEST_CONNECTION_ERROR',
      message: 'Failed to test GA4 connection',
    };
    await updateGa4ConnectionStatus('DISCONNECTED', 'Internal error during connection test');
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
