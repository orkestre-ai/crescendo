'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AiModelsPanel } from './ai-models-panel';
import { AiRecommendationsPanel } from './ai-recommendations-panel';
import { AiChatToolsPanel } from './ai-chat-tools-panel';
import { ExplorationsPanel } from './explorations-panel';
import type { SettingsResponse } from '@/types/settings';

interface AiConfigTabsProps {
  settings: SettingsResponse;
  onSettingsUpdate: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function AiConfigTabs({
  settings,
  onSettingsUpdate,
  activeTab,
  onTabChange,
}: AiConfigTabsProps) {
  return (
    <Tabs
      value={activeTab}
      defaultValue="models"
      onValueChange={onTabChange}
      className="space-y-6"
    >
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="models">Models</TabsTrigger>
        <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        <TabsTrigger value="explorations">Explorations</TabsTrigger>
        <TabsTrigger value="chat-tools">Chat &amp; Tools</TabsTrigger>
      </TabsList>

      <TabsContent value="models">
        <AiModelsPanel settings={settings} onSettingsUpdate={onSettingsUpdate} />
      </TabsContent>

      <TabsContent value="recommendations">
        <AiRecommendationsPanel settings={settings} onSettingsUpdate={onSettingsUpdate} />
      </TabsContent>

      <TabsContent value="explorations">
        <ExplorationsPanel settings={settings} onSettingsUpdate={onSettingsUpdate} />
      </TabsContent>

      <TabsContent value="chat-tools">
        <AiChatToolsPanel settings={settings} onSettingsUpdate={onSettingsUpdate} />
      </TabsContent>
    </Tabs>
  );
}
