'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { ContentSection } from './content-section';
import { GatewaySection } from './gateway-section';
import { DiagnosticsSection } from './diagnostics-section';
import { SnapshotHistory, formatSnapshotDateRange } from './snapshot-history';
import type { SnapshotListItem } from './snapshot-history';
import type { ContentSnapshotData } from './content-section';
import type { FundraisingPage } from '@/types/api';
import type { PaymentGatewayInfo } from '@/types/gateway';
import type { PageDiagnostics } from '@/types';

export interface ContentTabProps {
  page: FundraisingPage;
  contentSnapshot?: ContentSnapshotData | null;
}

export function ContentTab({ page, contentSnapshot }: ContentTabProps) {
  const [isScraping, setIsScraping] = useState(false);

  // Snapshot history state
  const [selectedSnapshot, setSelectedSnapshot] = useState<ContentSnapshotData | null>(
    contentSnapshot ?? null
  );
  const [snapshotList, setSnapshotList] = useState<SnapshotListItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const diagnostics = (selectedSnapshot?.diagnostics as PageDiagnostics | null) ?? null;

  // Fetch snapshot history list (called when dropdown opens)
  const fetchSnapshotHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/pages/${page.id}/content-snapshots`);
      if (res.ok) {
        const data = await res.json();
        setSnapshotList(data);
      }
    } catch {
      // Silent fail — dropdown shows loading state
    } finally {
      setIsLoadingHistory(false);
    }
  }, [page.id]);

  // Select a specific snapshot from history
  const handleSelectSnapshot = useCallback(
    async (snapshotId: string) => {
      // The list endpoint returns full snapshot data — use it directly
      const found = snapshotList.find((s) => s.id === snapshotId);
      if (found) {
        setSelectedSnapshot(found as unknown as ContentSnapshotData);
      }
    },
    [snapshotList]
  );

  const handleScrapeNow = async () => {
    setIsScraping(true);
    try {
      await fetch(`/api/pages/${page.id}/scrape`, { method: 'POST' });
      setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', 'content');
        window.location.href = url.toString();
      }, 3000);
    } catch {
      setIsScraping(false);
    }
  };

  // Date range subtitle (per D-16)
  const dateRangeText = selectedSnapshot?.validFrom
    ? formatSnapshotDateRange(selectedSnapshot.validFrom, selectedSnapshot.validTo ?? null)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SnapshotHistory
            snapshots={snapshotList}
            currentId={selectedSnapshot?.id ?? null}
            isLoading={isLoadingHistory}
            onSelect={handleSelectSnapshot}
            onRefresh={fetchSnapshotHistory}
          />
          {dateRangeText && (
            <span className="text-xs text-muted-foreground">{dateRangeText}</span>
          )}
        </div>
        <Button onClick={handleScrapeNow} disabled={isScraping} variant="outline">
          {isScraping ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {isScraping ? 'Scraping...' : 'Scrape Now'}
        </Button>
      </div>
      <ContentSection page={page} contentSnapshot={selectedSnapshot} />
      {page.paymentGateway && (
        <GatewaySection gateway={page.paymentGateway as unknown as PaymentGatewayInfo} />
      )}
      <DiagnosticsSection diagnostics={diagnostics} />
    </div>
  );
}
