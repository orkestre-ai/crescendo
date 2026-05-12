'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export interface SnapshotListItem {
  id: string;
  contentHash: string | null;
  validFrom: string;
  validTo: string | null;
  capturedAt: string;
  metaTitle: string | null;
}

interface SnapshotHistoryProps {
  snapshots: SnapshotListItem[];
  currentId: string | null;
  isLoading: boolean;
  onSelect: (snapshotId: string) => void;
  onRefresh: () => void;
}

export function SnapshotHistory({
  snapshots,
  currentId,
  isLoading,
  onSelect,
  onRefresh,
}: SnapshotHistoryProps) {
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
          title="Snapshot history"
        >
          <History className="h-3.5 w-3.5 mr-1" />
          History
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : snapshots.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            No snapshots yet
          </div>
        ) : (
          <ScrollArea className="max-h-72">
            {snapshots.map((snap) => (
              <DropdownMenuItem
                key={snap.id}
                className={`flex flex-col items-start gap-1 px-3 py-2 cursor-pointer ${
                  snap.id === currentId ? 'bg-accent' : ''
                }`}
                onClick={() => onSelect(snap.id)}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-sm font-medium">
                    {format(new Date(snap.validFrom), 'MMM d, yyyy')}
                  </span>
                  {snap.contentHash ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 border-green-300 text-green-700"
                    >
                      Content changed
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 border-gray-300 text-gray-500"
                    >
                      Legacy
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground truncate w-full">
                  {snap.metaTitle || 'Untitled'}
                </span>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Format the active date range for a snapshot (per D-16).
 * "Active: Apr 5 - Apr 19" for historical, "Active since Apr 19" for current.
 */
export function formatSnapshotDateRange(
  validFrom: string | Date,
  validTo: string | Date | null
): string {
  const from = format(new Date(validFrom), 'MMM d, yyyy');
  if (!validTo) {
    return `Active since ${from}`;
  }
  const to = format(new Date(validTo), 'MMM d, yyyy');
  return `Active: ${from} \u2013 ${to}`;
}
