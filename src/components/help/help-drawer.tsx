'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HelpContentRenderer } from '@/components/help/help-content-renderer';
import { useHelpContext } from '@/hooks/use-help-context';
import { helpContent, type HelpContextKey } from '@/lib/help-content';

interface HelpDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextKey?: HelpContextKey;
}

function HelpDrawerInner({ open, onOpenChange, contextKey }: HelpDrawerProps) {
  const detectedKey = useHelpContext();
  const activeKey = contextKey || detectedKey;
  const context = helpContent[activeKey];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col w-[50vw] min-w-[400px] max-w-full">
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <SheetTitle>Help</SheetTitle>
          <SheetDescription>{context.title}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-6">
            <HelpContentRenderer context={context} />
          </div>
        </ScrollArea>

        <SheetFooter className="px-6 py-4 border-t shrink-0">
          <Link
            href={`/help?context=${encodeURIComponent(activeKey)}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            onClick={() => onOpenChange(false)}
          >
            View full help reference →
          </Link>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function HelpDrawer(props: HelpDrawerProps) {
  return (
    <Suspense fallback={null}>
      <HelpDrawerInner {...props} />
    </Suspense>
  );
}
