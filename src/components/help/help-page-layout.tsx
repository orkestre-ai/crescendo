'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { HelpContentRenderer } from '@/components/help/help-content-renderer';
import { helpContent, type HelpContextKey } from '@/lib/help-content';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const contextKeys: HelpContextKey[] = [
  'dashboard',
  'page-detail:metrics',
  'page-detail:content',
  'page-detail:recommendations:generate',
  'page-detail:recommendations:explore',
  'page-detail:recommendations:chat',
  'settings:connections',
  'settings:sync',
  'settings:database',
  'ai-config',
  'ai-config:models',
  'ai-config:recommendations',
  'ai-config:explorations',
  'ai-config:chat-tools',
];

// Visual group labels for sidebar hierarchy
const sectionGroup: Record<HelpContextKey, string> = {
  dashboard: 'Dashboard',
  'page-detail:metrics': 'Page Detail',
  'page-detail:content': 'Page Detail',
  'page-detail:recommendations:generate': 'Page Detail',
  'page-detail:recommendations:explore': 'Page Detail',
  'page-detail:recommendations:chat': 'Page Detail',
  'settings:connections': 'Settings',
  'settings:sync': 'Settings',
  'settings:database': 'Settings',
  'ai-config': 'AI Config',
  'ai-config:models': 'AI Config',
  'ai-config:recommendations': 'AI Config',
  'ai-config:explorations': 'AI Config',
  'ai-config:chat-tools': 'AI Config',
};

function slugify(key: string): string {
  return key.replace(/:/g, '-');
}

export interface HelpPageLayoutProps {
  initialContext?: HelpContextKey;
}

export function HelpPageLayout({ initialContext }: HelpPageLayoutProps) {
  const [activeSection, setActiveSection] = useState<string>(
    initialContext ? slugify(initialContext) : 'dashboard'
  );
  const observerRef = useRef<IntersectionObserver | null>(null);
  const hasScrolled = useRef(false);

  // Scroll to initial context once on mount
  useEffect(() => {
    if (initialContext && !hasScrolled.current) {
      hasScrolled.current = true;
      const id = slugify(initialContext);
      // Defer so layout paints first
      const timer = setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setActiveSection(id);
        }
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [initialContext]);

  // IntersectionObserver — tracks which section is in the upper viewport
  useEffect(() => {
    const els = contextKeys
      .map((k) => document.getElementById(slugify(k)))
      .filter((el): el is HTMLElement => el !== null);

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const intersecting = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (intersecting.length > 0) {
          setActiveSection(intersecting[0].target.id);
        }
      },
      // Trigger when section enters the top third of the viewport
      { rootMargin: '-8% 0px -65% 0px', threshold: 0 }
    );

    els.forEach((el) => observerRef.current?.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  const scrollToSection = useCallback((id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="relative">
      {/* ── Mobile sticky top bar ───────────────────────────────── */}
      <div className="sticky top-0 z-20 lg:hidden -mx-6 px-6 py-3 mb-6 bg-background/95 backdrop-blur-sm border-b">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
            Jump to
          </span>
          <Select value={activeSection} onValueChange={scrollToSection}>
            <SelectTrigger className="h-8 text-sm flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {contextKeys.map((key) => (
                <SelectItem key={key} value={slugify(key)} className="text-sm">
                  {helpContent[key].title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Desktop layout: sidebar + content ───────────────────── */}
      <div className="flex gap-10">
        {/* Sidebar — self-start is the critical fix for sticky in flex layouts.
            Without it, the nav stretches to the full flex container height and
            sticky never activates because the element is always "at the top". */}
        <nav className="hidden lg:block w-52 shrink-0 self-start sticky top-0 pt-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Contents
          </p>
          <ul className="space-y-0.5">
            {contextKeys.map((key, idx) => {
              const slug = slugify(key);
              const isActive = activeSection === slug;
              const prevKey = contextKeys[idx - 1];
              const showGroupHeading =
                idx === 0 || (prevKey && sectionGroup[key] !== sectionGroup[prevKey]);

              return (
                <li key={key}>
                  {showGroupHeading && idx > 0 && (
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-5 mb-1.5 px-2">
                      {sectionGroup[key]}
                    </p>
                  )}
                  <button
                    onClick={() => scrollToSection(slug)}
                    className={cn(
                      'w-full text-left text-sm py-1.5 px-2 rounded-md transition-all duration-150',
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    )}
                  >
                    {helpContent[key].title}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold tracking-tight mb-1">Help Reference</h1>
          <p className="text-sm text-muted-foreground mb-10">
            Complete guide to all views, metrics, and features in Crescendo.
          </p>

          {contextKeys.map((key, idx) => (
            <div key={key}>
              <section id={slugify(key)} className="scroll-mt-4">
                <HelpContentRenderer context={helpContent[key]} />
              </section>
              {idx < contextKeys.length - 1 && <hr className="my-10 border-border/50" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
