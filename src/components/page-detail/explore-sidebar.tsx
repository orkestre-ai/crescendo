'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart3,
  FileDiff,
  Globe,
  Smartphone,
  MousePointerClick,
  TrendingUp,
  Search,
  Users,
  DollarSign,
  Target,
  Lightbulb,
  Zap,
  LineChart,
  PieChart,
  Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Single source of truth for exploration icon mapping
export const ICON_MAP: Record<string, LucideIcon> = {
  BarChart3,
  FileDiff,
  Globe,
  Smartphone,
  MousePointerClick,
  TrendingUp,
  Search,
  Users,
  DollarSign,
  Target,
  Lightbulb,
  Zap,
  LineChart,
  PieChart,
  Activity,
};

interface Exploration {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface ExploreSidebarProps {
  explorations: Exploration[];
  selectedId: string | null;
  cachedMap: Record<string, boolean>;
  isLoading: boolean;
  onSelect: (explorationId: string) => void;
}

export function ExploreSidebar({
  explorations,
  selectedId,
  cachedMap,
  isLoading,
  onSelect,
}: ExploreSidebarProps) {
  return (
    <div className="w-60 shrink-0 border-r flex flex-col bg-muted/30">
      <div className="px-3 py-2 border-b">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Explorations
        </h3>
      </div>
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-2 space-y-1">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 mx-1 rounded-md" />
            ))}
          </div>
        ) : (
          <div className="py-1">
            {explorations.map((exploration) => {
              const Icon = ICON_MAP[exploration.icon] || BarChart3;
              const isSelected = exploration.id === selectedId;
              return (
                <button
                  key={exploration.id}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-accent/50 transition-colors relative ${
                    isSelected ? 'bg-accent' : ''
                  }`}
                  onClick={() => onSelect(exploration.id)}
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {exploration.name}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {exploration.description}
                    </p>
                  </div>
                  {cachedMap[exploration.id] && (
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
