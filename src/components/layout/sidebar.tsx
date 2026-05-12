'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BarChart3, Brain, Settings, HelpCircle, ChevronLeft, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTheme } from 'next-themes';
import { AboutDialog } from './about-dialog';
import { UpdateBanner } from './update-banner';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const navigationItems = [
  {
    title: 'Dashboard',
    href: '/',
    icon: BarChart3,
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
  },
  {
    title: 'AI Config',
    href: '/ai-config',
    icon: Brain,
  },
  {
    title: 'Help',
    href: '/help',
    icon: HelpCircle,
  },
];

function ThemeToggleNav({ isCollapsed }: { isCollapsed: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <button
      onClick={() => mounted && setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
        isCollapsed && 'justify-center'
      )}
    >
      {mounted && resolvedTheme === 'dark' ? (
        <Sun className="h-5 w-5 shrink-0" />
      ) : (
        <Moon className="h-5 w-5 shrink-0" />
      )}
      {!isCollapsed && (
        <span>{mounted && resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
      )}
    </button>
  );
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div
      className={cn(
        'relative flex flex-col border-r bg-sidebar transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo Section */}
      <div className="flex h-16 items-center border-b px-4">
        {!isCollapsed && (
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-black dark:bg-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 7 L2 12 L22 17" className="text-white dark:text-black" />
              </svg>
            </div>
            <span className="font-[family-name:var(--font-brand)] font-black italic tracking-tight leading-none" style={{ fontSize: '30px' }}>
              cresc.
            </span>
          </Link>
        )}
        {isCollapsed && (
          <Link href="/" className="flex items-center justify-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-black dark:bg-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 7 L2 12 L22 17" className="text-white dark:text-black" />
              </svg>
            </div>
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {navigationItems.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                isCollapsed && 'justify-center'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span>{item.title}</span>}
            </Link>
          );
        })}

        {/* Theme Toggle */}
        <div className="border-t mt-1 pt-2">
          <ThemeToggleNav isCollapsed={isCollapsed} />
        </div>
      </nav>

      {/* Update Notification */}
      <UpdateBanner isCollapsed={isCollapsed} />

      {/* Branding Card */}
      {!isCollapsed && (
        <div className="px-3 pb-3">
          <Card className="gap-0 border-border/50 py-0 overflow-hidden">
            <div className="flex items-center justify-center bg-muted/50 py-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-black dark:bg-white">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 7 L2 12 L22 17" className="text-white dark:text-black" />
                </svg>
              </div>
            </div>
            <CardContent className="px-4 py-4 text-center">
              <p className="font-[family-name:var(--font-brand)] text-base font-black italic">Crescendo</p>
              <p className="text-xs text-muted-foreground mt-0.5">by Orkestre AI</p>
              <AboutDialog>
                <Button size="sm" className="mt-3 w-full text-xs bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90">
                  Learn More
                </Button>
              </AboutDialog>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        className="absolute -right-3 top-20 z-10 h-6 w-6 rounded-full border bg-background shadow-md"
      >
        <ChevronLeft className={cn('h-4 w-4 transition-transform', isCollapsed && 'rotate-180')} />
      </Button>
    </div>
  );
}
