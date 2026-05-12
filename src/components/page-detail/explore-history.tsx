'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Loader2, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ExploreResult {
  id: string;
  createdAt: string;
}

interface ExploreHistoryProps {
  results: ExploreResult[];
  currentResultId: string | null;
  isLoading: boolean;
  onSelect: (resultId: string) => void;
  onRefresh: () => void;
}

export function ExploreHistory({
  results,
  currentResultId,
  isLoading,
  onSelect,
  onRefresh,
}: ExploreHistoryProps) {
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) onRefresh();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          title="Exploration history"
        >
          <History className="h-3.5 w-3.5 mr-1" />
          History
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : results.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            No prior results
          </div>
        ) : (
          <ScrollArea className="max-h-64">
            {results.map((result) => {
              const isCurrent = result.id === currentResultId;
              return (
                <DropdownMenuItem
                  key={result.id}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${
                    isCurrent ? 'bg-accent' : ''
                  }`}
                  onClick={() => onSelect(result.id)}
                >
                  {isCurrent ? (
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  ) : (
                    <div className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="text-sm">
                    {formatDistanceToNow(new Date(result.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
