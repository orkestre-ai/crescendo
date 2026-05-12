'use client';

import { ICON_MAP } from './explore-sidebar';
import { ExploreHistory } from './explore-history';
import { ExploreStream } from './explore-stream';
import { AIMarkdown } from './ai-markdown';
import { AIUsageFooter } from './ai-usage-footer';
import { ToolActivityPanel } from './tool-activity-panel';
import { toolCallsToEntries, type ToolEntry } from '@/lib/ai/extract-tool-entries';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BarChart3, RefreshCw, Sparkles } from 'lucide-react';
import type { UsageData } from '@/lib/ai-usage-types';

interface Exploration {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface ExploreResultRecord {
  id: string;
  response: string;
  toolCalls?: unknown;
  usage?: UsageData;
  createdAt: string;
}

interface ExploreResultWindowProps {
  pageId: string;
  exploration: Exploration | null;
  results: ExploreResultRecord[];
  currentResult: ExploreResultRecord | null;
  isLoadingResults: boolean;
  isStreaming: boolean;
  explorationId: string | null;
  streamingTools: ToolEntry[];
  toolExpandState: Record<string, boolean>;
  onRun: () => void;
  onSelectResult: (resultId: string) => void;
  onStreamComplete: () => void;
  onStreamError: () => void;
  onRefreshHistory: () => void;
  onToolsUpdate: (tools: ToolEntry[]) => void;
  onToolToggle: (id: string) => void;
}

export function ExploreResultWindow({
  pageId,
  exploration,
  results,
  currentResult,
  isLoadingResults,
  isStreaming,
  explorationId,
  streamingTools,
  toolExpandState,
  onRun,
  onSelectResult,
  onStreamComplete,
  onStreamError,
  onRefreshHistory,
  onToolsUpdate,
  onToolToggle,
}: ExploreResultWindowProps) {
  // No exploration selected
  if (!exploration) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          Select an exploration from the sidebar
        </div>
      </div>
    );
  }

  const Icon = ICON_MAP[exploration.icon] || BarChart3;

  // Determine tool entries: streaming tools during stream, cached on historical result
  const toolEntries: ToolEntry[] = isStreaming
    ? streamingTools.map((t) => ({ ...t, expanded: toolExpandState[t.id] ?? false }))
    : currentResult?.toolCalls
      ? toolCallsToEntries(currentResult.toolCalls).map((t) => ({
          ...t,
          expanded: toolExpandState[t.id] ?? false,
        }))
      : [];

  return (
    <div className="flex-1 flex min-w-0">
      {/* Main content column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header strip (D-07) */}
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 min-h-[44px]">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate flex-1">
            {exploration.name}
          </span>
          {results.length > 0 && (
            <ExploreHistory
              results={results.map((r) => ({
                id: r.id,
                createdAt: r.createdAt,
              }))}
              currentResultId={currentResult?.id ?? null}
              isLoading={false}
              onSelect={onSelectResult}
              onRefresh={onRefreshHistory}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onRun}
            disabled={isStreaming}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-1 ${isStreaming ? 'animate-spin' : ''}`}
            />
            Re-run
          </Button>
        </div>

        {/* Content area */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            {/* Loading state */}
            {isLoadingResults && (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}

            {/* Streaming state -- uses useChat via ExploreStream */}
            {!isLoadingResults && isStreaming && explorationId && (
              <ExploreStream
                pageId={pageId}
                explorationId={explorationId}
                onComplete={onStreamComplete}
                onError={onStreamError}
                onToolsUpdate={onToolsUpdate}
              />
            )}

            {/* Empty state (D-12) */}
            {!isLoadingResults && !currentResult && !isStreaming && (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <Icon className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium mb-1">{exploration.name}</h3>
                <p className="text-sm text-muted-foreground max-w-md mb-6">
                  {exploration.description}
                </p>
                <Button onClick={onRun}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Analysis
                </Button>
              </div>
            )}

            {/* Cached result (D-13) */}
            {!isLoadingResults && currentResult && !isStreaming && (
              <>
                <AIMarkdown content={currentResult.response} />
                {currentResult.usage && (
                  <AIUsageFooter usage={currentResult.usage} />
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Tool Activity Panel — shared component */}
      <ToolActivityPanel tools={toolEntries} onToggle={onToolToggle} />
    </div>
  );
}
