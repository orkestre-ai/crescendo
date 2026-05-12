'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AIMarkdown } from './ai-markdown';
import { ConversationHeader } from './conversation-header';
import {
  Send,
  Loader2,
  AlertTriangle,
  MessageSquare,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolActivityPanel } from './tool-activity-panel';
import {
  extractToolEntries,
  extractTextFromParts,
  type ToolEntry,
} from '@/lib/ai/extract-tool-entries';

interface AIChatProps {
  pageId: string;
}

interface ConversationState {
  conversationId: string | null;
  title: string | null;
  isLoading: boolean;
}

interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: string;
  _count: { messages: number };
}

function generateConversationTitle(firstMessage: string, maxLength = 60): string {
  if (firstMessage.length <= maxLength) return firstMessage;
  const truncated = firstMessage.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 20 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
}

// ── Copy button ──────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — silently ignore
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors',
        copied
          ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
      aria-label="Copy response"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// ── Typing indicator ─────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: '900ms' }}
        />
      ))}
    </div>
  );
}

// ── Helper: convert DB messages to UIMessage with tool parts ─────

interface DbMessage {
  id: string;
  role: string;
  content: string;
  toolCalls?: { tool: string; params?: Record<string, unknown>; result?: unknown }[] | null;
}

function dbMessagesToUI(messages: DbMessage[]): UIMessage[] {
  return messages.map((m) => {
    const parts: UIMessage['parts'] = [{ type: 'text' as const, text: m.content }];

    // Reconstruct tool parts from persisted toolCalls JSON so extractToolEntries picks them up
    if (m.role === 'assistant' && Array.isArray(m.toolCalls)) {
      for (let i = 0; i < m.toolCalls.length; i++) {
        const tc = m.toolCalls[i];
        parts.push({
          type: `tool-${tc.tool}`,
          toolCallId: `${m.id}-tool-${i}`,
          state: 'output-available',
          input: tc.params ?? {},
          output: tc.result ?? undefined,
        } as unknown as UIMessage['parts'][number]);
      }
    }

    return {
      id: m.id,
      role: m.role as 'user' | 'assistant',
      parts,
    };
  });
}

// ── Main component ───────────────────────────────────────────────

export function AIChat({ pageId }: AIChatProps) {
  const [input, setInput] = useState('');
  const [conversation, setConversation] = useState<ConversationState>({
    conversationId: null,
    title: null,
    isLoading: true,
  });
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [toolExpandState, setToolExpandState] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortConvRef = useRef<AbortController | null>(null);

  // Use refs for values passed via body so useChat doesn't re-initialize on every render
  const conversationRef = useRef<string | null>(null);
  const titleRef = useRef<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    conversationRef.current = conversation.conversationId;
  }, [conversation.conversationId]);

  useEffect(() => {
    titleRef.current = conversationTitle;
  }, [conversationTitle]);

  // ── useChat hook ──────────────────────────────────────────────
  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/pages/${pageId}/chat`,
      body: () => ({
        conversationId: conversationRef.current,
        title: titleRef.current,
      }),
    }),
    onFinish: async () => {
      // After the stream completes, fetch the latest conversation if we didn't have one
      if (!conversationRef.current) {
        try {
          const res = await fetch(`/api/pages/${pageId}/conversations?limit=1`);
          if (res.ok) {
            const { data } = await res.json();
            if (data?.length > 0) {
              const conv = data[0];
              conversationRef.current = conv.id;
              setConversation((prev) => ({
                ...prev,
                conversationId: conv.id,
                title: conv.title || prev.title,
              }));
            }
          }
        } catch {
          // Non-critical -- conversation ID will be fetched on next interaction
        }
      }
    },
    onError: () => {
      // Error is already available via the `error` return value
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  // ── Extract tool entries from current messages (memoized) ───────
  const toolEntries = useMemo(() => extractToolEntries(messages), [messages]);

  // Merge expand state with extracted tool entries
  const toolLog: ToolEntry[] = useMemo(
    () => toolEntries.map((entry) => ({
      ...entry,
      expanded: toolExpandState[entry.id] ?? false,
    })),
    [toolEntries, toolExpandState]
  );

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Load most recent conversation on mount
  useEffect(() => {
    const controller = new AbortController();
    abortConvRef.current = controller;

    async function loadRecent() {
      try {
        const res = await fetch(`/api/pages/${pageId}/conversations?limit=1`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setConversation({ conversationId: null, title: null, isLoading: false });
          return;
        }
        const { data } = await res.json();
        if (data?.length > 0) {
          const conv = data[0];
          // Load full conversation with messages
          const msgRes = await fetch(`/api/pages/${pageId}/conversations/${conv.id}`, {
            signal: controller.signal,
          });
          if (!msgRes.ok) {
            setConversation({ conversationId: null, title: null, isLoading: false });
            return;
          }
          const { data: convData } = await msgRes.json();
          conversationRef.current = conv.id;
          setConversation({
            conversationId: conv.id,
            title: conv.title,
            isLoading: false,
          });
          setConversationTitle(conv.title);
          setMessages(dbMessagesToUI(convData.messages));
        } else {
          setConversation({ conversationId: null, title: null, isLoading: false });
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setConversation({ conversationId: null, title: null, isLoading: false });
        }
      }
    }

    loadRecent();
    return () => controller.abort();
  }, [pageId, setMessages]);

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;

    const userContent = input.trim();

    // Generate title from first message if no conversation exists yet
    if (!conversationRef.current && messages.length === 0) {
      const newTitle = generateConversationTitle(userContent);
      titleRef.current = newTitle;
      setConversationTitle(newTitle);
      setConversation((prev) => ({ ...prev, title: newTitle }));
    }

    sendMessage({ text: userContent });
    setInput('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isStreaming, messages.length, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleToolToggle = useCallback((toolId: string) => {
    setToolExpandState((prev) => ({
      ...prev,
      [toolId]: !prev[toolId],
    }));
  }, []);

  const fetchConversations = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/pages/${pageId}/conversations`);
      if (res.ok) {
        const { data } = await res.json();
        setConversations(data || []);
      }
    } catch {
      // Silently fail -- user can retry
    } finally {
      setIsLoadingHistory(false);
    }
  }, [pageId]);

  const handleSelectConversation = useCallback(
    async (convId: string) => {
      // Abort any in-flight conversation load
      abortConvRef.current?.abort();
      const controller = new AbortController();
      abortConvRef.current = controller;

      setConversation({ conversationId: convId, title: null, isLoading: true });
      setMessages([]);
      setToolExpandState({});

      try {
        const res = await fetch(`/api/pages/${pageId}/conversations/${convId}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Failed to load conversation');
        const { data } = await res.json();
        conversationRef.current = data.id;
        setConversation({
          conversationId: data.id,
          title: data.title,
          isLoading: false,
        });
        setConversationTitle(data.title);
        setMessages(dbMessagesToUI(data.messages));
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setConversation({ conversationId: null, title: null, isLoading: false });
        }
      }
    },
    [pageId, setMessages]
  );

  const handleNewConversation = useCallback(() => {
    conversationRef.current = null;
    titleRef.current = null;
    setConversation({ conversationId: null, title: null, isLoading: false });
    setConversationTitle(null);
    setMessages([]);
    setToolExpandState({});
  }, [setMessages]);

  const handleDeleteConversation = useCallback(async () => {
    if (!conversation.conversationId) return;

    try {
      await fetch(`/api/pages/${pageId}/conversations/${conversation.conversationId}`, {
        method: 'DELETE',
      });

      // Fetch remaining conversations and load the next one, or show empty state
      const res = await fetch(`/api/pages/${pageId}/conversations?limit=1`);
      if (res.ok) {
        const { data } = await res.json();
        if (data?.length > 0) {
          handleSelectConversation(data[0].id);
        } else {
          handleNewConversation();
        }
      } else {
        handleNewConversation();
      }
    } catch {
      // If delete fails, stay on current conversation
    }
  }, [conversation.conversationId, pageId, handleSelectConversation, handleNewConversation]);

  return (
    <div className="flex rounded-xl border bg-card overflow-hidden" style={{ height: 620 }}>
      {/* ── Chat column ─────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Conversation header strip */}
        {!conversation.isLoading &&
          (messages.length > 0 || conversation.conversationId) && (
            <ConversationHeader
              title={conversation.title}
              conversationId={conversation.conversationId}
              conversations={conversations}
              isLoadingHistory={isLoadingHistory}
              onNew={handleNewConversation}
              onSelect={handleSelectConversation}
              onDelete={handleDeleteConversation}
              onRefreshHistory={fetchConversations}
            />
          )}

        {/* Messages thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
          {messages.length === 0 ? (
            conversation.isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center select-none">
                <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Ask about this page</p>
                  <p className="text-xs text-muted-foreground max-w-[260px] leading-relaxed">
                    Performance, content quality, donation amounts, conversion
                    opportunities…
                  </p>
                </div>
              </div>
            )
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {msg.role === 'user' ? (
                  /* User bubble — bg-foreground text-background always readable */
                  <div className="max-w-[76%] rounded-2xl rounded-tr-sm px-4 py-3 bg-foreground text-background text-sm leading-relaxed">
                    {extractTextFromParts(msg)}
                  </div>
                ) : (
                  /* Assistant — no bubble, full width prose */
                  <div className="flex-1 min-w-0 text-sm">
                    {(() => {
                      const text = extractTextFromParts(msg);
                      const hasText = text.length > 0;
                      const msgIsStreaming =
                        isStreaming && msg.id === messages[messages.length - 1]?.id;

                      if (!hasText && msgIsStreaming) {
                        return <TypingDots />;
                      }

                      return (
                        <>
                          {hasText && <AIMarkdown content={text} />}
                          {hasText && !msgIsStreaming && (
                            <div className="flex items-center justify-end mt-2">
                              <CopyButton text={text} />
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))
          )}

          {/* Error display */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{error.message}</span>
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="border-t bg-background px-4 py-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this page... (Enter to send, Shift+Enter for new line)"
              disabled={isStreaming}
              rows={1}
              className="flex-1 resize-none text-sm leading-relaxed min-h-[40px] max-h-[120px] overflow-y-auto"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              size="icon"
              className="h-10 w-10 shrink-0"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Tool Activity Panel ──────────────────────────────────── */}
      <ToolActivityPanel tools={toolLog} onToggle={handleToolToggle} />
    </div>
  );
}
