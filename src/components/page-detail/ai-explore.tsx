'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { clog } from '@/lib/client-logger';
import { ExploreSidebar } from './explore-sidebar';
import { ExploreResultWindow } from './explore-result-window';
import { Skeleton } from '@/components/ui/skeleton';
import type { ToolEntry } from '@/lib/ai/extract-tool-entries';
import type { UsageData } from '@/lib/ai-usage-types';

// ── Types ────────────────────────────────────────────────────────

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

interface AIExploreProps {
  pageId: string;
}

// ── Main component ───────────────────────────────────────────────

export function AIExplore({ pageId }: AIExploreProps) {
  const [explorations, setExplorations] = useState<Exploration[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cachedMap, setCachedMap] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<ExploreResultRecord[]>([]);
  const [currentResult, setCurrentResult] = useState<ExploreResultRecord | null>(null);
  const [isLoadingExplorations, setIsLoadingExplorations] = useState(true);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingTools, setStreamingTools] = useState<ToolEntry[]>([]);
  const [toolExpandState, setToolExpandState] = useState<Record<string, boolean>>({});
  const abortRef = useRef<AbortController | null>(null);

  // ── Effect 1: Fetch explorations + summary on mount ──────────

  useEffect(() => {
    async function loadExplorations() {
      try {
        const [explRes, summRes] = await Promise.all([
          fetch('/api/explorations?enabled=true'),
          fetch(`/api/pages/${pageId}/explorations/summary`),
        ]);

        const explJson = await explRes.json();
        const summJson = await summRes.json();

        if (explJson.success && explJson.data.length > 0) {
          setExplorations(explJson.data);
          // Auto-select first exploration (D-05)
          setSelectedId(explJson.data[0].id);
        }

        if (summJson.success) {
          const map: Record<string, boolean> = {};
          for (const s of summJson.data) {
            if (s.explorationId) {
              map[s.explorationId] = true;
            }
          }
          setCachedMap(map);
        }
      } catch (error) {
        clog.error('ai-explore', 'load-explorations-failed', { error: error instanceof Error ? error.message : String(error) });
      } finally {
        setIsLoadingExplorations(false);
      }
    }

    loadExplorations();
  }, [pageId]);

  // ── Effect 2: Fetch results when selectedId changes ──────────

  useEffect(() => {
    if (!selectedId) {
      setResults([]);
      setCurrentResult(null);
      return;
    }

    // AbortController pattern for race condition prevention
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoadingResults(true);

    async function loadResults() {
      try {
        const res = await fetch(
          `/api/pages/${pageId}/explorations/${selectedId}/results`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error('Failed to load results');
        const { data } = await res.json();
        setResults(data ?? []);
        setCurrentResult(data?.[0] ?? null);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setResults([]);
          setCurrentResult(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingResults(false);
        }
      }
    }

    loadResults();

    return () => controller.abort();
  }, [pageId, selectedId]);

  // ── Handlers ─────────────────────────────────────────────────

  const handleRun = useCallback(() => {
    if (!selectedId) return;
    setIsStreaming(true);
    setCurrentResult(null);
    setStreamingTools([]);
    setToolExpandState({});
  }, [selectedId]);

  const handleToolsUpdate = useCallback((tools: ToolEntry[]) => {
    setStreamingTools(tools);
  }, []);

  const handleToolToggle = useCallback((id: string) => {
    setToolExpandState((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleStreamComplete = useCallback(async () => {
    setIsStreaming(false);

    // Re-fetch results to get the newly persisted record
    if (selectedId) {
      try {
        const res = await fetch(
          `/api/pages/${pageId}/explorations/${selectedId}/results`
        );
        if (res.ok) {
          const { data } = await res.json();
          setResults(data ?? []);
          setCurrentResult(data?.[0] ?? null);
        }
      } catch {
        // Silently fail -- user can refresh
      }

      // Update cached map to show dot indicator for this exploration
      setCachedMap((prev) => ({ ...prev, [selectedId]: true }));
    }
  }, [pageId, selectedId]);

  const handleStreamError = useCallback(() => {
    setIsStreaming(false);
  }, []);

  const handleSelectResult = useCallback(
    (resultId: string) => {
      const result = results.find((r) => r.id === resultId);
      if (result) setCurrentResult(result);
    },
    [results]
  );

  const handleRefreshHistory = useCallback(async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(
        `/api/pages/${pageId}/explorations/${selectedId}/results`
      );
      if (res.ok) {
        const { data } = await res.json();
        setResults(data ?? []);
      }
    } catch {
      // Silently fail
    }
  }, [pageId, selectedId]);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === selectedId) return;
      setSelectedId(id);
      setIsStreaming(false);
    },
    [selectedId]
  );

  // ── Render ───────────────────────────────────────────────────

  if (isLoadingExplorations) {
    return (
      <div
        className="flex rounded-xl border bg-card overflow-hidden"
        style={{ height: 620 }}
      >
        {/* Sidebar skeleton */}
        <div className="w-60 shrink-0 border-r bg-muted/30 p-3 space-y-2">
          <Skeleton className="h-4 w-24 mb-3" />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))}
        </div>
        {/* Window skeleton */}
        <div className="flex-1 p-6 space-y-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex rounded-xl border bg-card overflow-hidden"
      style={{ height: 620 }}
    >
      <ExploreSidebar
        explorations={explorations}
        selectedId={selectedId}
        cachedMap={cachedMap}
        isLoading={false}
        onSelect={handleSelect}
      />
      <ExploreResultWindow
        pageId={pageId}
        exploration={explorations.find((e) => e.id === selectedId) ?? null}
        results={results}
        currentResult={currentResult}
        isLoadingResults={isLoadingResults}
        isStreaming={isStreaming}
        explorationId={selectedId}
        streamingTools={streamingTools}
        toolExpandState={toolExpandState}
        onRun={handleRun}
        onSelectResult={handleSelectResult}
        onStreamComplete={handleStreamComplete}
        onStreamError={handleStreamError}
        onRefreshHistory={handleRefreshHistory}
        onToolsUpdate={handleToolsUpdate}
        onToolToggle={handleToolToggle}
      />
    </div>
  );
}
