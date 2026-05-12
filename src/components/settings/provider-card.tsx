'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  EyeOff,
  ChevronDown,
  X,
} from 'lucide-react';
import type { ProviderName, ModelEntry } from '@/lib/ai/types';

interface ProviderCardProps {
  provider: ProviderName;
  title: string;
  description: string;
  icon: React.ReactNode;
  isConfigured: boolean;
  apiKeyMasked: string | null;
  hasEnvFallback?: boolean;
  baseUrl?: string | null;
  models: ModelEntry[];
  onSaveKey: (key: string) => Promise<void>;
  onSaveBaseUrl?: (url: string) => Promise<void>;
  onTestConnection: (
    key: string
  ) => Promise<{ success: boolean; responseTimeMs?: number; error?: string }>;
  onModelsChange: (models: ModelEntry[]) => void;
  onRefreshOllamaModels?: () => Promise<void>;
  onConfigurationChanged?: () => void;
}

export function ProviderCard({
  provider,
  title,
  description,
  icon,
  isConfigured,
  apiKeyMasked,
  hasEnvFallback,
  baseUrl,
  models,
  onSaveKey,
  onSaveBaseUrl,
  onTestConnection,
  onModelsChange,
  onRefreshOllamaModels,
  onConfigurationChanged,
}: ProviderCardProps) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrlInput, setBaseUrlInput] = useState(baseUrl || 'http://localhost:11434/api');
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    responseTimeMs?: number;
    error?: string;
  } | null>(null);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [newModelId, setNewModelId] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);

  const isOllama = provider === 'ollama';

  const handleSaveAndTest = async () => {
    if (isOllama) {
      if (!baseUrlInput.trim()) return;
    } else {
      if (!apiKeyInput.trim()) return;
    }

    setIsSaving(true);
    setTestResult(null);

    try {
      if (isOllama && onSaveBaseUrl) {
        await onSaveBaseUrl(baseUrlInput);
      } else {
        await onSaveKey(apiKeyInput);
      }

      const result = await onTestConnection(isOllama ? baseUrlInput : apiKeyInput);
      setTestResult(result);

      if (result.success && isOllama && onRefreshOllamaModels) {
        // Auto-discover models after successful connection test
        await handleRefreshOllama();
        setModelsOpen(true);
      }
      if (result.success && !isOllama) {
        setApiKeyInput('');
      }
      // Notify parent to refresh settings (updates isConfigured badge, enables model dropdowns)
      if (result.success && onConfigurationChanged) {
        onConfigurationChanged();
      }
    } catch {
      setTestResult({
        success: false,
        error: `Failed to save ${title} configuration. Please try again.`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshOllama = async () => {
    if (!onRefreshOllamaModels) return;
    setIsDiscovering(true);
    try {
      await onRefreshOllamaModels();
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleAddModel = () => {
    const trimmed = newModelId.trim();
    if (!trimmed) return;
    // Prevent duplicate model IDs
    if (models.some((m) => m.id === trimmed)) return;
    onModelsChange([...models, { id: trimmed, label: trimmed, isDefault: false }]);
    setNewModelId('');
  };

  const handleRemoveModel = (modelId: string) => {
    onModelsChange(models.filter((m) => m.id !== modelId));
  };

  // Not configured alert messages per UI-SPEC Copywriting Contract
  const notConfiguredAlerts: Record<ProviderName, string> = {
    anthropic:
      'Anthropic Not Configured -- Enter your API key below, or set the ANTHROPIC_API_KEY environment variable.',
    openai: 'OpenAI Not Configured -- Enter your API key to enable GPT models.',
    google: 'Google AI Not Configured -- Enter your API key to enable Gemini models.',
    ollama:
      'Ollama Not Configured -- Enter the base URL for your local Ollama instance.',
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {icon}
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {isConfigured ? (
            <Badge
              variant="default"
              className="bg-success/10 text-success border-success/20"
            >
              <CheckCircle2 className="w-3 h-3 mr-1" /> Configured
            </Badge>
          ) : (
            <Badge variant="outline">
              <AlertCircle className="w-3 h-3 mr-1" /> Not Configured
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current key display (if configured) */}
        {isConfigured && !isOllama && apiKeyMasked && (
          <div className="bg-muted rounded-lg p-3">
            <div className="text-sm text-muted-foreground mb-1">Current API Key</div>
            <div className="font-mono text-sm">{apiKeyMasked}</div>
          </div>
        )}

        {/* Ollama: show base URL instead */}
        {isConfigured && isOllama && baseUrl && (
          <div className="bg-muted rounded-lg p-3">
            <div className="text-sm text-muted-foreground mb-1">Base URL</div>
            <div className="font-mono text-sm">{baseUrl}</div>
          </div>
        )}

        {/* Not configured alert */}
        {!isConfigured && (
          <div className="bg-warning/10 text-warning rounded-lg p-4">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4" />
              {notConfiguredAlerts[provider]}
            </div>
          </div>
        )}

        {/* Env var fallback notice (Anthropic only) */}
        {provider === 'anthropic' && hasEnvFallback && !apiKeyMasked && (
          <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground">
            Using ANTHROPIC_API_KEY environment variable. Save a key above to manage it
            in Settings.
          </div>
        )}

        {/* Key input row */}
        {!isOllama ? (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  provider === 'anthropic' ? 'sk-ant-...' : 'Enter API key...'
                }
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowApiKey(!showApiKey)}
                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                title={showApiKey ? 'Hide API key' : 'Show API key'}
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button
              onClick={handleSaveAndTest}
              disabled={!apiKeyInput.trim() || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                'Save & Test'
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="text"
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder="http://localhost:11434/api"
                className="flex-1"
              />
              <Button
                onClick={handleSaveAndTest}
                disabled={!baseUrlInput.trim() || isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Save & Test'
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleRefreshOllama}
                disabled={isDiscovering}
              >
                {isDiscovering ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Discovering...
                  </>
                ) : (
                  'Refresh from Ollama'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <div
            className={`p-3 rounded-lg ${
              testResult.success
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <span className="font-medium">
                {testResult.success ? 'Connection Successful' : 'Connection Failed'}
              </span>
            </div>
            <div className="text-sm mt-1">
              {testResult.success
                ? isOllama
                  ? `Ollama is running. ${models.length} model${models.length !== 1 ? 's' : ''} discovered.`
                  : `${title} API is reachable.`
                : testResult.error}
            </div>
            {testResult.success && testResult.responseTimeMs && (
              <div className="text-xs mt-1 opacity-70">
                Response time: {testResult.responseTimeMs}ms
              </div>
            )}
          </div>
        )}

        {/* Model list */}
        <Collapsible open={modelsOpen} onOpenChange={setModelsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between px-3">
              <span>Models ({models.length})</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${modelsOpen ? 'rotate-180' : ''}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            {isDiscovering ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : models.length === 0 ? (
              <div className="text-sm text-muted-foreground px-3 py-2">
                {isOllama
                  ? 'No models found. Pull a model with `ollama pull llama3.1`'
                  : 'No models configured. Add a model ID below.'}
              </div>
            ) : (
              <div className="space-y-1">
                {models.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-muted"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm">{model.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {model.id}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveModel(model.id)}
                      aria-label={`Remove ${model.label}`}
                      title={`Remove ${model.label}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add model input */}
            <div className="flex gap-2 px-3 pt-1">
              <Input
                type="text"
                value={newModelId}
                onChange={(e) => setNewModelId(e.target.value)}
                placeholder="Enter model ID (e.g., gpt-4-turbo)"
                className="flex-1 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddModel();
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddModel}
                disabled={!newModelId.trim()}
              >
                Add Model
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
