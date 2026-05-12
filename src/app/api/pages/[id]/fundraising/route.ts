/**
 * API Route: GET /api/pages/[id]/fundraising
 *
 * Fetch fundraising data for a specific page from the EN Public API
 * and store in database.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getENPublicClientAsync, isENPublicConfiguredAsync } from '@/lib/en-public-client';
import { toFundraisingUpdateInput, toFundraisingApiData } from '@/types/fundraising';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/pages/[id]/fundraising' });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    // Check if EN Public API is configured
    if (!(await isENPublicConfiguredAsync())) {
      return NextResponse.json(
        { success: false, error: 'EN Public API token not configured' },
        { status: 503 }
      );
    }

    // Find the page
    const page = await prisma.fundraisingPage.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        campaignId: true,
      },
    });

    if (!page) {
      return NextResponse.json({ success: false, error: 'Page not found' }, { status: 404 });
    }

    // Check if page has a campaign ID
    if (!page.campaignId) {
      return NextResponse.json(
        { success: false, error: 'Page does not have a campaign ID configured' },
        { status: 400 }
      );
    }

    // Get EN Public API client
    const client = await getENPublicClientAsync();
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Failed to initialize EN Public API client' },
        { status: 500 }
      );
    }

    // Fetch NetDonor data
    const fundraisingData = await client.fetchNetDonor(page.campaignId);

    // Empty response means campaign not found or no donations
    if (!fundraisingData) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No fundraising data available for this campaign',
      });
    }

    // Update the database with the fetched data
    const updateInput = toFundraisingUpdateInput(fundraisingData);
    await prisma.fundraisingPage.update({
      where: { id },
      data: updateInput,
    });

    // Return the normalized data
    return NextResponse.json({
      success: true,
      data: toFundraisingApiData(fundraisingData),
    });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error fetching fundraising data');

    // Handle specific error types
    if (error instanceof Error) {
      // Check for EN API authentication errors
      if (error.message.includes('Invalid token') || error.message.includes('authentication')) {
        return NextResponse.json(
          { success: false, error: 'EN API authentication failed' },
          { status: 500 }
        );
      }

      // Check for timeout errors
      if (error.message.includes('timeout') || error.message.includes('abort')) {
        return NextResponse.json(
          { success: false, error: 'EN API request timeout' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { success: false, error: `Failed to fetch fundraising data from EN API: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to fetch fundraising data from EN API' },
      { status: 500 }
    );
  }
}
