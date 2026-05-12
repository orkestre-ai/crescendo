'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HelpDrawer } from '@/components/help/help-drawer';
import { cn } from '@/lib/utils';
import type { HelpContextKey } from '@/lib/help-content';

interface HelpButtonProps {
  contextKey?: HelpContextKey;
  className?: string;
}

export function HelpButton({ contextKey, className }: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className={cn('h-8 w-8 rounded-full', className)}
        aria-label="Open help"
      >
        <HelpCircle className="h-4 w-4" />
      </Button>
      <HelpDrawer open={open} onOpenChange={setOpen} contextKey={contextKey} />
    </>
  );
}
