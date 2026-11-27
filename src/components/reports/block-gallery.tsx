'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

type Mode = 'screen' | 'print';

const MODES: { value: Mode; label: string }[] = [
  { value: 'screen', label: 'Screen' },
  { value: 'print', label: 'Print' },
];

/**
 * Every report block with its sample data, as a report shows it on screen
 * or on a printed page. The document sits in a sandboxed frame.
 */
export function BlockGallery() {
  const [mode, setMode] = useState<Mode>('screen');
  const src = `/api/reports/blocks/gallery/html?mode=${mode}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Rendering">
          {MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={mode === item.value}
              onClick={() => setMode(item.value)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                mode === item.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          Open in a new tab{mode === 'print' ? ' to print' : ''}
        </a>
      </div>
      <iframe
        key={mode}
        src={src}
        title={`Report blocks, ${mode} rendering`}
        sandbox="allow-scripts"
        className="h-[80vh] w-full rounded-lg border bg-background"
      />
    </div>
  );
}
