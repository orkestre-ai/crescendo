'use client';

import { useState } from 'react';
import {
  Wrench,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolEntry } from '@/lib/ai/extract-tool-entries';

export type { ToolEntry } from '@/lib/ai/extract-tool-entries';

// ── ToolLogEntry ─────────────────────────────────────────────────

function ToolLogEntry({ tool, onToggle }: { tool: ToolEntry; onToggle: () => void }) {
  const displayName = tool.name.replace(/_/g, ' ');
  const hasDetails = tool.params && Object.keys(tool.params).length > 0;

  return (
    <div
      className={cn(
        'rounded-lg border text-xs overflow-hidden transition-colors',
        tool.status === 'error'
          ? 'border-destructive/30 bg-destructive/5'
          : tool.status === 'running'
            ? 'border-primary/20 bg-primary/5'
            : 'border-border bg-background'
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="shrink-0">
          {tool.status === 'running' ? (
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          ) : tool.status === 'error' ? (
            <AlertTriangle className="h-3 w-3 text-destructive" />
          ) : (
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          )}
        </span>
        <span className="font-mono font-medium flex-1 truncate text-foreground leading-none">
          {displayName}
        </span>
        {hasDetails && (
          <button
            onClick={onToggle}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={cn('h-3 w-3 transition-transform', tool.expanded && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {/* Summary line */}
      {tool.result?.summary && !tool.expanded && (
        <p className="px-3 pb-2 text-muted-foreground leading-snug truncate">
          {tool.result.summary}
        </p>
      )}

      {/* Expanded details */}
      {tool.expanded && (
        <div className="border-t px-3 py-2 space-y-2 bg-muted/30">
          {tool.params && Object.keys(tool.params).length > 0 && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">Parameters</p>
              <pre className="font-mono text-[11px] bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                {JSON.stringify(tool.params, null, 2)}
              </pre>
            </div>
          )}
          {tool.result && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">
                {tool.result.error ? 'Error' : 'Result'}
              </p>
              {tool.result.summary && (
                <p className="text-foreground leading-snug">{tool.result.summary}</p>
              )}
              {tool.result.data != null && (
                <pre className="font-mono text-[11px] bg-background rounded p-2 mt-1 overflow-x-auto max-h-36 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed">
                  {JSON.stringify(tool.result.data, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ToolActivityPanel ────────────────────────────────────────────

interface ToolActivityPanelProps {
  tools: ToolEntry[];
  onToggle: (id: string) => void;
}

export function ToolActivityPanel({ tools, onToggle }: ToolActivityPanelProps) {
  const [visible, setVisible] = useState(true);

  if (tools.length === 0) return null;

  return (
    <>
      {/* Toggle button — always visible when tools exist */}
      <div className="shrink-0 border-l flex flex-col items-center pt-3 px-1 bg-muted/10">
        <button
          onClick={() => setVisible((v) => !v)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={visible ? 'Hide tool activity' : 'Show tool activity'}
        >
          {visible ? (
            <PanelRightClose className="h-3.5 w-3.5" />
          ) : (
            <PanelRightOpen className="h-3.5 w-3.5" />
          )}
        </button>
        {!visible && (
          <span className="mt-1 text-[10px] tabular-nums font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
            {tools.length}
          </span>
        )}
      </div>

      {/* Panel content */}
      {visible && (
        <div className="w-64 shrink-0 border-l flex flex-col bg-muted/20">
          {/* Panel header */}
          <div className="px-4 py-3 border-b flex items-center gap-2 bg-background">
            <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex-1">
              Tool Activity
            </span>
            <span className="text-xs tabular-nums font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {tools.length}
            </span>
          </div>

          {/* Tool entries */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {tools.map((tool) => (
              <ToolLogEntry key={tool.id} tool={tool} onToggle={() => onToggle(tool.id)} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
