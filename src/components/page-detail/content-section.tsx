'use client';

import { useState } from 'react';
import { FundraisingPage } from '@/types/api';
import type { Prisma } from '@prisma/client';

type JsonValue = Prisma.JsonValue;
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Image from 'next/image';
import { format } from 'date-fns';

export interface ContentSnapshotData {
  id: string;
  contentHash: string | null;
  metaTitle: string | null;
  appealText: string | null;
  narrativeText: string | null;
  screenshotUrl: string | null;
  mobileScreenshotUrl: string | null;
  diagnostics: JsonValue | null;
  validFrom: Date | string;
  validTo: Date | string | null;
  enModifiedAt: Date | string | null;
  capturedAt: Date | string;
}

interface ContentSectionProps {
  page: FundraisingPage;
  contentSnapshot?: ContentSnapshotData | null;
}

function BrowserFrame({
  page,
  contentSnapshot,
}: {
  page: FundraisingPage;
  contentSnapshot: ContentSnapshotData;
}) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const screenshotUrl =
    device === 'mobile' ? contentSnapshot.mobileScreenshotUrl : contentSnapshot.screenshotUrl;

  const isDesktop = device === 'desktop';

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      {/* Browser chrome top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-destructive" />
          <div className="w-3 h-3 rounded-full bg-warning" />
          <div className="w-3 h-3 rounded-full bg-success" />
        </div>
        {/* Device toggle */}
        {contentSnapshot.mobileScreenshotUrl && (
          <Tabs
            value={device}
            onValueChange={(v) => setDevice(v as 'desktop' | 'mobile')}
            className="ml-auto"
          >
            <TabsList className="h-7">
              <TabsTrigger value="desktop" className="text-xs px-2 py-0.5">
                Desktop
              </TabsTrigger>
              <TabsTrigger value="mobile" className="text-xs px-2 py-0.5">
                Mobile
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Screenshot viewport */}
      <div className="bg-muted/30 p-2">
        {screenshotUrl ? (
          isDesktop ? (
            /* Desktop: fixed 1024px-concept viewport, scrollable, responsive container */
            <div
              className="w-full max-w-[1024px] mx-auto overflow-y-auto overflow-x-hidden rounded border scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent"
              style={{ maxHeight: '600px' }}
            >
              <Image
                src={screenshotUrl}
                alt={`Desktop screenshot of ${page.name}`}
                width={1280}
                height={3000}
                className="w-full h-auto"
                unoptimized
              />
            </div>
          ) : (
            /* Mobile: phone-like frame centered at ~390px, scrollable */
            <div className="flex justify-center">
              <div
                className="w-[390px] max-w-full overflow-y-auto overflow-x-hidden rounded-2xl border-2 border-muted-foreground/15 shadow-lg"
                style={{ maxHeight: '700px' }}
              >
                <Image
                  src={screenshotUrl}
                  alt={`Mobile screenshot of ${page.name}`}
                  width={390}
                  height={2000}
                  className="w-full h-auto"
                  unoptimized
                />
              </div>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground italic">
            No {device} screenshot available
          </div>
        )}
      </div>

      {/* Captured date */}
      <div className="px-3 py-1.5 border-t text-xs text-muted-foreground">
        Captured {format(new Date(contentSnapshot.capturedAt), 'MMM d, yyyy')}
      </div>
    </div>
  );
}

export function ContentSection({ page, contentSnapshot }: ContentSectionProps) {
  const hasScreenshots = contentSnapshot?.screenshotUrl || contentSnapshot?.mobileScreenshotUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Page Content</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={hasScreenshots ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'space-y-6'}>
          {/* Left column: Content */}
          <div className="space-y-6">
            {/* Meta Title */}
            {(page.metaTitle || contentSnapshot?.metaTitle) && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Page Title</h3>
                <p className="text-sm">{page.metaTitle || contentSnapshot?.metaTitle}</p>
              </div>
            )}

            {/* Headline */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Headline</h3>
              {page.headline ? (
                <p className="text-lg font-semibold">{page.headline}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No headline captured</p>
              )}
            </div>

            {/* Appeal Text */}
            {(page.appealText || contentSnapshot?.appealText) && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Appeal Text</h3>
                <div className="text-sm whitespace-pre-line bg-muted/50 rounded-lg p-4">
                  {page.appealText || contentSnapshot?.appealText}
                </div>
              </div>
            )}

            {/* Meta Description */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Meta Description</h3>
              {page.metaDescription ? (
                <p className="text-sm">{page.metaDescription}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No meta description captured</p>
              )}
            </div>

            {/* CTA Buttons */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Call-to-Action Buttons
              </h3>
              {page.ctaButtons && page.ctaButtons.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {page.ctaButtons.map((cta, index) => (
                    <Badge key={index} variant="secondary">
                      {cta}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No CTA buttons captured</p>
              )}
            </div>

            {/* Donation Amounts (One-time) */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Donation Amounts{page.hasMonthlyGiving ? ' (One-time)' : ''}
              </h3>
              {page.donationAmounts && page.donationAmounts.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {page.donationAmounts.map((amount, index) => (
                    <Badge key={index} variant="outline">
                      ${amount.toFixed(2)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No donation amounts captured</p>
              )}
            </div>

            {/* Monthly Amounts */}
            {page.hasMonthlyGiving &&
              page.monthlyDonationAmounts &&
              page.monthlyDonationAmounts.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Monthly Amounts
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {page.monthlyDonationAmounts.map((amount, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="border-blue-300 text-blue-700"
                      >
                        ${amount.toFixed(2)}/mo
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

            {/* Page Features */}
            {(page.hasFeeCover || page.hasMonthlyGiving || page.paymentGateway) && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Page Features</h3>
                <div className="flex flex-wrap gap-2">
                  {page.hasFeeCover && (
                    <Badge variant="secondary">
                      Fee Cover
                      {page.feeCoverConfig
                        ? ` (${(page.feeCoverConfig as { percent?: string })?.percent ?? ''}%)`
                        : ''}
                    </Badge>
                  )}
                  {page.hasMonthlyGiving && <Badge variant="secondary">Monthly Giving</Badge>}
                  {(page.paymentGateway as { gatewayTypes?: string[] })?.gatewayTypes?.includes(
                    'stripe'
                  ) && <Badge variant="secondary">Stripe</Badge>}
                  {((page.paymentGateway as { hasVgsCollectFrame?: boolean })?.hasVgsCollectFrame ||
                    (page.paymentGateway as { detectionState?: string })?.detectionState ===
                      'vgs-only') && <Badge variant="secondary">VGS</Badge>}
                  {page.currency && <Badge variant="secondary">{page.currency}</Badge>}
                  {page.minDonationAmount != null && page.minDonationAmount > 0 && (
                    <Badge variant="secondary">Min ${page.minDonationAmount}</Badge>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right column: Screenshots in browser frame */}
          {hasScreenshots && contentSnapshot && (
            <div className="order-first lg:order-last">
              <BrowserFrame page={page} contentSnapshot={contentSnapshot} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
