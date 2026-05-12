'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-9 w-9', !collapsed && 'w-full justify-start gap-3 px-3')}
        disabled
      >
        <Sun className="h-5 w-5 shrink-0" />
        {!collapsed && <span className="text-sm">Theme</span>}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size={collapsed ? 'icon' : 'default'}
      className={cn('h-9 w-9', !collapsed && 'w-full justify-start gap-3 px-3 h-auto py-2')}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="h-5 w-5 shrink-0" />
      ) : (
        <Moon className="h-5 w-5 shrink-0" />
      )}
      {!collapsed && (
        <span className="text-sm font-medium">
          {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
        </span>
      )}
    </Button>
  );
}
