'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { clog } from '@/lib/client-logger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { REPORT_TOOL_CHOICES } from '@/lib/reports/definitions/schema';

interface Definition {
  id: string;
  key: string;
  name: string;
  description: string;
  enabledTools: string[];
  isDefault: boolean;
  enabled: boolean;
  editedAt: string | null;
}

const toolLabel = (key: string) =>
  REPORT_TOOL_CHOICES.find((tool) => tool.key === key)?.label ?? key;

/** The report definitions: turn one on or off, edit it, delete it, add one. */
export function ReportsPanel() {
  const router = useRouter();
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDefinitions = useCallback(async () => {
    try {
      const res = await fetch('/api/reports/definitions');
      const json = await res.json();
      if (res.ok) setDefinitions(json.definitions);
    } catch (error) {
      clog.error('reports-panel', 'fetch-definitions-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDefinitions();
  }, [fetchDefinitions]);

  async function handleToggleEnabled(id: string, enabled: boolean) {
    const previous = definitions;
    setDefinitions((prev) => prev.map((d) => (d.id === id ? { ...d, enabled } : d)));
    try {
      const res = await fetch(`/api/reports/definitions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error('Toggle failed');
    } catch {
      setDefinitions(previous);
    }
  }

  async function handleDelete(definition: Definition) {
    const message = definition.isDefault
      ? `Delete "${definition.name}"? It comes with Crescendo, so it returns in its original form, without your changes. Reports already made are kept.`
      : `Delete "${definition.name}"? Reports already made are kept. This cannot be undone.`;
    if (!window.confirm(message)) return;
    try {
      const res = await fetch(`/api/reports/definitions/${definition.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch (error) {
      clog.error('reports-panel', 'delete-definition-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    // A built-in comes back on the next read.
    await fetchDefinitions();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Reports</h3>
          <p className="text-sm text-muted-foreground">
            The reports a person can start from the Reports page. Each has its own prompt, input
            form and data tools.
          </p>
        </div>
        <Button onClick={() => router.push('/ai-config/reports/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Add report
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : definitions.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No reports found. Click &quot;Add report&quot; to create one.
        </div>
      ) : (
        <div className="space-y-2">
          {definitions.map((definition) => (
            <Card key={definition.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{definition.name}</p>
                    {definition.isDefault && (
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                        {definition.editedAt ? 'Built-in, edited' : 'Built-in'}
                      </Badge>
                    )}
                  </div>
                  {definition.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {definition.description}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {definition.enabledTools.map((key) => (
                      <Badge key={key} variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {toolLabel(key)}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Switch
                  checked={definition.enabled}
                  onCheckedChange={(checked) => handleToggleEnabled(definition.id, checked)}
                  aria-label={`${definition.enabled ? 'Disable' : 'Enable'} ${definition.name}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push(`/reports/new?definition=${definition.key}`)}
                  aria-label={`Start ${definition.name}`}
                >
                  <Play className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push(`/ai-config/reports/${definition.id}`)}
                  aria-label={`Edit ${definition.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(definition)}
                  aria-label={`Delete ${definition.name}`}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
