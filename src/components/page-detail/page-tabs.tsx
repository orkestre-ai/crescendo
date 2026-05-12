'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MetricsTab, type MetricsTabProps } from './metrics-tab';
import { ContentTab } from './content-tab';
import { AISegmentedControl, type AIMode } from './ai-segmented-control';
import { AIGenerate } from './ai-generate';
import { AIExplore } from './ai-explore';
import { AIChat } from './ai-chat';
import { BarChart3, FileText, Sparkles } from 'lucide-react';
import { HelpButton } from '@/components/help/help-button';
import type { OptimizationRecommendation } from '@/types/api';
import type { ContextProfile } from '@/config/ai-profiles';
import type { HelpContextKey } from '@/lib/help-content';

const VALID_TABS = ['metrics', 'content', 'recommendations'] as const;
type TabValue = (typeof VALID_TABS)[number];

const VALID_MODES = ['generate', 'explore', 'chat'] as const;

export interface PageTabsProps
  extends MetricsTabProps, Omit<import('./content-tab').ContentTabProps, never> {
  recommendations: OptimizationRecommendation[];
  pageId: string;
  contextProfiles: ContextProfile[];
  aiProfileId: string | null;
}

export function PageTabs({
  page,
  snapshots,
  reportingCurrency,
  recentPerformance,
  thirtyDaySummary,
  lifetimeTotals,
  trackingAccuracy,
  contentSnapshot,
  recommendations,
  pageId,
  contextProfiles,
  aiProfileId,
}: PageTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = searchParams.get('tab');
  const activeTab: TabValue = VALID_TABS.includes(tabParam as TabValue)
    ? (tabParam as TabValue)
    : 'metrics';

  const modeParam = searchParams.get('mode');
  const activeMode: AIMode = VALID_MODES.includes(modeParam as AIMode)
    ? (modeParam as AIMode)
    : 'generate';

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'metrics') {
      params.delete('tab');
      // Preserve mode param so returning to AI Assistant restores last mode
    } else {
      params.set('tab', value);
    }
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  };

  // Derive the exact help context from tab + mode — passed explicitly so the
  // drawer never has to re-parse the URL (avoids timing / hydration issues)
  const helpContextKey: HelpContextKey =
    activeTab === 'content'
      ? 'page-detail:content'
      : activeTab === 'recommendations'
        ? activeMode === 'explore'
          ? 'page-detail:recommendations:explore'
          : activeMode === 'chat'
            ? 'page-detail:recommendations:chat'
            : 'page-detail:recommendations:generate'
        : 'page-detail:metrics';

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <div className="flex items-center gap-2">
        <TabsList className="grid flex-1 grid-cols-3">
          <TabsTrigger value="metrics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Metrics
          </TabsTrigger>
          <TabsTrigger value="content" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Content
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Assistant
          </TabsTrigger>
        </TabsList>
        {/* HelpButton is co-located with tab state so it always gets the exact
            current context without URL-parse timing issues */}
        <HelpButton contextKey={helpContextKey} className="shrink-0" />
      </div>

      <TabsContent value="metrics" className="mt-6">
        <MetricsTab
          page={page}
          snapshots={snapshots}
          reportingCurrency={reportingCurrency}
          recentPerformance={recentPerformance}
          thirtyDaySummary={thirtyDaySummary}
          lifetimeTotals={lifetimeTotals}
          trackingAccuracy={trackingAccuracy}
        />
      </TabsContent>

      <TabsContent value="content" className="mt-6">
        <ContentTab page={page} contentSnapshot={contentSnapshot} />
      </TabsContent>

      <TabsContent value="recommendations" className="mt-6 space-y-4">
        <AISegmentedControl activeMode={activeMode} />

        {activeMode === 'generate' && (
          <AIGenerate
            recommendations={recommendations}
            pageId={pageId}
            profiles={contextProfiles}
            currentProfileId={aiProfileId}
          />
        )}

        {activeMode === 'explore' && <AIExplore pageId={pageId} />}

        {activeMode === 'chat' && <AIChat pageId={pageId} />}
      </TabsContent>
    </Tabs>
  );
}
