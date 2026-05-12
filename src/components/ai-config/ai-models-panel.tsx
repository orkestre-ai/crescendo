'use client';

import { useState, useEffect } from 'react';
import { clog } from '@/lib/client-logger';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles, Brain, Gem, Server } from 'lucide-react';
import type { SettingsResponse } from '@/types/settings';
import type { ProviderName, ModelEntry, AiModelLists } from '@/lib/ai/types';
import { ProviderCard } from '@/components/settings/provider-card';

interface AiModelsPanelProps {
  settings: SettingsResponse;
  onSettingsUpdate: () => void;
}

export function AiModelsPanel({ settings, onSettingsUpdate }: AiModelsPanelProps) {
  // Model lists state (local, saved with bulk save)
  const [modelLists, setModelLists] = useState<AiModelLists>(settings.providers.modelLists);

  // Model assignment state
  const [chatAssignment, setChatAssignment] = useState(
    `${settings.providers.chatProvider}:${settings.providers.chatModelId}`
  );
  const [exploreAssignment, setExploreAssignment] = useState(
    `${settings.providers.exploreProvider}:${settings.providers.exploreModelId}`
  );
  const [recsAssignment, setRecsAssignment] = useState(
    `${settings.providers.recsProvider}:${settings.providers.recsModelId}`
  );

  // AI Limits state
  const [chatMaxContext, setChatMaxContext] = useState(settings.ai.chatMaxContext);
  const [chatMaxTokens, setChatMaxTokens] = useState(settings.ai.chatMaxTokens);

  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  // Sync local model lists when settings refresh (e.g., after Save & Test discovers Ollama models)
  useEffect(() => {
    setModelLists((prev) => {
      // Merge: keep locally-added models, add any new ones from server
      const merged = { ...prev };
      for (const provider of Object.keys(settings.providers.modelLists) as ProviderName[]) {
        const serverModels = settings.providers.modelLists[provider];
        const localIds = new Set(prev[provider].map((m) => m.id));
        const newFromServer = serverModels.filter((m) => !localIds.has(m.id));
        if (newFromServer.length > 0) {
          merged[provider] = [...prev[provider], ...newFromServer];
        }
      }
      return merged;
    });
  }, [settings.providers.modelLists]);

  // Parse assignment values
  const parseAssignment = (value: string) => {
    const [provider, ...rest] = value.split(':');
    return { provider, modelId: rest.join(':') };
  };

  // Check if any provider is configured (for enabling model assignment dropdowns)
  const hasAnyProvider =
    settings.providers.anthropic.isConfigured ||
    settings.providers.openai.isConfigured ||
    settings.providers.google.isConfigured ||
    settings.providers.ollama.isConfigured;

  // Check if any changes have been made
  const hasChanges =
    chatMaxContext !== settings.ai.chatMaxContext ||
    chatMaxTokens !== settings.ai.chatMaxTokens ||
    JSON.stringify(modelLists) !== JSON.stringify(settings.providers.modelLists) ||
    chatAssignment !== `${settings.providers.chatProvider}:${settings.providers.chatModelId}` ||
    exploreAssignment !==
      `${settings.providers.exploreProvider}:${settings.providers.exploreModelId}` ||
    recsAssignment !== `${settings.providers.recsProvider}:${settings.providers.recsModelId}`;

  // Save model assignments + model lists + limits via PUT /api/settings
  const handleSave = async () => {
    setIsSaving(true);
    setSaveResult(null);

    try {
      const chat = parseAssignment(chatAssignment);
      const explore = parseAssignment(exploreAssignment);
      const recs = parseAssignment(recsAssignment);

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiChatMaxContext: chatMaxContext,
          aiChatMaxTokens: chatMaxTokens,
          aiModelLists: modelLists,
          aiChatProvider: chat.provider,
          aiChatModelId: chat.modelId,
          aiExploreProvider: explore.provider,
          aiExploreModelId: explore.modelId,
          aiRecsProvider: recs.provider,
          aiRecsModelId: recs.modelId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save model settings');
      }

      setSaveResult({ success: true, message: 'Model settings saved successfully.' });
      setTimeout(() => setSaveResult(null), 3000);
      onSettingsUpdate();
    } catch (error) {
      clog.error('ai-models-panel', 'save-failed', { error: error instanceof Error ? error.message : String(error) });
      setSaveResult({ success: false, message: 'Failed to save model settings. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Save individual provider key
  const saveProviderKey = async (field: string, key: string) => {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: key }),
    });
    if (!response.ok) throw new Error('Failed to save API key');
    onSettingsUpdate();
  };

  // Save Ollama base URL
  const saveOllamaBaseUrl = async (url: string) => {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ollamaBaseUrl: url }),
    });
    if (!response.ok) throw new Error('Failed to save base URL');
    onSettingsUpdate();
  };

  // Test provider connection
  const testProvider = async (
    provider: string,
    keyOrUrl: string
  ): Promise<{ success: boolean; responseTimeMs?: number; error?: string }> => {
    const body: Record<string, string> = { provider };
    if (provider === 'ollama') {
      body.baseUrl = keyOrUrl;
    } else {
      body.apiKey = keyOrUrl;
    }
    const response = await fetch('/api/settings/test-provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json();
  };

  // Handle model list changes
  const handleModelsChange = (provider: ProviderName, models: ModelEntry[]) => {
    setModelLists((prev) => ({ ...prev, [provider]: models }));
  };

  // Refresh Ollama models
  const handleRefreshOllama = async () => {
    try {
      const response = await fetch('/api/settings/ollama-models');
      const data = await response.json();
      if (data.success && data.models) {
        // Merge discovered models with existing, keeping any manually added ones
        const existingIds = new Set(modelLists.ollama.map((m: ModelEntry) => m.id));
        const newModels = data.models.filter(
          (m: ModelEntry) => !existingIds.has(m.id)
        );
        setModelLists((prev) => ({
          ...prev,
          ollama: [...prev.ollama, ...newModels],
        }));
      }
    } catch (err) {
      clog.error('ai-models-panel', 'refresh-ollama-failed', { error: err instanceof Error ? err.message : String(err) });
    }
  };

  // Build available models for assignment dropdowns (only from configured providers)
  const renderModelOptions = () => {
    const providerLabels: Record<ProviderName, string> = {
      anthropic: 'Anthropic',
      openai: 'OpenAI',
      google: 'Google AI',
      ollama: 'Ollama',
    };

    const providerOrder: ProviderName[] = ['anthropic', 'openai', 'google', 'ollama'];

    return providerOrder.map((providerName) => {
      const models = modelLists[providerName];
      if (models.length === 0) return null;

      // Check if provider is configured
      const providerSettings = settings.providers[providerName];
      const isProviderConfigured = providerSettings.isConfigured;
      if (!isProviderConfigured) return null;

      return (
        <SelectGroup key={providerName}>
          <SelectLabel>{providerLabels[providerName]}</SelectLabel>
          {models.map((m) => (
            <SelectItem key={`${providerName}:${m.id}`} value={`${providerName}:${m.id}`}>
              {m.label}
            </SelectItem>
          ))}
        </SelectGroup>
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* Section 1: Model Assignment */}
      <Card>
        <CardHeader>
          <CardTitle>Model Assignment</CardTitle>
          <CardDescription>
            Choose which model to use for each AI feature. Only models from configured providers are
            available.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Chat Model */}
          <div className="space-y-2">
            <Label htmlFor="chat-assignment">Chat Model</Label>
            <Select
              value={chatAssignment}
              onValueChange={setChatAssignment}
              disabled={!hasAnyProvider}
            >
              <SelectTrigger id="chat-assignment" className="w-full">
                <SelectValue
                  placeholder={
                    hasAnyProvider ? 'Select a model' : 'Configure a provider above'
                  }
                />
              </SelectTrigger>
              <SelectContent>{renderModelOptions()}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Model used for page chat conversations
            </p>
          </div>

          {/* Explore Model */}
          <div className="space-y-2">
            <Label htmlFor="explore-assignment">Explore Model</Label>
            <Select
              value={exploreAssignment}
              onValueChange={setExploreAssignment}
              disabled={!hasAnyProvider}
            >
              <SelectTrigger id="explore-assignment" className="w-full">
                <SelectValue
                  placeholder={
                    hasAnyProvider ? 'Select a model' : 'Configure a provider above'
                  }
                />
              </SelectTrigger>
              <SelectContent>{renderModelOptions()}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Model used for exploration queries</p>
          </div>

          {/* Recommendations Model */}
          <div className="space-y-2">
            <Label htmlFor="recs-assignment">Recommendations Model</Label>
            <Select
              value={recsAssignment}
              onValueChange={setRecsAssignment}
              disabled={!hasAnyProvider}
            >
              <SelectTrigger id="recs-assignment" className="w-full">
                <SelectValue
                  placeholder={
                    hasAnyProvider ? 'Select a model' : 'Configure a provider above'
                  }
                />
              </SelectTrigger>
              <SelectContent>{renderModelOptions()}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Model used for generating optimization recommendations
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Model Connections */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">AI Providers</h2>
          <p className="text-sm text-muted-foreground">
            Configure API credentials for each AI provider. Models from configured providers appear
            in the assignment dropdowns above.
          </p>
        </div>

        <div className="space-y-8">
          <ProviderCard
            provider="anthropic"
            title="Anthropic"
            description="Claude models for chat, explorations, and recommendations"
            icon={<Sparkles className="h-5 w-5" />}
            isConfigured={settings.providers.anthropic.isConfigured}
            apiKeyMasked={settings.providers.anthropic.apiKeyMasked}
            hasEnvFallback={settings.providers.anthropic.hasEnvFallback}
            models={modelLists.anthropic}
            onSaveKey={async (key) => {
              await saveProviderKey('anthropicApiKey', key);
            }}
            onTestConnection={async (key) => {
              return testProvider('anthropic', key);
            }}
            onModelsChange={(models) => handleModelsChange('anthropic', models)}
            onConfigurationChanged={onSettingsUpdate}
          />

          <ProviderCard
            provider="openai"
            title="OpenAI"
            description="GPT models for chat, explorations, and recommendations"
            icon={<Brain className="h-5 w-5" />}
            isConfigured={settings.providers.openai.isConfigured}
            apiKeyMasked={settings.providers.openai.apiKeyMasked}
            models={modelLists.openai}
            onSaveKey={async (key) => {
              await saveProviderKey('openaiApiKey', key);
            }}
            onTestConnection={async (key) => {
              return testProvider('openai', key);
            }}
            onModelsChange={(models) => handleModelsChange('openai', models)}
            onConfigurationChanged={onSettingsUpdate}
          />

          <ProviderCard
            provider="google"
            title="Google AI"
            description="Gemini models for chat, explorations, and recommendations"
            icon={<Gem className="h-5 w-5" />}
            isConfigured={settings.providers.google.isConfigured}
            apiKeyMasked={settings.providers.google.apiKeyMasked}
            models={modelLists.google}
            onSaveKey={async (key) => {
              await saveProviderKey('googleApiKey', key);
            }}
            onTestConnection={async (key) => {
              return testProvider('google', key);
            }}
            onModelsChange={(models) => handleModelsChange('google', models)}
            onConfigurationChanged={onSettingsUpdate}
          />

          <ProviderCard
            provider="ollama"
            title="Ollama (Local)"
            description="Run models locally. Requires Ollama running on your machine."
            icon={<Server className="h-5 w-5" />}
            isConfigured={settings.providers.ollama.isConfigured}
            apiKeyMasked={null}
            baseUrl={settings.providers.ollama.baseUrl}
            models={modelLists.ollama}
            onSaveKey={async () => {}}
            onSaveBaseUrl={saveOllamaBaseUrl}
            onTestConnection={async (url) => {
              return testProvider('ollama', url);
            }}
            onModelsChange={(models) => handleModelsChange('ollama', models)}
            onRefreshOllamaModels={handleRefreshOllama}
            onConfigurationChanged={onSettingsUpdate}
          />
        </div>
      </div>

      {/* Section 3: AI Limits */}
      <Card>
        <CardHeader>
          <CardTitle>AI Limits</CardTitle>
          <CardDescription>Configure token limits for Chat and Explore modes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="chat-max-context">Max Context (tokens)</Label>
              <Input
                id="chat-max-context"
                type="number"
                value={chatMaxContext}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v)) setChatMaxContext(v);
                }}
                min={1000}
                max={200000}
              />
              <p className="text-xs text-muted-foreground">Max input tokens per request</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="chat-max-tokens">Max Response (tokens)</Label>
              <Input
                id="chat-max-tokens"
                type="number"
                value={chatMaxTokens}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v)) setChatMaxTokens(v);
                }}
                min={256}
                max={8192}
              />
              <p className="text-xs text-muted-foreground">Max output tokens per response</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Result */}
      {saveResult && (
        <div
          className={`p-3 rounded-lg text-sm ${
            saveResult.success ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
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
          'Save Model Settings'
        )}
      </Button>
    </div>
  );
}
