import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';

interface PageNavigationProps {
  prevId: string | null;
  nextId: string | null;
  currentIndex: number;
  total: number;
  liveOnly: boolean;
}

export function PageNavigation({
  prevId,
  nextId,
  currentIndex,
  total,
  liveOnly,
}: PageNavigationProps) {
  const qs = liveOnly ? '' : '?live=0';

  return (
    <div className="flex items-center gap-1">
      <Link href={`/${qs}`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </Link>
      <span className="mx-1 h-4 w-px bg-border" />
      {prevId ? (
        <Link href={`/pages/${prevId}${qs}`}>
          <Button variant="ghost" size="sm">
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
        </Link>
      ) : (
        <Button variant="ghost" size="sm" disabled>
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>
      )}
      {currentIndex > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {currentIndex} / {total}
        </span>
      )}
      {nextId ? (
        <Link href={`/pages/${nextId}${qs}`}>
          <Button variant="ghost" size="sm">
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      ) : (
        <Button variant="ghost" size="sm" disabled>
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
