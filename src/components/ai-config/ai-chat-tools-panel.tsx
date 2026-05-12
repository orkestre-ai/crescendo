'use client';

import { useState } from 'react';
import { clog } from '@/lib/client-logger';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, ChevronDown, RotateCcw, Trash2, Plus, X, AlertTriangle } from 'lucide-react';
import { DEFAULT_CHAT_SYSTEM_PROMPT } from '@/config/ai-defaults';
import type { SettingsResponse } from '@/types/settings';

interface AiChatToolsPanelProps {
  settings: SettingsResponse;
  onSettingsUpdate: () => void;
}

export function AiChatToolsPanel({ settings, onSettingsUpdate }: AiChatToolsPanelProps) {
  // Chat Settings state
  const [chatSystemPrompt, setChatSystemPrompt] = useState<string | null>(
    settings.ai.chatSystemPrompt
  );
  const [chatPromptOpen, setChatPromptOpen] = useState(false);

  // Tool Guardrails state
  const [orgSearchDomains, setOrgSearchDomains] = useState<string[]>(
    settings.ai.orgSearchDomains
  );
  const [newDomain, setNewDomain] = useState('');

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  // Danger zone state
  const [clearResult, setClearResult] = useState<{ success: boolean; message: string } | null>(
    null
  );
  const [isClearing, setIsClearing] = useState(false);

  const displayChatSystemPrompt = chatSystemPrompt ?? DEFAULT_CHAT_SYSTEM_PROMPT;

  // Detect changes from saved settings
  const hasChanges =
    chatSystemPrompt !== settings.ai.chatSystemPrompt ||
    JSON.stringify(orgSearchDomains) !== JSON.stringify(settings.ai.orgSearchDomains);

  // Prompt handlers
  const handleChatSystemPromptChange = (value: string) => {
    setChatSystemPrompt(value === DEFAULT_CHAT_SYSTEM_PROMPT ? null : value);
  };

  const handleResetChatSystemPrompt = () => {
    setChatSystemPrompt(null);
  };

  // Domain handlers
  const handleAddDomain = () => {
    let domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    if (orgSearchDomains.length >= 5) return;
    // Strip protocol and path if user pasted a full URL
    try {
      if (domain.includes('://')) {
        domain = new URL(domain).hostname;
      } else if (domain.includes('/')) {
        domain = domain.split('/')[0];
      }
    } catch {
      // keep as-is if URL parsing fails
    }
    // Validate domain format
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(domain)) {
      return;
    }
    if (orgSearchDomains.includes(domain)) {
      setNewDomain('');
      return;
    }
    setOrgSearchDomains((prev) => [...prev, domain]);
    setNewDomain('');
  };

  const handleRemoveDomain = (domain: string) => {
    setOrgSearchDomains((prev) => prev.filter((d) => d !== domain));
  };

  const handleDomainKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddDomain();
    }
  };

  // Save handler
  const handleSave = async () => {
    setIsSaving(true);
    setSaveResult(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiChatSystemPrompt: chatSystemPrompt,
          aiOrgSearchDomains: orgSearchDomains,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save chat & tools settings');
      }

      setSaveResult({ success: true, message: 'Chat & tools settings saved successfully.' });
      setTimeout(() => setSaveResult(null), 3000);
      onSettingsUpdate();
    } catch (error) {
      clog.error('ai-chat-tools-panel', 'save-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      setSaveResult({
        success: false,
        message: 'Failed to save settings. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Clear chat history handler
  const handleClearChatHistory = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete all chat history? This action cannot be undone.'
    );
    if (!confirmed) return;

    setIsClearing(true);
    setClearResult(null);

    try {
      const response = await fetch('/api/chat/history', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to clear chat history');
      }

      const data = await response.json();
      const deletedCount = data.deleted ?? 0;
      setClearResult({
        success: true,
        message: `Cleared ${deletedCount} chat conversation${deletedCount === 1 ? '' : 's'}.`,
      });
    } catch (error) {
      clog.error('ai-chat-tools-panel', 'clear-history-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      setClearResult({
        success: false,
        message: 'Failed to clear chat history. Please try again.',
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section 1: Chat Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Chat Settings</CardTitle>
          <CardDescription>
            Configure the system prompt used for page chat conversations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Collapsible open={chatPromptOpen} onOpenChange={setChatPromptOpen}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Chat System Prompt</Label>
                  <p className="text-xs text-muted-foreground">
                    Customize the system prompt sent to the AI in chat conversations
                  </p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${chatPromptOpen ? 'rotate-180' : ''}`}
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="space-y-2">
                <Textarea
                  value={displayChatSystemPrompt}
                  onChange={(e) => handleChatSystemPromptChange(e.target.value)}
                  rows={8}
                  className="font-mono text-xs"
                />
                <div className="flex items-center justify-between">
                  {chatSystemPrompt !== null ? (
                    <span className="text-xs text-warning">Custom prompt in use</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Using default prompt</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetChatSystemPrompt}
                    disabled={chatSystemPrompt === null}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset to Default
                  </Button>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Section 2: Tool Guardrails */}
      <Card>
        <CardHeader>
          <CardTitle>Tool Guardrails</CardTitle>
          <CardDescription>
            Control how AI tools interact with external services
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Web Search Domain Allowlist</Label>
            <p className="text-xs text-muted-foreground">
              Restrict org_search to these domains. Empty = allow all.
            </p>

            {/* Domain chips */}
            {orgSearchDomains.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {orgSearchDomains.map((domain) => (
                  <Badge key={domain} variant="secondary" className="pl-2 pr-1 py-1 text-xs">
                    {domain}
                    <button
                      type="button"
                      onClick={() => handleRemoveDomain(domain)}
                      className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Add domain input */}
            {orgSearchDomains.length < 5 && (
              <div className="flex gap-2">
                <Input
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  onKeyDown={handleDomainKeyDown}
                  placeholder="example.org"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddDomain}
                  disabled={!newDomain.trim()}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
            )}

            {orgSearchDomains.length >= 5 && (
              <p className="text-xs text-muted-foreground">
                Maximum of 5 domains reached. Remove one to add another.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
          <CardDescription>Irreversible actions that affect stored data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-destructive/30 p-4">
            <div>
              <p className="text-sm font-medium">Clear All Chat History</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete all chat conversations across all pages
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearChatHistory}
              disabled={isClearing}
            >
              {isClearing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear History
                </>
              )}
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

      {/* Save Result */}
      {saveResult && (
        <div
          className={`p-3 rounded-lg text-sm ${
            saveResult.success
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {saveResult.message}
        </div>
      )}

      {/* Save Button */}
      <Button onClick={handleSave} disabled={isSaving || !hasChanges} className="w-full">
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          'Save Chat & Tools Settings'
        )}
      </Button>
    </div>
  );
}
