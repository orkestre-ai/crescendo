'use client';

import { useEffect, useState, useCallback } from 'react';
import { clog } from '@/lib/client-logger';
import { useSearchParams, useRouter } from 'next/navigation';
import { Settings, RefreshCw, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { HelpButton } from '@/components/help/help-button';
import { getSettingsHelpContext } from '@/hooks/use-help-context';
import type { SettingsResponse } from '@/types/settings';

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') ?? 'connections');

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    router.replace(`/settings?tab=${tab}`, { scroll: false });
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
      clog.error('settings-page', 'fetch-settings-failed', { error: err instanceof Error ? err.message : String(err) });
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
          <Settings className="h-8 w-8" />
          <div>
            <h1 className="text-2xl font-semibold">Settings</h1>
            <p className="text-muted-foreground">Configure integrations and sync settings</p>
          </div>
        </div>
        <HelpButton contextKey={getSettingsHelpContext(activeTab)} />
      </div>

      {/* Setup Banner (when EN not connected) */}
      {settings.engagingNetworks.connectionStatus !== 'CONNECTED' && (
        <div className="flex items-start gap-3 rounded-lg border border-info/20 bg-info/10 p-4">
          <Info className="h-5 w-5 text-info mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-info">Welcome! Let&apos;s get started</p>
            <p className="text-sm text-info mt-1">
              Add your Engaging Networks API key below and test the connection.
            </p>
          </div>
        </div>
      )}

      <SettingsTabs
        settings={settings}
        onSettingsUpdate={fetchSettings}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
    </div>
  );
}
