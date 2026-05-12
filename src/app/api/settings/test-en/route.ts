import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEnApiKey, updateEnConnectionStatus } from '@/lib/settings';
import { createEngagingNetworksClient } from '@/lib/engaging-networks';
import { rootLogger } from '@/lib/logging';
import type { ConnectionTestResult, ErrorResponse } from '@/types/settings';

const logger = rootLogger.child({ journey: 'request', route: '/api/settings/test-en' });

const testEnSchema = z.object({
  apiKey: z.string().optional(),
});

/**
 * Fetch the server's public IP address for IP whitelist troubleshooting.
 * Returns null if the lookup fails — never blocks the test flow.
 */
async function getServerPublicIp(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    return data.ip || null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const startTime = performance.now();

  try {
    // Parse optional apiKey from request body
    let apiKey: string | null = null;
    try {
      const body = await request.json();
      const parsed = testEnSchema.safeParse(body);
      if (parsed.success && parsed.data.apiKey) {
        apiKey = parsed.data.apiKey;
      }
    } catch {
      // No body or invalid JSON - use stored key
    }

    // Fall back to stored/env API key if not provided
    if (!apiKey) {
      apiKey = await getEnApiKey();
    }

    if (!apiKey) {
      const result: ConnectionTestResult = {
        success: false,
        status: 'DISCONNECTED',
        message: 'No API key configured. Please enter an API key.',
      };
      await updateEnConnectionStatus('DISCONNECTED', result.message);
      return NextResponse.json(result);
    }

    // Update status to TESTING
    await updateEnConnectionStatus('TESTING');

    // Create client with the API key and test connection
    const client = createEngagingNetworksClient(apiKey);

    try {
      // Test by fetching pages - this validates the token
      const pages = await client.getPages({ limit: 1000 });
      const totalPageCount = Array.isArray(pages) ? pages.length : 0;

      const responseTimeMs = Math.round(performance.now() - startTime);

      const result: ConnectionTestResult = {
        success: true,
        status: 'CONNECTED',
        message: `Successfully connected. Found ${totalPageCount} donation pages.`,
        details: {
          pageCount: totalPageCount,
          responseTimeMs,
        },
      };

      await updateEnConnectionStatus('CONNECTED', null, totalPageCount);
      return NextResponse.json(result);
    } catch (enError: any) {
      const responseTimeMs = Math.round(performance.now() - startTime);
      const status = enError.response?.status;

      let errorMessage: string;
      if (status === 401) {
        errorMessage = 'Invalid API key. Please check your token.';
      } else if (status === 403) {
        const ip = await getServerPublicIp();
        errorMessage = ip
          ? `Access denied — your server IP (${ip}) is not whitelisted. Add it in EN admin: Settings → API → IP Whitelist.`
          : 'Access denied — your server IP is not whitelisted in Engaging Networks. Check EN admin: Settings → API → IP Whitelist.';
      } else {
        errorMessage = enError.message || 'Failed to connect to Engaging Networks';
      }

      const result: ConnectionTestResult = {
        success: false,
        status: 'DISCONNECTED',
        message: errorMessage,
        details: {
          responseTimeMs,
        },
      };

      await updateEnConnectionStatus('DISCONNECTED', errorMessage);
      return NextResponse.json(result);
    }
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'EN connection test failed');
    const errorResponse: ErrorResponse = {
      error: 'TEST_CONNECTION_ERROR',
      message: 'Failed to test EN connection',
    };
    await updateEnConnectionStatus('DISCONNECTED', 'Internal error during connection test');
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
