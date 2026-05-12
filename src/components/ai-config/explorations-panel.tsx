'use client';

import { useState, useEffect, useCallback } from 'react';
import { clog } from '@/lib/client-logger';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Loader2, ChevronDown, RotateCcw, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ExplorationCard } from '@/components/settings/exploration-card';
import { DEFAULT_EXPLORATION_SYSTEM_PROMPT } from '@/config/ai-defaults';
import { EXPLORATION_TEMPLATE_VARIABLES } from '@/config/exploration-constants';
import type { SettingsResponse } from '@/types/settings';

interface Exploration {
  id: string;
  name: string;
  description: string;
  prompt: string;
  icon: string;
  enabled: boolean;
  sortOrder: number;
  isDefault: boolean;
  enabledTools: string[];
  createdAt: string;
  updatedAt: string;
}

interface ExplorationsPanelProps {
  settings: SettingsResponse;
  onSettingsUpdate: () => void;
}

export function ExplorationsPanel({ settings, onSettingsUpdate }: ExplorationsPanelProps) {
  const router = useRouter();
  const [explorations, setExplorations] = useState<Exploration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Exploration system prompt state
  const [explorationSystemPrompt, setExplorationSystemPrompt] = useState<string | null>(
    settings.ai.explorationSystemPrompt
  );
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [promptSaveResult, setPromptSaveResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Danger zone state
  const [isClearing, setIsClearing] = useState(false);
  const [clearResult, setClearResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const displayExplorationSystemPrompt =
    explorationSystemPrompt ?? DEFAULT_EXPLORATION_SYSTEM_PROMPT;

  function handleExplorationSystemPromptChange(value: string) {
    setExplorationSystemPrompt(
      value === DEFAULT_EXPLORATION_SYSTEM_PROMPT ? null : value
    );
  }

  function handleResetExplorationSystemPrompt() {
    setExplorationSystemPrompt(null);
  }

  async function handleSaveExplorationPrompt() {
    setIsSavingPrompt(true);
    setPromptSaveResult(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiExplorationSystemPrompt: explorationSystemPrompt }),
      });
      if (!response.ok) throw new Error('Failed to save');
      setPromptSaveResult({ success: true, message: 'Exploration system prompt saved.' });
      setTimeout(() => setPromptSaveResult(null), 3000);
      onSettingsUpdate();
    } catch {
      setPromptSaveResult({ success: false, message: 'Failed to save. Please try again.' });
    } finally {
      setIsSavingPrompt(false);
    }
  }

  async function handleClearExplorationHistory() {
    if (!window.confirm('This will permanently delete ALL exploration results across all pages. This action cannot be undone. Continue?')) {
      return;
    }

    setIsClearing(true);
    setClearResult(null);
    try {
      const response = await fetch('/api/explorations/history', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to clear');
      setClearResult({ success: true, message: `Cleared ${data.deleted} exploration result${data.deleted === 1 ? '' : 's'}.` });
    } catch (err) {
      clog.error('explorations-panel', 'clear-history-failed', { error: err instanceof Error ? err.message : String(err) });
      setClearResult({ success: false, message: 'Failed to clear exploration history.' });
    } finally {
      setIsClearing(false);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchExplorations = useCallback(async () => {
    try {
      const res = await fetch('/api/explorations');
      const json = await res.json();
      if (json.success) {
        setExplorations(json.data);
      }
    } catch (error) {
      clog.error('explorations-panel', 'fetch-explorations-failed', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExplorations();
  }, [fetchExplorations]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = explorations.findIndex((e) => e.id === active.id);
    const newIndex = explorations.findIndex((e) => e.id === over.id);
    const previous = [...explorations];
    const reordered = arrayMove(explorations, oldIndex, newIndex);

    setExplorations(reordered);

    try {
      const res = await fetch('/api/explorations/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: reordered.map((e) => e.id) }),
      });
      if (!res.ok) throw new Error('Reorder failed');
    } catch {
      setExplorations(previous);
    }
  }

  async function handleToggleEnabled(id: string, enabled: boolean) {
    const previous = [...explorations];
    setExplorations((prev) =>
      prev.map((e) => (e.id === id ? { ...e, enabled } : e))
    );

    try {
      const res = await fetch(`/api/explorations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error('Toggle failed');
    } catch {
      setExplorations(previous);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this exploration? This action cannot be undone.')) return;

    const previous = [...explorations];
    setExplorations((prev) => prev.filter((e) => e.id !== id));

    try {
      const res = await fetch(`/api/explorations/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete failed');
    } catch {
      setExplorations(previous);
    }
  }

  return (
    <div className="space-y-6">
      {/* Exploration system prompt editor */}
      <Card>
        <CardHeader>
          <CardTitle>Exploration System Instructions</CardTitle>
          <CardDescription>
            Global system prompt sent to the AI for all exploration queries
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Collapsible open={systemPromptOpen} onOpenChange={setSystemPromptOpen}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label>System Prompt</Label>
                  <p className="text-xs text-muted-foreground">
                    Customize the instructions used when running exploration queries
                  </p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${systemPromptOpen ? 'rotate-180' : ''}`}
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="space-y-2">
                <Textarea
                  value={displayExplorationSystemPrompt}
                  onChange={(e) => handleExplorationSystemPromptChange(e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                />
                <div className="flex items-center justify-between">
                  {explorationSystemPrompt !== null ? (
                    <span className="text-xs text-warning">Custom prompt in use</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Using default prompt</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetExplorationSystemPrompt}
                    disabled={explorationSystemPrompt === null}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset to Default
                  </Button>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs font-medium mb-1.5">Available template variables:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {EXPLORATION_TEMPLATE_VARIABLES.map((v) => (
                      <code key={v} className="text-xs bg-background px-1.5 py-0.5 rounded border">
                        {v}
                      </code>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {promptSaveResult && (
            <div
              className={`p-3 rounded-lg text-sm ${
                promptSaveResult.success
                  ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {promptSaveResult.message}
            </div>
          )}

          <Button
            onClick={handleSaveExplorationPrompt}
            disabled={
              isSavingPrompt ||
              explorationSystemPrompt === settings.ai.explorationSystemPrompt
            }
            className="w-full"
          >
            {isSavingPrompt ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Exploration Prompt'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Exploration list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">Explorations</h3>
            <p className="text-sm text-muted-foreground">
              Manage AI explorations that appear on the page detail Explore tab
            </p>
          </div>
          <Button onClick={() => router.push('/ai-config/explorations/new')}>
            <Plus className="h-4 w-4 mr-2" />
            Add exploration
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : explorations.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No explorations found. Click &quot;Add exploration&quot; to create
            one.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={explorations.map((e) => e.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {explorations.map((exploration) => (
                  <ExplorationCard
                    key={exploration.id}
                    exploration={exploration}
                    onToggleEnabled={handleToggleEnabled}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
          </div>
          <CardDescription>
            Irreversible actions that affect all exploration data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Clear All Exploration Results</p>
              <p className="text-xs text-muted-foreground">
                Delete all AI exploration results across all pages
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearExplorationHistory}
              disabled={isClearing}
            >
              {isClearing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Clear All Results
            </Button>
          </div>
          {clearResult && (
            <div
              className={`p-3 rounded-lg text-sm ${
                clearResult.success
                  ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {clearResult.message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
