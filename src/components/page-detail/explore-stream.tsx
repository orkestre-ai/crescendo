'use client';

import { useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { AIMarkdown } from './ai-markdown';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import {
  extractToolEntries,
  extractTextFromParts,
  type ToolEntry,
} from '@/lib/ai/extract-tool-entries';

interface ExploreStreamProps {
  pageId: string;
  explorationId: string;
  onComplete: () => void;
  onError: () => void;
  onToolsUpdate?: (tools: ToolEntry[]) => void;
}

/**
 * Renders a single-shot exploration stream using useChat pointed at the query endpoint.
 * On mount, sends a trigger message to start the exploration. The server ignores
 * the message content -- it uses the explorationId from the body to look up the prompt.
 */
export function ExploreStream({
  pageId,
  explorationId,
  onComplete,
  onError,
  onToolsUpdate,
}: ExploreStreamProps) {
  const hasSent = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const onToolsUpdateRef = useRef(onToolsUpdate);
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;
  onToolsUpdateRef.current = onToolsUpdate;

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/pages/${pageId}/query`,
      body: { explorationId },
    }),
    onFinish: () => {
      onCompleteRef.current();
    },
    onError: () => {
      onErrorRef.current();
    },
  });

  // Send a single trigger message on mount
  useEffect(() => {
    if (!hasSent.current) {
      hasSent.current = true;
      sendMessage({ text: 'Run exploration' });
    }
  }, [sendMessage]);

  // Extract the assistant response text and tool entries via shared utility
  const assistantMsg = messages.find((m) => m.role === 'assistant');
  const text = assistantMsg ? extractTextFromParts(assistantMsg) : '';
  const toolEntries: ToolEntry[] = extractToolEntries(messages);

  // Emit tool entries to parent for the shared panel
  useEffect(() => {
    onToolsUpdateRef.current?.(toolEntries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolEntries.length, toolEntries.map((t) => t.status).join(',')]);

  const isLoading = status === 'streaming' || status === 'submitted';

  return (
    <div>
      {/* Rendered text */}
      {text && <AIMarkdown content={text} />}

      {/* Loading indicator */}
      {isLoading && !text && toolEntries.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          Thinking...
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-3 mt-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error.message}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              hasSent.current = false;
              sendMessage({ text: 'Run exploration' });
            }}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
