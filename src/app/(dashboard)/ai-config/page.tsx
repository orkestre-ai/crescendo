'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { clog } from '@/lib/client-logger';
import { useSearchParams, useRouter } from 'next/navigation';
import { Brain, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AiConfigTabs } from '@/components/ai-config/ai-config-tabs';
import { HelpButton } from '@/components/help/help-button';
import { getAiConfigHelpContext } from '@/hooks/use-help-context';
import type { SettingsResponse } from '@/types/settings';

export default function AiConfigPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <AiConfigPageContent />
    </Suspense>
  );
}

function AiConfigPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') ?? 'models');

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    router.replace(`/ai-config?tab=${tab}`, { scroll: false });
  };

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }
      const data: SettingsResponse = await response.json();
      setSettings(data);
      setError(null);
    } catch (err) {
      clog.error('ai-config-page', 'fetch-settings-failed', { error: err instanceof Error ? err.message : String(err) });
      setError('Failed to load settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle className="h-12 w-12 text-warning" />
        <p className="text-muted-foreground">{error || 'Failed to load settings'}</p>
        <Button onClick={fetchSettings}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="h-8 w-8" />
          <div>
            <h1 className="text-2xl font-semibold">AI Config</h1>
            <p className="text-muted-foreground">Configure AI models, prompts, and tools</p>
          </div>
        </div>
        <HelpButton contextKey={getAiConfigHelpContext(activeTab)} />
      </div>

      <AiConfigTabs
        settings={settings}
        onSettingsUpdate={fetchSettings}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
    </div>
  );
}
