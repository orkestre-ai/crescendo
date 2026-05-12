import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEnPublicToken, getEnRegion, updateEnPublicConnectionStatus } from '@/lib/settings';
import { ENPublicClient, resetENPublicClient } from '@/lib/en-public-client';
import { rootLogger } from '@/lib/logging';
import type { ConnectionTestResult, ErrorResponse } from '@/types/settings';

const logger = rootLogger.child({ journey: 'request', route: '/api/settings/test-en-public' });

const testEnPublicSchema = z.object({
  token: z.string().optional(),
  region: z.enum(['us', 'ca']).optional(),
});

export async function POST(request: Request) {
  const startTime = performance.now();

  try {
    let token: string | null = null;
    let region: 'us' | 'ca' = 'ca';

    // Parse optional token/region from request body
    try {
      const body = await request.json();
      const parsed = testEnPublicSchema.safeParse(body);
      if (parsed.success) {
        if (parsed.data.token) token = parsed.data.token;
        if (parsed.data.region) region = parsed.data.region;
      }
    } catch {
      // No body or invalid JSON — use stored values
    }

    // Fall back to stored/env values
    if (!token) {
      token = await getEnPublicToken();
    }
    if (!region) {
      region = await getEnRegion();
    }

    if (!token) {
      const result: ConnectionTestResult = {
        success: false,
        status: 'DISCONNECTED',
        message: 'No Public API token configured. Please enter a token.',
      };
      await updateEnPublicConnectionStatus('DISCONNECTED', result.message);
      return NextResponse.json(result);
    }

    // Update status to TESTING
    await updateEnPublicConnectionStatus('TESTING');

    // Create a temporary client with the provided credentials
    const client = new ENPublicClient({ token, region, timeoutMs: 30000 });

    try {
      await client.testConnection();
      const responseTimeMs = Math.round(performance.now() - startTime);

      const result: ConnectionTestResult = {
        success: true,
        status: 'CONNECTED',
        message: `Successfully connected to EN Public API (${region.toUpperCase()} region).`,
        details: { responseTimeMs },
      };

      // Reset singleton so it picks up new credentials
      resetENPublicClient();
      await updateEnPublicConnectionStatus('CONNECTED');
      return NextResponse.json(result);
    } catch (enError: unknown) {
      const responseTimeMs = Math.round(performance.now() - startTime);
      const errorMessage =
        enError instanceof Error ? enError.message : 'Failed to connect to EN Public API';

      const result: ConnectionTestResult = {
        success: false,
        status: 'DISCONNECTED',
        message: errorMessage,
        details: { responseTimeMs },
      };

      await updateEnPublicConnectionStatus('DISCONNECTED', errorMessage);
      return NextResponse.json(result);
    }
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error : new Error(String(error)) },
      'EN Public API connection test failed'
    );
    const errorResponse: ErrorResponse = {
      error: 'TEST_CONNECTION_ERROR',
      message: 'Failed to test EN Public API connection',
    };
    await updateEnPublicConnectionStatus('DISCONNECTED', 'Internal error during connection test');
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
