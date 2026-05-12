'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { type HelpContextKey } from '@/lib/help-content';

export function useHelpContext(): HelpContextKey {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Dashboard
  if (pathname === '/') return 'dashboard';

  // Page detail — detect tab and mode from searchParams
  if (pathname.match(/^\/pages\/[^/]+$/)) {
    const tab = searchParams.get('tab') || 'metrics';
    if (tab === 'content') return 'page-detail:content';
    if (tab === 'recommendations') {
      const mode = searchParams.get('mode') || 'generate';
      if (mode === 'explore') return 'page-detail:recommendations:explore';
      if (mode === 'chat') return 'page-detail:recommendations:chat';
      return 'page-detail:recommendations:generate';
    }
    return 'page-detail:metrics';
  }

  // AI Config — detect tab from searchParams
  if (pathname === '/ai-config' || pathname.startsWith('/ai-config/')) {
    const tab = searchParams.get('tab') || 'models';
    return getAiConfigHelpContext(tab);
  }

  // Settings — default to connections (settings tabs are not URL-driven)
  if (pathname === '/settings') return 'settings:connections';

  // Help page itself — default to dashboard context
  if (pathname === '/help') return 'dashboard';

  return 'dashboard';
}

export function getSettingsHelpContext(activeTab: string): HelpContextKey {
  const map: Record<string, HelpContextKey> = {
    connections: 'settings:connections',
    sync: 'settings:sync',
    database: 'settings:database',
  };
  return map[activeTab] || 'settings:connections';
}

export function getAiConfigHelpContext(activeTab: string): HelpContextKey {
  const map: Record<string, HelpContextKey> = {
    models: 'ai-config:models',
    recommendations: 'ai-config:recommendations',
    explorations: 'ai-config:explorations',
    'chat-tools': 'ai-config:chat-tools',
  };
  return map[activeTab] || 'ai-config:models';
}
