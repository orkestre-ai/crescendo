'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Sparkles, Search, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AIMode = 'generate' | 'explore' | 'chat';

const MODES: Array<{
  value: AIMode;
  label: string;
  description: string;
  icon: typeof Sparkles;
}> = [
  {
    value: 'generate',
    label: 'Generate',
    description: 'AI-powered recommendations for this page',
    icon: Sparkles,
  },
  {
    value: 'explore',
    label: 'Explore',
    description: 'Quick queries across your analytics data',
    icon: Search,
  },
  {
    value: 'chat',
    label: 'Chat',
    description: 'Open conversation about this page',
    icon: MessageSquare,
  },
];

interface AISegmentedControlProps {
  activeMode: AIMode;
}

export function AISegmentedControl({ activeMode }: AISegmentedControlProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const handleModeChange = (mode: AIMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'recommendations');
    if (mode === 'generate') {
      params.delete('mode');
    } else {
      params.set('mode', mode);
    }
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  };

  return (
    <div className="grid grid-cols-3 gap-3">
      {MODES.map(({ value, label, description, icon: Icon }) => {
        const isActive = activeMode === value;
        return (
          <button
            key={value}
            onClick={() => handleModeChange(value)}
            className={cn(
              'group relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all duration-200',
              isActive
                ? 'border-primary/40 bg-primary/[0.04] shadow-sm'
                : 'border-border bg-card hover:border-primary/20 hover:bg-primary/[0.02]'
            )}
          >
            {/* Active indicator — left accent bar */}
            <div
              className={cn(
                'absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-all duration-200',
                isActive ? 'bg-primary' : 'bg-transparent group-hover:bg-primary/20'
              )}
            />

            <div className="flex items-center gap-2.5 pl-2">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span
                className={cn(
                  'text-sm font-semibold transition-colors duration-200',
                  isActive ? 'text-foreground' : 'text-foreground/80'
                )}
              >
                {label}
              </span>
            </div>

            <p
              className={cn(
                'pl-2 text-xs leading-relaxed transition-colors duration-200',
                isActive ? 'text-muted-foreground' : 'text-muted-foreground/70'
              )}
            >
              {description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
