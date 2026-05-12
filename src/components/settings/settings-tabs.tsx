'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ENConnectionPanel } from './en-connection-panel';
import { ENPublicPanel } from './en-public-panel';
import { GA4WizardPanel } from './ga4-wizard-panel';
import { CurrencyPanel } from './currency-panel';
import { SyncSettingsPanel } from './sync-settings-panel';
import { DatabasePanel } from './database-panel';
import type { SettingsResponse } from '@/types/settings';

interface SettingsTabsProps {
  settings: SettingsResponse;
  onSettingsUpdate: () => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function SettingsTabs({
  settings,
  onSettingsUpdate,
  activeTab,
  onTabChange,
}: SettingsTabsProps) {
  return (
    <Tabs
      value={activeTab}
      defaultValue="connections"
      onValueChange={onTabChange}
      className="space-y-6"
    >
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="connections">Connections</TabsTrigger>
        <TabsTrigger value="sync">Sync Settings</TabsTrigger>
        <TabsTrigger value="database">Database</TabsTrigger>
      </TabsList>

      <TabsContent value="connections" className="space-y-6">
        <ENConnectionPanel settings={settings} onSettingsUpdate={onSettingsUpdate} />
        <ENPublicPanel settings={settings} onSettingsUpdate={onSettingsUpdate} />
        <GA4WizardPanel settings={settings} onSettingsUpdate={onSettingsUpdate} />
        <CurrencyPanel settings={settings} onSettingsUpdate={onSettingsUpdate} />
      </TabsContent>

      <TabsContent value="sync">
        <SyncSettingsPanel settings={settings} onSettingsUpdate={onSettingsUpdate} />
      </TabsContent>

      <TabsContent value="database">
        <DatabasePanel settings={settings} onSettingsUpdate={onSettingsUpdate} />
      </TabsContent>
    </Tabs>
  );
}
