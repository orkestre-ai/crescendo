'use client';

import { useEffect, useState } from 'react';

/**
 * Semantic chart color keys matching --chart-1 through --chart-5
 */
export const CHART_ROLES = {
  conversionRate: '--chart-1',
  revenue: '--chart-1',
  pageViews: '--chart-1',
  oneTime: '--chart-1',
  recurring: '--chart-2',
} as const;

/**
 * Non-chart CSS variables needed by Recharts inline styles
 */
const UI_VARS = {
  mutedForeground: '--muted-foreground',
  border: '--border',
  card: '--card',
} as const;

export interface ChartColors {
  conversionRate: string;
  revenue: string;
  pageViews: string;
  oneTime: string;
  recurring: string;
  mutedForeground: string;
  border: string;
  card: string;
}

/**
 * Read a CSS custom property's computed value from the document root.
 * Returns the raw string (e.g. "oklch(0.48 0.14 200)") which Recharts
 * can use directly as a color value in SVG attributes.
 */
function getCSSVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readAllColors(): ChartColors {
  return {
    conversionRate: getCSSVar(CHART_ROLES.conversionRate),
    revenue: getCSSVar(CHART_ROLES.revenue),
    pageViews: getCSSVar(CHART_ROLES.pageViews),
    oneTime: getCSSVar(CHART_ROLES.oneTime),
    recurring: getCSSVar(CHART_ROLES.recurring),
    mutedForeground: getCSSVar(UI_VARS.mutedForeground),
    border: getCSSVar(UI_VARS.border),
    card: getCSSVar(UI_VARS.card),
  };
}

/**
 * React hook that returns resolved chart colors from CSS custom properties.
 * Re-reads when the document class changes (dark mode toggle).
 */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(readAllColors);

  useEffect(() => {
    // Re-read on mount (SSR hydration) and theme changes
    setColors(readAllColors());

    const observer = new MutationObserver(() => {
      setColors(readAllColors());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return colors;
}

/**
 * Tailwind classes for legend dots using chart color variables.
 * These use the Tailwind `bg-chart-N` utilities mapped in @theme inline.
 */
export const LEGEND_DOT_CLASSES = {
  oneTime: 'bg-chart-1',
  recurring: 'bg-chart-2',
} as const;

/**
 * Tailwind classes for icon badges in card headers.
 * Uses primary color for consistency across themes.
 */
export const ICON_BADGE_CLASSES = {
  donations: 'bg-primary/10 text-primary',
  avgGift: 'bg-primary/10 text-primary',
  revenue: 'bg-primary/10 text-primary',
} as const;
